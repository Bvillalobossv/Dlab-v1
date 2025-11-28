/**
 * Test para simular un chat con datos reales
 * Ejecuta: node test-chat-sim.js
 */

const API_BASE = "http://localhost:3000";

async function testChat() {
  console.log("🧪 Test de Chat con Backend\n");

  // ID real de un usuario que TIENE mediciones
  const REAL_USER_ID = "a53ea125-b7f9-4baf-ae2a-93c113ecf5ad"; // UUID CORRECTO

  // Mensaje de prueba
  const messages = [
    {
      role: "user",
      content: "¿Cómo está mi bienestar hoy?"
    }
  ];

  console.log("📤 Enviando request al backend...");
  console.log(`   Endpoint: ${API_BASE}/api/lia-chat`);
  console.log(`   User ID: ${REAL_USER_ID}`);
  console.log(`   Mensajes: ${messages.length}\n`);

  try {
    const response = await fetch(`${API_BASE}/api/lia-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        workerId: REAL_USER_ID
      })
    });

    if (!response.ok) {
      console.error(`❌ Error HTTP ${response.status}`);
      console.error(await response.text());
      return;
    }

    const data = await response.json();
    
    console.log("📨 Respuesta del backend:");
    console.log("\n" + data.reply + "\n");
    
    if (data.reply.includes("DATOS DEL USUARIO") || data.reply.includes("Score")) {
      console.log("✅ ¡Backend está usando datos de Supabase correctamente!");
    } else {
      console.log("⚠️ Respuesta genérica (sin datos de BD)");
    }

  } catch (error) {
    console.error("❌ Error de conexión:", error.message);
  }
}

testChat();
