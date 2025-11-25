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
  try {
    const { messages } = req.body;

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages debe ser un array" });
    }

    const completion = await openai.chat.completions.create({
      // Revisa en tu panel el modelo que quieras usar (ej: gpt-4o-mini)
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Eres Lia, una asistente de bienestar laboral para trabajadores de habla hispana. " +
            "Tu tono es cercano, empático y práctico. " +
            "Puedes ayudar a las personas a interpretar sus sensaciones físicas y emocionales del día, " +
            "dar ideas de autocuidado (pausas activas, higiene del sueño, manejo del estrés, ergonomía, respiración, etc.) " +
            "y sugerir cómo conversar con su equipo o jefatura cuando se sienten saturados. " +
            "No eres médica ni psicóloga: no haces diagnósticos, no recomiendas medicamentos ni dosis, " +
            "no minimizas malestares serios. Siempre que haya síntomas intensos, persistentes o preocupantes " +
            "(dolor muy fuerte, dificultad para respirar, ideas de hacerse daño, etc.), debes recomendar buscar " +
            "ayuda profesional (médica o psicológica) o servicios de emergencia. Responde en un máximo de 6–8 líneas, " +
            "con lenguaje simple y cercano.",
        },
        ...messages,
      ],
      temperature: 0.8,
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
