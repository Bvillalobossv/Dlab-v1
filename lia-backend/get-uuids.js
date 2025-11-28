/**
 * Script para obtener UUIDs reales de usuarios con mediciones
 * Ejecuta: node get-uuids.js
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getUUIDs() {
  console.log("📋 Obteniendo UUIDs reales de usuarios con mediciones...\n");

  // Obtener todos los user_id_uuid DISTINTOS de la tabla measurements
  const { data, error } = await supabase
    .from("measurements")
    .select("user_id_uuid")
    .limit(1);

  if (error) {
    console.error("❌ Error:", error);
    return;
  }

  if (!data || data.length === 0) {
    console.log("Sin datos");
    return;
  }

  // Obtener user_id_uuid únicos
  const { data: uniqueUsers, error: err2 } = await supabase
    .rpc("get_distinct_user_ids");

  if (err2) {
    // Si la función RPC no existe, hacerlo manualmente
    const { data: allMeasurements } = await supabase
      .from("measurements")
      .select("user_id_uuid")
      .limit(100);

    const userIds = [...new Set(allMeasurements.map(m => m.user_id_uuid))];
    
    console.log(`✅ Encontrados ${userIds.length} usuarios únicos:\n`);
    userIds.forEach((id, i) => {
      console.log(`${i + 1}. ${id}`);
    });

    console.log("\n💡 Copia uno de estos UUIDs y úsalo en el test");
  }
}

getUUIDs();
