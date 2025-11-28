// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

// 1) Cargar variables de entorno
dotenv.config();

// 2) Inicializar Supabase de forma segura
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn(
    "⚠️ SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no están definidas. El backend funcionará sin leer datos del dashboard."
  );
} else {
  supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
}

// 3) Inicializar Express y OpenAI
const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// -----------------------------
// Helpers comunes
// -----------------------------

// Equipos conocidos (coinciden con profiles.department)
const KNOWN_TEAMS = [
  "Operaciones",
  "Ventas",
  "Administración",
  "TI",
  "Marketing",
  "Salud",
];

function detectTeamFromText(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const team of KNOWN_TEAMS) {
    if (lower.includes(team.toLowerCase())) return team;
  }
  return null;
}

const isValidNumber = (n) =>
  typeof n === "number" && !Number.isNaN(n);

function average(nums) {
  const filtered = nums.filter(isValidNumber);
  if (!filtered.length) return null;
  const sum = filtered.reduce((a, b) => a + b, 0);
  return Number((sum / filtered.length).toFixed(1));
}

function formatDate(dateStr) {
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

// -----------------------------
// Supabase: contexto trabajador
// -----------------------------
async function getWorkerContextFromSupabase(workerId) {
  try {
    if (!supabase || !workerId) return null;

    const { data, error } = await supabase
      .from("measurements")
      .select("*")
      .eq("user_id_uuid", workerId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Error leyendo measurements (worker):", error);
      return null;
    }

    if (!data || data.length === 0) return null;

    const row = data[0];

    const resumen = `
Trabajador: ${workerId}
Fecha última medición: ${formatDate(row.created_at)}
Score combinado (0–100): ${row.combined_score ?? "N/D"}
Emoción facial detectada: ${row.face_emotion ?? "N/D"}
Ruido ambiente (dB): ${row.noise_db ?? "N/D"}
Body scan promedio: ${row.body_scan_avg ?? "N/D"}
Nivel de estrés reportado (1–10): ${row.stress_level ?? "N/D"}
Carga de trabajo percibida (1–10): ${row.workload_level ?? "N/D"}
Ritmo de trabajo percibido (1–10): ${row.work_pace_level ?? "N/D"}
Entrada de diario (si existe): ${row.journal_entry ?? "sin registro"}
`.trim();

    return resumen;
  } catch (err) {
    console.error("Excepción en getWorkerContextFromSupabase:", err);
    return null;
  }
}

// -----------------------------
// Supabase: métricas por equipo
// -----------------------------
async function getTeamMetricsFromSupabase(teamName) {
  try {
    if (!supabase) {
      console.warn(
        "Supabase no inicializado; devolviendo null en getTeamMetricsFromSupabase"
      );
      return null;
    }

    // 1) Buscar personas del equipo en profiles
    const { data: profiles, error: errorProfiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("department", teamName);

    if (errorProfiles) {
      console.error("Error leyendo profiles (equipo):", errorProfiles);
      return null;
    }

    if (!profiles || profiles.length === 0) {
      return null;
    }

    const userIds = profiles.map((p) => p.id);

    // 2) Medidas de esos usuarios
    const { data: measurements, error: errorMeas } = await supabase
      .from("measurements")
      .select("*")
      .in("user_id_uuid", userIds);

    if (errorMeas) {
      console.error("Error leyendo measurements (equipo):", errorMeas);
      return null;
    }

    if (!measurements || measurements.length === 0) {
      return null;
    }

    // 3) Última medición por persona
    const lastByUser = {};
    for (const m of measurements) {
      const uid = m.user_id_uuid;
      if (!uid) continue;
      if (!lastByUser[uid]) {
        lastByUser[uid] = m;
      } else if (
        new Date(m.created_at) > new Date(lastByUser[uid].created_at)
      ) {
        lastByUser[uid] = m;
      }
    }

    const lastMeasurements = Object.values(lastByUser);
    const personasConMedicion = lastMeasurements.length;
    const todasFechas = lastMeasurements.map((m) => m.created_at);
    const lastDate =
      todasFechas.length > 0
        ? formatDate(
            todasFechas.reduce((a, b) =>
              new Date(a) > new Date(b) ? a : b
            )
          )
        : "sin fecha";

    const scores = lastMeasurements.map((m) => m.combined_score);
    const avgScore = average(scores);

    const stressVals = lastMeasurements.map((m) => m.stress_level);
    const avgStress = average(stressVals);

    const workloadVals = lastMeasurements.map(
      (m) => m.workload_level
    );
    const avgWorkload = average(workloadVals);

    const noiseVals = lastMeasurements.map((m) => m.noise_db);
    const avgNoise = average(noiseVals);

    // Emoción predominante
    const emotionCounts = {};
    for (const m of lastMeasurements) {
      const e = m.face_emotion || "sin_dato";
      emotionCounts[e] = (emotionCounts[e] || 0) + 1;
    }
    const dominantEmotion =
      Object.keys(emotionCounts).reduce((a, b) =>
        emotionCounts[a] >= emotionCounts[b] ? a : b
      ) || "sin_dato";

    // Nivel de riesgo según score promedio
    let riskLevel = "Sin datos";
    if (isValidNumber(avgScore)) {
      if (avgScore < 60) riskLevel = "Alto";
      else if (avgScore < 75) riskLevel = "Medio";
      else riskLevel = "Bajo";
    }

    // 4) Última nota de RRHH para alguien del equipo
    let lastHrNoteText = null;
    if (userIds.length > 0) {
      const { data: hrNotes, error: hrError } = await supabase
        .from("hr_notes")
        .select("*")
        .in("employee_id", userIds)
        .order("created_at", { ascending: false })
        .limit(1);

      if (hrError) {
        console.error("Error leyendo hr_notes:", hrError);
      } else if (hrNotes && hrNotes.length > 0) {
        lastHrNoteText = hrNotes[0].note_text;
      }
    }

    const resumen = `
Equipo: ${teamName}
Personas en el equipo (profiles): ${profiles.length}
Personas con al menos una medición: ${personasConMedicion}
Fecha de la última medición registrada: ${lastDate}
Score combinado promedio (últimos registros, 0–100): ${
      avgScore ?? "N/D"
    }
Nivel de riesgo estimado: ${riskLevel}
Emoción predominante en el último registro por persona: ${dominantEmotion}
Promedio de estrés auto-reportado (1–10): ${avgStress ?? "N/D"}
Promedio de carga de trabajo percibida (1–10): ${avgWorkload ?? "N/D"}
Promedio de ruido ambiental (dB): ${avgNoise ?? "N/D"}
Última nota de RRHH relacionada: ${
      lastHrNoteText ? `"${lastHrNoteText}"` : "sin notas recientes"
    }
`.trim();

    return resumen;
  } catch (err) {
    console.error("Excepción en getTeamMetricsFromSupabase:", err);
    return null;
  }
}

// -----------------------------
// Ruta: Chat app trabajador
// -----------------------------
app.post("/api/lia-chat", async (req, res) => {
  const { messages, workerId } = req.body; // workerId opcional

  if (!messages || !Array.isArray(messages)) {
    return res
      .status(400)
      .json({ error: "messages es requerido y debe ser un arreglo" });
  }

  try {
    let workerSummary = "";
    if (workerId) {
      const supabaseWorkerContext = await getWorkerContextFromSupabase(
        workerId
      );
      if (supabaseWorkerContext) {
        workerSummary = supabaseWorkerContext;
      } else {
        workerSummary =
          "No se encontraron datos recientes en la base para este trabajador. Responde usando la escala de bienestar general y supuestos razonables.";
      }
    } else {
      workerSummary =
        "No se entregó un identificador de trabajador. Usa sólo la información de la conversación y la escala de bienestar general.";
    }

    const chatMessages = [
      {
        role: "system",
        content: `
Eres **Lia**, una asistente digital de bienestar laboral.

CONTEXTO DE DATOS:
- Tienes este resumen (si existe) sobre la última medición del trabajador:
---
${workerSummary}
---
- La app mide rostro (emociones), ruido ambiental, body scan y una encuesta de contexto laboral, y calcula un **score combinado de 0 a 100**.

TU ESTILO:
- Responde SIEMPRE en ESPAÑOL, con tono cercano, cálido y profesional.
- Usa 3 a 6 frases como máximo, salvo que el usuario pida más detalle.

INTERPRETACIÓN DEL SCORE COMBINADO:
- 85–100: bienestar muy bueno → refuerza hábitos positivos.
- 70–84: bienestar bueno → sugiere pequeños ajustes preventivos.
- 50–69: zona intermedia → hay señales leves de alerta; propone acciones concretas.
- 0–49: zona de cuidado → anima a pedir apoyo, bajar exigencias si se puede y consultar a un profesional si el malestar es intenso o sostenido.

OBJETIVO EN CADA RESPUESTA:
1) Ayudar a entender el resultado o cómo se siente la persona.
2) Proponer 2 o 3 recomendaciones prácticas (físicas, mentales o emocionales).
3) Si hay síntomas fuertes o ideas de hacerse daño, anima a buscar ayuda profesional. No diagnostiques enfermedades.

Puedes hacer 1 pregunta breve al final sólo si realmente ayuda a orientar mejor las recomendaciones.
      `.trim(),
      },
      ...messages,
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: chatMessages,
      temperature: 0.6,
      max_tokens: 400,
    });

    const replyMessage = completion.choices[0]?.message;
    const replyText =
      replyMessage?.content ||
      "Lo siento, no pude generar una respuesta en este momento.";

    return res.json({ reply: replyText });
  } catch (err) {
    console.error("Error en /api/lia-chat:", err);
    return res.status(500).json({
      error: "Error al generar respuesta. Inténtalo de nuevo en unos minutos.",
    });
  }
});

// -----------------------------
// Ruta: Asistente empleador (Lia Coach)
// -----------------------------
app.post("/api/employer-assistant", async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res
        .status(400)
        .json({ error: "messages es requerido y debe ser un arreglo" });
    }

    const lastUserMessage =
      [...messages].reverse().find((m) => m.role !== "assistant") ||
      null;
    const userText = lastUserMessage?.content || "";
    const detectedTeam = detectTeamFromText(userText);

    let supabaseSummary = "";
    if (detectedTeam) {
      const metricsText = await getTeamMetricsFromSupabase(detectedTeam);
      if (metricsText) {
        supabaseSummary = metricsText;
      } else {
        supabaseSummary = `No se encontraron datos recientes en Lia para el equipo "${detectedTeam}". Usa supuestos de riesgo MEDIO, pero deja claro que faltan datos en el dashboard.`;
      }
    } else {
      supabaseSummary =
        "No se detectó un equipo específico en la pregunta. Usa un nivel de riesgo MEDIO por defecto y propuestas generales para equipos.";
    }

    const chatMessages = [
      {
        role: "system",
        content: `
Eres "Lia Coach", un asistente de gamificación y bienestar para empleadores y líderes de equipo.
Siempre respondes en ESPAÑOL, con tono cercano pero profesional.

CONTEXTO DE DATOS DEL EQUIPO:
---
${supabaseSummary}
---
Nunca inventes números concretos; si algo no está en los datos, dilo explícito.

TU OBJETIVO:
- Ayudar a líderes a **actuar rápido** sobre sus equipos.
- Responder de forma **corta, precisa y accionable**.

REGLAS DE ESTILO (OBLIGATORIAS):
1) Responde SIEMPRE con esta estructura:
   - 1 frase de diagnóstico general.
   - 3 bullets de acciones concretas para esta semana (1 línea cada una).
   - 1 frase de cierre opcional.
2) Nada de párrafos largos ni explicaciones técnicas.
3) No hagas más de 1 pregunta al final, sólo si ayuda a afinar el plan.

CÓMO USAR LOS DATOS:
- Si hay datos de Supabase:
  - Usa score promedio, riesgo estimado, estrés, ruido, etc. para justificar TU diagnóstico en 1 frase.
  - Ajusta la intensidad de las acciones (más contención si el riesgo es alto, más refuerzo/previsión si es bajo).
- Si NO hay datos:
  - Asume riesgo MEDIO.
  - Enfócate en prevención básica y en incentivar mediciones.

Recuerda: eres una herramienta para que el líder sepa **qué hacer esta semana**, no para dar teoría.
      `.trim(),
      },
      ...messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: chatMessages,
      temperature: 0.4,
      max_tokens: 400,
    });

    const replyMessage = completion.choices[0]?.message;
    const replyText =
      replyMessage?.content ||
      "Lo siento, no pude generar una respuesta en este momento.";

    res.json({ reply: replyText });
  } catch (error) {
    console.error("Error en /api/employer-assistant:", error);
    res.status(500).json({ error: "Error interno en Lia Coach" });
  }
});

// -----------------------------
// Healthcheck
// -----------------------------
app.get("/", (req, res) => {
  res.send("Lia backend OK");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Lia backend escuchando en http://localhost:${port}`);
});
