/**
 * Script para verificar si hay datos en Supabase
 * Ejecuta: node test-supabase.js
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("❌ Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function testSupabase() {
  console.log("🔍 Verificando conexión a Supabase...\n");

  try {
    // 1. Obtener la estructura de profiles
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("*")
      .limit(3);

    if (profilesError) {
      console.error("❌ Error leyendo profiles:", profilesError);
    } else {
      console.log("✅ Estructura de profiles:");
      if (profiles && profiles.length > 0) {
        console.log("Columnas disponibles:", Object.keys(profiles[0]));
        console.log("Primeros registros:", profiles);
      } else {
        console.log("No hay registros en profiles");
      }
    }

    console.log("\n---\n");

    // 2. Obtener mediciones
    const { data: measurements, error: measError } = await supabase
      .from("measurements")
      .select("id, user_id_uuid, combined_score, stress_level, created_at")
      .limit(10);

    if (measError) {
      console.error("❌ Error leyendo measurements:", measError);
    } else {
      console.log("✅ Mediciones encontradas:", measurements?.length || 0);
      measurements?.forEach((m, i) => {
        console.log(
          `  ${i + 1}. User: ${m.user_id_uuid.slice(0, 8)}... | Score: ${m.combined_score} | Estrés: ${m.stress_level} | Fecha: ${new Date(m.created_at).toLocaleString("es-CL")}`
        );
      });
    }

    // 3. Si hay mediciones, hacer un test de query por usuario
    if (measurements && measurements.length > 0) {
      const testUserId = measurements[0].user_id_uuid;
      console.log(`\n---\n`);
      console.log(`🧪 Test de query para usuario: ${testUserId.slice(0, 8)}...\n`);

      const { data: userMeasurements, error: userError } = await supabase
        .from("measurements")
        .select("created_at, combined_score, stress_level, workload_level")
        .eq("user_id_uuid", testUserId)
        .order("created_at", { ascending: false })
        .limit(8);

      if (userError) {
        console.error("❌ Error:", userError);
      } else {
        console.log(`✅ Mediciones de este usuario: ${userMeasurements?.length || 0}`);
        userMeasurements?.forEach((m) => {
          console.log(
            `  - Score: ${m.combined_score} | Estrés: ${m.stress_level} | Carga: ${m.workload_level} | ${new Date(m.created_at).toLocaleString("es-CL")}`
          );
        });
      }
    }
  } catch (error) {
    console.error("❌ Error inesperado:", error);
  }
}

testSupabase();
