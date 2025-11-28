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

    // Leemos las columnas REALES que guardas desde el front
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

    console.log("[team] Buscando mediciones para equipo:", teamName);

    // NOTA: La tabla profiles puede tener estructura diferente
    // Por ahora, asumimos que podemos filtrar directamente en measurements
    // usando la información disponible en esa tabla
    
    // Obtener mediciones del equipo en los últimos 15 días
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - 15);

    // OPCIÓN 1: Si existe una relación department en measurements
    const { data: measurements, error: errorMeas } = await supabase
      .from("measurements")
      .select("user_id_uuid, created_at, combined_score, stress_level, department")
      .eq("department", teamName)
      .gte("created_at", daysAgo.toISOString());

    if (errorMeas && errorMeas.message.includes("column")) {
      // Si no existe la columna department en measurements, intenta sin filtro
      console.warn("[team] Columna 'department' no existe en measurements");
      return null;
    }

    if (errorMeas) {
      console.error("[team] Error leyendo measurements:", errorMeas);
      return null;
    }

    console.log("[team] Mediciones encontradas:", measurements?.length || 0);

    if (errorMeas) {
      console.error("[team] Error leyendo measurements:", errorMeas);
      return null;
    }

    if (!measurements || measurements.length === 0) {
      return `El equipo "${teamName}" no tiene mediciones registradas en los últimos 15 días.`;
    }

    // C) Lógica: Quedarse solo con la ÚLTIMA medición de cada persona para no duplicar
    const lastByUser = {};
    measurements.forEach((m) => {
      const current = lastByUser[m.user_id_uuid];
      // Si no existe o la nueva fecha es más reciente, reemplazamos
      if (!current || new Date(m.created_at) > new Date(current.created_at)) {
        lastByUser[m.user_id_uuid] = m;
      }
    });

    const uniqueRecords = Object.values(lastByUser);
    const totalPeople = uniqueRecords.length;

    // Calcular promedios del equipo actual
    const scores = uniqueRecords.map(m => m.combined_score).filter(s => typeof s === 'number');
    const stressLevels = uniqueRecords.map(m => m.stress_level).filter(s => typeof s === 'number');

    const avgScore = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0;
    const avgStress = stressLevels.length ? (stressLevels.reduce((a,b)=>a+b,0)/stressLevels.length).toFixed(1) : 0;

    const risk = scoreToRisk(avgScore);
    
    // Contar cuántos están en riesgo alto (< 34 score)
    const highRiskCount = scores.filter(s => s < 34).length;

    return `
DATOS DEL EQUIPO "${teamName}" (Últimos 15 días):
- Personas activas evaluadas: ${totalPeople}.
- Promedio de Bienestar del Equipo: ${avgScore} (${risk}).
- Promedio de Estrés: ${avgStress}/10.
- Personas en "Zona Crítica" (Riesgo Alto): ${highRiskCount} de ${totalPeople}.

INSTRUCCIÓN: Como Lia Coach, analiza estos números. Si el estrés es alto (>5) o el bienestar bajo (<50), sugiere acciones de desconexión o teambuilding.
`;
  } catch (err) {
    console.error("[team] Excepción:", err);
    return null;
  }
}

// ========================
// RUTA: Chat TRABAJADOR
// ========================
app.post("/api/lia-chat", async (req, res) => {
  const { messages, workerId } = req.body;

  console.log("🔍 DIAGNÓSTICO CHAT -> ID Recibido:", workerId);
  console.log("📨 Mensajes recibidos:", messages?.length || 0);
  
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'Faltan mensajes.' });
  }

  try {
    let systemData = "No hay datos previos disponibles. Asume que es un usuario nuevo.";
    
    // Si viene workerId, buscamos su historial real
    if (workerId) {
      console.log("📊 Intentando obtener contexto del trabajador...");
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

    const chatMessages = [
      {
        role: "system",
        content: `
Eres "Lia", compañera de bienestar IA.
Tono: Cálido, empático, breve y en ESPAÑOL de Chile (neutro).

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
  const { messages, teamName } = req.body;

  if (!Array.isArray(messages)) return res.status(400).json({ error: 'Faltan mensajes.' });

  try {
    let teamData = "No se especificó equipo o no hay datos.";
    
    if (teamName) {
      const context = await getTeamContextFromSupabase(teamName);
      if (context) teamData = context;
    }

    const chatMessages = [
      {
        role: "system",
        content: `
Eres "Lia Coach", experta en liderazgo y bienestar corporativo.
Respondes a un Manager sobre su equipo.

DATOS DEL EQUIPO:
${teamData}

FORMATO DE RESPUESTA:
1. Diagnóstico breve (1 frase basada en los datos).
2. 3 Acciones Concretas (Bullets).
3. Cierre motivador.

Usa los números reales provistos. Si hay riesgo alto, sugiere intervención urgente.
`
      },
      ...messages
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: chatMessages,
      temperature: 0.5,
      max_tokens: 400,
    });

    const reply = completion.choices[0]?.message?.content || "Sin respuesta.";
    res.json({ reply });

  } catch (error) {
    console.error("Error Lia Coach:", error);
    res.status(500).json({ error: "Error interno." });
  }
});

// ========================
// Server Start
// ========================
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Lia Backend listo en puerto ${port}`);
});
