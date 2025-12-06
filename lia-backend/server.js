// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// ========================
// Configuración básica
// ========================
dotenv.config();

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Supabase (service role, para poder leer todo)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn(
    "[LIA BACKEND] Advertencia: Falta SUPABASE_URL o KEY en .env. La base de datos no funcionará."
  );
} else {
  supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
}

// ========================
// Helpers
// ========================
function formatDateEs(dateStr) {
  if (!dateStr) return "sin fecha";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTrendText(lastScore, prevScore) {
  if (prevScore == null) return "Sin tendencia clara (pocos datos).";
  if (lastScore > prevScore + 5) return "Tendencia al alza (mejorando).";
  if (lastScore < prevScore - 5) return "Tendencia a la baja (empeorando).";
  return "Tendencia estable.";
}

function scoreToRisk(score) {
  if (score == null) return "desconocido";
  if (score >= 67) return "riesgo BAJO (Zona Verde)";
  if (score >= 34) return "riesgo MEDIO (Zona Atenta)";
  return "riesgo ALTO (Zona Crítica)";
}

// ========================
// 1. Contexto para TRABAJADOR
// ========================
async function getWorkerContextFromSupabase(workerId) {
  try {
    if (!supabase || !workerId) {
      console.warn("[worker] Supabase no inicializado o workerId vacío:", { workerId });
      return null;
    }

    console.log("[worker] 🔍 Buscando mediciones para workerId:", workerId);
    console.log("[worker] 🔍 Supabase inicializado:", !!supabase);

    // PRIMERO: Obtener nombre del usuario desde profiles
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", workerId)
      .single();

    let userName = profileData?.username || null;
    if (profileError) {
      console.warn("[worker] ⚠️ No se pudo obtener nombre del usuario:", profileError.message);
    } else if (userName) {
      console.log("[worker] 👤 Nombre obtenido:", userName);
    }

    // SEGUNDO: Obtener mediciones
    const { data, error } = await supabase
      .from("measurements")
      .select("created_at, combined_score, stress_level, workload_level")
      .eq("user_id_uuid", workerId)
      .order("created_at", { ascending: false })
      .limit(8); // Traemos los últimos 8 para ver historia

    if (error) {
      console.error("[worker] ❌ Error Supabase:", error);
      return null;
    }

    console.log("[worker] ✅ Query exitosa. Registros encontrados:", data?.length || 0);

    if (!data || data.length === 0) {
      console.warn("[worker] ⚠️ No hay mediciones para este usuario");
      return null;
    }

    const last = data[0]; // El más reciente
    const prev = data[1]; // El anterior

    // Filtrar scores válidos
    const scores = data
      .map((m) => m.combined_score)
      .filter((s) => typeof s === "number");

    // Calcular promedio simple
    const avg =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;

    const lastScore = typeof last.combined_score === "number" ? last.combined_score : avg;
    const risk = scoreToRisk(lastScore);
    const trend = getTrendText(lastScore, prev?.combined_score);
    
    // Información extra (estrés y carga)
    const extraInfo = [];
    if (typeof last.stress_level === "number") extraInfo.push(`Nivel de estrés reportado: ${last.stress_level}/10`);
    if (typeof last.workload_level === "number") extraInfo.push(`Carga laboral percibida: ${last.workload_level}/10`);

    const contextStr = `
DATOS DEL USUARIO (Supabase):
- Última medición: ${formatDateEs(last.created_at)}.
- Score bienestar actual: ${lastScore ?? "N/A"} (${risk}).
- Promedio histórico reciente: ${avg ?? "N/A"}.
- ${trend}
${extraInfo.length > 0 ? "- " + extraInfo.join(". ") : ""}

INSTRUCCIÓN: Usa estos datos para personalizar tu respuesta. Si el score es bajo, sé más empático. Si mejoró, felicítalo.
`;
    
    console.log("[worker] ✅ Contexto generado correctamente para usuario:", workerId.slice(0, 8));
    return contextStr;
  } catch (err) {
    console.error("[worker] Excepción:", err);
    return null;
  }
}


// ========================
// 2. Contexto para EQUIPO (Empleador)
// ========================
async function getTeamContextFromSupabase(teamName) {
  try {
    if (!supabase || !teamName) {
      console.warn("[team] Supabase no inicializado o teamName vacío:", { teamName });
      return null;
    }

    console.log("[team] 🔍 Buscando mediciones para equipo:", teamName);

    // PASO 1: Obtener IDs de las personas que pertenecen al equipo
    const { data: profiles, error: errorProfiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("department", teamName);

    if (errorProfiles) {
      console.error("[team] ❌ Error leyendo profiles:", errorProfiles);
      return null;
    }

    console.log("[team] 👥 Usuarios del equipo encontrados:", profiles?.length || 0);

    if (!profiles || profiles.length === 0) {
      return `No se encontraron empleados registrados en el departamento "${teamName}".`;
    }

    const userIds = profiles.map((p) => p.id);

    // PASO 2: Obtener mediciones SOLO de esos usuarios
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - 60); // Ampliar a 60 días para capturar más datos

    const { data: measurements, error: errorMeas } = await supabase
      .from("measurements")
      .select("user_id_uuid, created_at, combined_score, stress_level, workload_level, work_hours")
      .in("user_id_uuid", userIds)
      .gte("created_at", daysAgo.toISOString());

    if (errorMeas) {
      console.error("[team] ❌ Error leyendo measurements:", errorMeas);
      return null;
    }

    console.log("[team] 📊 Mediciones encontradas:", measurements?.length || 0);

    if (!measurements || measurements.length === 0) {
      return `El equipo "${teamName}" no tiene mediciones registradas en los últimos 15 días.`;
    }

    // PASO 3: Quedarse solo con la ÚLTIMA medición de cada persona
    const lastByUser = {};
    measurements.forEach((m) => {
      const current = lastByUser[m.user_id_uuid];
      if (!current || new Date(m.created_at) > new Date(current.created_at)) {
        lastByUser[m.user_id_uuid] = m;
      }
    });

    const uniqueRecords = Object.values(lastByUser);
    const totalPeople = uniqueRecords.length;

    // Calcular promedios del equipo
    const scores = uniqueRecords.map(m => m.combined_score).filter(s => typeof s === 'number');
    const stressLevels = uniqueRecords.map(m => m.stress_level).filter(s => typeof s === 'number');
    const workloads = uniqueRecords.map(m => m.workload_level).filter(s => typeof s === 'number');
    const workHours = uniqueRecords.map(m => m.work_hours).filter(s => typeof s === 'number');

    const avgScore = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
    const avgStress = stressLevels.length ? (stressLevels.reduce((a,b)=>a+b,0)/stressLevels.length).toFixed(1) : 0;
    const avgWorkload = workloads.length ? (workloads.reduce((a,b)=>a+b,0)/workloads.length).toFixed(1) : 0;
    const avgWorkHours = workHours.length ? (workHours.reduce((a,b)=>a+b,0)/workHours.length).toFixed(1) : 0;

    const risk = scoreToRisk(avgScore);
    const highRiskCount = scores.filter(s => s < 34).length;

    const contextStr = `
DATOS DEL EQUIPO "${teamName}" (Últimos 15 días):
- Personas activas evaluadas: ${totalPeople}.
- Promedio de Bienestar del Equipo: ${avgScore} (${risk}).
- Promedio de Estrés Reportado: ${avgStress}/10.
- Promedio de Carga Laboral: ${avgWorkload}/10.
- Promedio de Horas de Trabajo: ${avgWorkHours}h.
- Personas en "Zona Crítica" (Riesgo Alto): ${highRiskCount} de ${totalPeople}.

INSTRUCCIÓN: Como Lia Coach, analiza estos números reales del equipo. Si el estrés es alto (>6), el bienestar bajo (<50), o trabajan muchas horas (>8), sugiere acciones concretas y urgentes. Nunca menciones datos individuales de trabajadores, solo habla del equipo.
`;

    console.log("[team] ✅ Contexto del equipo generado correctamente");
    return contextStr;
  } catch (err) {
    console.error("[team] ❌ Excepción:", err);
    return null;
  }
}

// ========================
// RUTA: Chat TRABAJADOR
// ========================
app.post("/api/lia-chat", async (req, res) => {
  const { messages, workerId, userName: userNameFromFrontend } = req.body;

  console.log("🔍 DIAGNÓSTICO CHAT -> ID Recibido:", workerId);
  console.log("👤 Nombre usuario (del frontend):", userNameFromFrontend || "No enviado");
  console.log("📨 Mensajes recibidos:", messages?.length || 0);
  
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'Faltan mensajes.' });
  }

  try {
    let systemData = "No hay datos previos disponibles. Asume que es un usuario nuevo.";
    let userNameFromDB = null;
    
    // Si viene workerId, buscamos su historial real Y su nombre
    if (workerId) {
      console.log("📊 Intentando obtener contexto del trabajador...");
      
      // Obtener nombre desde la BD
      const { data: profileData } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", workerId)
        .single();
      
      if (profileData?.username) {
        userNameFromDB = profileData.username;
        console.log("👤 Nombre obtenido de BD:", userNameFromDB);
      }
      
      const context = await getWorkerContextFromSupabase(workerId);
      if (context) {
        systemData = context;
        console.log("✅ Contexto obtenido correctamente");
      } else {
        console.warn("⚠️ No se pudo obtener contexto (sin datos en BD)");
      }
    } else {
      console.warn("⚠️ No se recibió workerId");
    }

    // Usar nombre de BD si existe, si no, usar del frontend, si no, usar genérico
    const userName = userNameFromDB || userNameFromFrontend || "Usuario";

    const chatMessages = [
      {
        role: "system",
        content: `
Eres "Lia", compañera de bienestar IA del usuario ${userName}.
Tono: Cálido, empático, breve, personal y en ESPAÑOL de Chile (neutro).
IMPORTANTE: Siempre saluda al usuario por su nombre "${userName}" de forma natural en tu primera respuesta.

INFORMACIÓN DEL USUARIO:
${systemData}

OBJETIVO:
Responder al usuario basándote en sus datos (si existen).
- Si su score bajó, pregunta qué pasó.
- Si está bien, felicítalo.
- Máximo 3 o 4 oraciones.
- Da 1 consejo práctico si corresponde.
`
      },
      ...messages
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // O gpt-3.5-turbo si prefieres
      messages: chatMessages,
      temperature: 0.6,
      max_tokens: 300,
    });

    const reply = completion.choices[0]?.message?.content || "No pude procesar tu respuesta.";
    res.json({ reply });

  } catch (error) {
    console.error("Error Lia Chat:", error);
    res.status(500).json({ error: "Error interno." });
  }
});

// ========================
// RUTA: Chat EMPLEADOR (Coach)
// ========================
app.post("/api/employer-assistant", async (req, res) => {
  const { messages, teamName, teamContext, managerName } = req.body;

  console.log("🔍 DIAGNÓSTICO EMPLOYER");
  console.log("   Equipo:", teamName);
  console.log("   Manager:", managerName || "Sin nombre");
  console.log("   Mensajes recibidos:", messages?.length || 0);
  console.log("   TeamContext recibido:", !!teamContext);

  if (!Array.isArray(messages)) return res.status(400).json({ error: 'Faltan mensajes.' });

  try {
    let teamData = "No se especificó equipo o no hay datos.";
    
    // Opción 1: Si el frontend envía teamContext directamente
    if (teamContext) {
      console.log("✅ Usando teamContext enviado desde el frontend");
      teamData = teamContext;
    }
    // Opción 2: Si el backend debe obtenerlo de la BD
    else if (teamName) {
      console.log("📊 Intentando obtener contexto del equipo desde BD...");
      const context = await getTeamContextFromSupabase(teamName);
      if (context) {
        teamData = context;
        console.log("✅ Contexto obtenido correctamente del backend");
      } else {
        console.warn("⚠️ No se pudo obtener contexto (sin datos en BD)");
      }
    } else {
      console.warn("⚠️ No se recibió teamName ni teamContext");
    }

    console.log("📝 Contexto final que será usado:");
    console.log(teamData);

    const managerGreeting = managerName || "Manager";

    const chatMessages = [
      {
        role: "system",
        content: `Eres "Lia Coach", experta en liderazgo y bienestar corporativo.
Eres el asistente de ${managerGreeting} para analizar el bienestar del equipo.
Tono: Profesional, empático, directo y en ESPAÑOL de Chile (neutro).
IMPORTANTE: Saluda al manager por su nombre "${managerGreeting}" de forma natural en tu primera respuesta.

DATOS DEL EQUIPO:
${teamData}

FORMATO DE RESPUESTA:
1. Diagnóstico breve basado en datos reales (1-2 frases).
2. 3 Acciones Concretas (bullets prácticos).
3. Una pregunta de reflexión.

Usa los números reales provistos. Si hay riesgo alto o estrés elevado, sugiere intervención urgente.`
      },
      ...messages
    ];

    console.log("[EMPLOYER-ASSISTANT] Enviando a OpenAI con prompt del sistema personalizado...");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: chatMessages,
      temperature: 0.6,
      max_tokens: 500,
    });

    const reply = completion.choices[0]?.message?.content || "Sin respuesta.";
    console.log("[EMPLOYER-ASSISTANT] ✅ Respuesta generada correctamente");
    res.json({ reply });

  } catch (error) {
    console.error("[EMPLOYER-ASSISTANT] ❌ Error:", error);
    res.status(500).json({ error: "Error interno al procesar solicitud." });
  }
});

// ========================
// RUTA: Obtener mediciones raw (para dashboard)
// ========================
app.get("/api/measurements/raw", async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: "Base de datos no configurada" });
  }

  try {
    // Obtener todas las mediciones con información del usuario
    const { data: measurements, error } = await supabase
      .from("measurements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500); // Limitar a últimas 500 mediciones

    if (error) {
      console.error("[measurements/raw] Error:", error);
      return res.status(500).json({ error: "Error al obtener mediciones" });
    }

    res.json({
      success: true,
      count: measurements?.length || 0,
      data: measurements || []
    });
  } catch (err) {
    console.error("[measurements/raw] Excepción:", err);
    res.status(500).json({ error: "Error interno" });
  }
});

// ========================
// Server Start
// ========================
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Lia Backend listo en puerto ${port}`);
});
