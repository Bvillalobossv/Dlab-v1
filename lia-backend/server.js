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

// Supabase (service role, SOLO en el backend)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase = null;
if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn(
    "[LIA BACKEND] Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno."
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
  if (lastScore > prevScore + 5) return "Tendencia al alza.";
  if (lastScore < prevScore - 5) return "Tendencia a la baja.";
  return "Tendencia estable.";
}

function scoreToRisk(score) {
  if (score == null) return "desconocido";
  if (score >= 75) return "riesgo bajo";
  if (score >= 50) return "riesgo medio";
  return "riesgo alto";
}

// ========================
// Supabase: trabajador
// ========================
async function getWorkerContextFromSupabase(workerId) {
  try {
    if (!supabase || !workerId) return null;

    const { data, error } = await supabase
      .from("measurements")
      .select("created_at, global_score, risk_level")
      .eq("user_id_uuid", workerId)
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) {
      console.error("[worker] Error leyendo measurements:", error);
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    const last = data[0];
    const prev = data[1];

    const scores = data
      .map((m) => m.global_score)
      .filter((s) => typeof s === "number");
    const avg =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;

    const lastScore = typeof last.global_score === "number" ? last.global_score : avg;
    const risk = last.risk_level || scoreToRisk(lastScore);
    const trend = getTrendText(lastScore, prev?.global_score);

    return `
Datos recientes del trabajador:
- Última medición: ${formatDateEs(last.created_at)}.
- Puntaje global último registro: ${lastScore ?? "sin dato"} (riesgo ${risk}).
- Promedio últimos ${scores.length} registros: ${avg ?? "sin dato"}.
- ${trend}
Si la pregunta es "¿cómo he estado estos días?" o similar, deberás responder con base en este historial.`;
  } catch (err) {
    console.error("[worker] Excepción leyendo contexto:", err);
    return null;
  }
}

// ========================
// Supabase: equipo (empleador)
// ========================
async function getTeamContextFromSupabase(teamName) {
  try {
    if (!supabase || !teamName) return null;

    // 1) obtener ids de personas del equipo
    const { data: profiles, error: errorProfiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("department", teamName);

    if (errorProfiles) {
      console.error("[team] Error leyendo profiles:", errorProfiles);
      return null;
    }

    if (!profiles || profiles.length === 0) return null;

    const userIds = profiles.map((p) => p.id);

    // 2) mediciones recientes de esos usuarios (últimos 7 días)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const { data: measurements, error: errorMeas } = await supabase
      .from("measurements")
      .select("user_id_uuid, created_at, global_score, risk_level")
      .in("user_id_uuid", userIds)
      .gte("created_at", oneWeekAgo.toISOString());

    if (errorMeas) {
      console.error("[team] Error leyendo measurements:", errorMeas);
      return null;
    }

    if (!measurements || measurements.length === 0) return null;

    // última medición por persona
    const lastByUser = {};
    for (const m of measurements) {
      const current = lastByUser[m.user_id_uuid];
      if (!current || new Date(m.created_at) > new Date(current.created_at)) {
        lastByUser[m.user_id_uuid] = m;
      }
    }

    const lastList = Object.values(lastByUser);

    const scores = lastList
      .map((m) => m.global_score)
      .filter((s) => typeof s === "number");

    const avg =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;

    const risk = scoreToRisk(avg);
    const totalPeople = lastList.length;

    return `
Datos recientes del equipo "${teamName}":
- Personas con mediciones esta semana: ${totalPeople}.
- Puntaje global promedio último registro por persona: ${avg ?? "sin dato"} (riesgo ${risk}).
- Rango de fechas consideradas: desde ${formatDateEs(oneWeekAgo.toISOString())} hasta hoy.

Cuando el usuario pregunte "¿cómo ha estado el equipo de ${teamName}?" o similar,
describe el nivel de riesgo (bajo/medio/alto) con base en estos datos
y luego sugiere acciones concretas para el líder.`;
  } catch (err) {
    console.error("[team] Excepción leyendo contexto:", err);
    return null;
  }
}

// ========================
// RUTA: Chat trabajador
// ========================
app.post("/api/lia-chat", async (req, res) => {
  const { messages, workerId } = req.body;

  if (!Array.isArray(messages)) {
    return res
      .status(400)
      .json({ error: '"messages" es requerido y debe ser un arreglo.' });
  }

  try {
    let workerSummary =
      "No se entregó un identificador de trabajador. Usa sólo la información de la conversación y la escala de bienestar general.";

    if (workerId) {
      const supabaseWorkerContext = await getWorkerContextFromSupabase(workerId);
      if (supabaseWorkerContext) {
        workerSummary = supabaseWorkerContext;
      } else {
        workerSummary =
          "No se encontraron datos recientes en Supabase para este trabajador. Responde usando la escala de bienestar general y supuestos razonables (riesgo MEDIO por defecto).";
      }
    }

    const chatMessages = [
      {
        role: "system",
        content: `
Eres "Lia", una asistente de bienestar para PERSONAS TRABAJADORAS.
Siempre respondes en ESPAÑOL, con tono cercano, empático y sencillo.

CONTEXTO DE DATOS DEL TRABAJADOR:
---
${workerSummary}
---

TU OBJETIVO:
- Ayudar a la persona a entender CÓMO HA ESTADO estos días.
- Dar 1 frase de lectura emocional y 2–3 recomendaciones prácticas muy simples.

REGLAS:
- No des diagnósticos clínicos ni hables de enfermedades.
- No uses lenguaje técnico.
- Mantén la respuesta entre 3 y 5 frases máximo.
- Si los datos muestran tendencia negativa o riesgo alto, sugiere hablar con su jefatura o bienestar de la empresa si existe.`,
      },
      ...messages,
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: chatMessages,
      temperature: 0.5,
      max_tokens: 300,
    });

    const replyMessage = completion.choices[0]?.message;
    const replyText =
      replyMessage?.content?.trim() ||
      "Lo siento, no pude generar una respuesta en este momento.";

    return res.json({ reply: replyText });
  } catch (error) {
    console.error("Error en /api/lia-chat:", error);
    return res
      .status(500)
      .json({ error: "Error interno en Lia (trabajador)." });
  }
});

// ========================
// RUTA: Chat empleador
// ========================
app.post("/api/employer-assistant", async (req, res) => {
  const { messages, teamName } = req.body;

  if (!Array.isArray(messages)) {
    return res
      .status(400)
      .json({ error: '"messages" es requerido y debe ser un arreglo.' });
  }

  try {
    let supabaseSummary =
      "No se detectó un equipo específico en la pregunta. Usa un riesgo MEDIO por defecto y propuestas generales para equipos.";

    if (teamName) {
      const teamContext = await getTeamContextFromSupabase(teamName);
      if (teamContext) {
        supabaseSummary = teamContext;
      }
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
- Ayudar a líderes a ACTUAR RÁPIDO sobre sus equipos.
- Responder de forma CORTA, PRECISA y ACCIONABLE.

REGLAS DE ESTILO (OBLIGATORIAS):
1) Responde SIEMPRE con esta estructura:
   - 1 frase de diagnóstico general.
   - 3 bullets de acciones concretas para esta semana (1 línea cada una).
   - 1 frase de cierre opcional.
2) Nada de párrafos largos ni explicaciones técnicas.
3) No hagas más de 1 pregunta al final, sólo si ayuda a afinar el plan.

CÓMO USAR LOS DATOS:
- Si hay datos de Supabase:
  * Ajusta el diagnóstico según el nivel de riesgo observado.
  * Prioriza acciones que no interrumpan la operación (micro-rituales, check-ins breves, ajustes pequeños).
- Si NO hay datos:
  * Trabaja con riesgo MEDIO por defecto y sugerencias estándar para equipos.`,
      },
      ...messages,
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: chatMessages,
      temperature: 0.4,
      max_tokens: 350,
    });

    const replyMessage = completion.choices[0]?.message;
    const replyText =
      replyMessage?.content?.trim() ||
      "Lo siento, no pude generar una respuesta en este momento.";

    return res.json({ reply: replyText });
  } catch (error) {
    console.error("Error en /api/employer-assistant:", error);
    return res
      .status(500)
      .json({ error: "Error interno en Lia Coach (empleador)." });
  }
});

// ========================
// Healthcheck
// ========================
app.get("/", (req, res) => {
  res.send("Lia backend OK");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Lia backend escuchando en http://localhost:${port}`);
});
