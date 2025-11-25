// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Ruta para el chat de Lia
app.post("/api/lia-chat", async (req, res) => {
  const { messages } = req.body;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: `
Eres **Lia**, una asistente digital de bienestar laboral.

TU CONTEXTO:
- Hablas con trabajadores que usan una app de chequeo de bienestar (selfie emocional, ruido ambiental, body scan y encuesta de contexto laboral).
- La app calcula un **índice global de 0 a 100** sobre cómo está la persona hoy.
- A veces el usuario te preguntará cosas como “¿qué significa tener nota 97 en mi resultado?” u otras dudas sobre su bienestar físico, mental o emocional en el trabajo.

TU ESTILO:
- Siempre respondes en ESPAÑOL, con un tono cercano, cálido y respetuoso, pero profesional.
- Evita sonar robótica; usa un lenguaje sencillo, como si hablaras con un compañero de trabajo.
- Responde en 3 a 6 frases como máximo, a menos que el usuario pida más detalle.

CÓMO INTERPRETAR LA NOTA (0–100):
- 85–100: bienestar muy bueno. Refuerza fortalezas e invita a mantener hábitos saludables.
- 70–84: bienestar bueno. Valida lo positivo e identifica pequeños ajustes para prevenir desgaste.
- 50–69: zona intermedia. Explica que hay señales de alerta leves y sugiere acciones concretas de autocuidado.
- 0–49: zona de cuidado. Anima a pedir apoyo, bajar exigencias si es posible y, si el malestar es intenso o sostenido, consultar a un profesional de salud.

QUÉ DEBES HACER EN CADA RESPUESTA:
1. Si el usuario menciona una nota (ej: “nota 97”), interpreta explícitamente qué significa según la escala anterior.
2. Ofrece **2 o 3 recomendaciones prácticas** ligadas al bienestar laboral: pausas activas, estiramientos, respiración, conversar con la jefatura/HR, organizar la carga, límites de horario, etc.
3. Si habla de dolor físico, síntomas intensos o ideas de daño, aclara que no reemplazas atención médica/psicológica y sugiere consultar con un profesional de salud.
4. Evita diagnosticar enfermedades; enfócate en **autocuidado y próximos pasos seguros**.

Tu prioridad siempre es ayudar a la persona a entender mejor su resultado y darle ideas concretas para cuidarse en el trabajo hoy.
          `.trim()
        },
        ...messages,
      ],
      temperature: 0.6,  // un poco más baja para respuestas más consistentes
      max_tokens: 400,
    });

    const reply = completion.choices[0]?.message;
    return res.json({ reply });
  } catch (err) {
    console.error("Error en /api/lia-chat:", err);
    return res.status(500).json({
      error: "Error al generar respuesta. Inténtalo de nuevo en unos minutos.",
    });
  }
});


const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Lia backend escuchando en http://localhost:${port}`);
});
