/**
 * Test simple para verificar datos en Supabase
 * Ejecuta: node test-simple.js
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log("📍 Conectando a Supabase...\n");

  // Test 1: ¿Qué hay en la tabla measurements?
  console.log("=== TEST 1: TABLA MEASUREMENTS ===");
  const { data: meas, error: measErr } = await supabase
    .from("measurements")
    .select("*")
    .limit(2);

  if (measErr) {
    console.error("❌ Error:", measErr.message);
  } else {
    console.log(`✅ Encontradas ${meas?.length || 0} mediciones\n`);
    if (meas && meas[0]) {
      console.log("Estructura del primer registro:");
      console.log(JSON.stringify(meas[0], null, 2));
    }
  }

  // Test 2: ¿Qué hay en la tabla profiles?
  console.log("\n=== TEST 2: TABLA PROFILES ===");
  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("*")
    .limit(2);

  if (profErr) {
    console.error("❌ Error:", profErr.message);
  } else {
    console.log(`✅ Encontrados ${prof?.length || 0} perfiles\n`);
    if (prof && prof[0]) {
      console.log("Estructura del primer registro:");
      console.log(JSON.stringify(prof[0], null, 2));
    }
  }

  // Test 3: Test de query real
  if (meas && meas[0]) {
    console.log("\n=== TEST 3: QUERY CON FILTRO ===");
    const userId = meas[0].user_id_uuid;
    console.log(`Buscando mediciones para usuario: ${userId}\n`);

    const { data: userMeas, error: userErr } = await supabase
      .from("measurements")
      .select("created_at, combined_score, stress_level, workload_level")
      .eq("user_id_uuid", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (userErr) {
      console.error("❌ Error:", userErr);
    } else {
      console.log(`✅ Encontradas ${userMeas?.length || 0} mediciones para este usuario`);
      console.log(JSON.stringify(userMeas, null, 2));
    }
  }
}

test().catch(console.error);
