/**
 * Script para crear datos de prueba para empleador
 * Ejecuta: node test-employer-sim.js
 */

const API_BASE = "http://localhost:3000";

async function testEmployerChat() {
  console.log("🧪 Test de Chat Empleador con Backend\n");

  // Usar un empleador real
  const MANAGER_NAME = "Pedro"; // Empleador
  const TEAM_NAME = "Operaciones"; // Su equipo

  // Mensaje de prueba
  const messages = [
    {
      role: "user",
      content: "¿Qué está pasando con mi equipo de Operaciones? ¿Cómo está su bienestar?"
    }
  ];

  console.log("📤 Enviando request al backend...");
  console.log(`   Endpoint: ${API_BASE}/api/employer-assistant`);
  console.log(`   Team: ${TEAM_NAME}`);
  console.log(`   Manager: ${MANAGER_NAME}`);
  console.log(`   Mensajes: ${messages.length}\n`);

  try {
    const response = await fetch(`${API_BASE}/api/employer-assistant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        teamName: TEAM_NAME,
        managerName: MANAGER_NAME
      })
    });

    if (!response.ok) {
      console.error(`❌ Error HTTP ${response.status}`);
      console.error(await response.text());
      return;
    }

    const data = await response.json();
    
    console.log("📨 Respuesta del backend:\n");
    console.log(data.reply + "\n");
    
    if (data.reply.includes("DATOS DEL EQUIPO") || data.reply.includes("Operaciones")) {
      console.log("✅ ¡Backend está usando datos del equipo correctamente!");
    } else {
      console.log("⚠️ Respuesta genérica (sin datos de BD)");
    }

  } catch (error) {
    console.error("❌ Error de conexión:", error.message);
  }
}

testEmployerChat();
