/**
 * Script de diagnóstico para entender por qué falla getTeamContextFromSupabase
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/.env` });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Falta SUPABASE_URL o SUPABASE_KEY en .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function debugTeamContext() {
  console.log("🔍 DIAGNÓSTICO: Buscando contexto para equipo 'Operaciones'\n");

  const teamName = "Operaciones";

  // PASO 1: Obtener perfiles con department
  console.log("📋 PASO 1: Buscando perfiles con department='Operaciones'");
  const { data: profiles, error: errProf } = await supabase
    .from("profiles")
    .select("id, username, department")
    .eq("department", teamName);

  if (errProf) {
    console.error("❌ Error:", errProf);
    return;
  }

  console.log(`✅ Encontrados ${profiles.length} perfiles:`);
  profiles.forEach((p) => {
    console.log(`   - ${p.username || p.id} (${p.id})`);
  });

  const userIds = profiles.map((p) => p.id);
  console.log(`\n📋 PASO 2: Buscando mediciones para estos ${userIds.length} usuarios`);

  // PASO 2: Obtener mediciones
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - 60); // Mismo rango que en server.js

  const { data: measurements, error: errMeas } = await supabase
    .from("measurements")
    .select("user_id_uuid, created_at, combined_score, stress_level, workload_level")
    .in("user_id_uuid", userIds)
    .gte("created_at", daysAgo.toISOString());

  if (errMeas) {
    console.error("❌ Error:", errMeas);
    return;
  }

  console.log(`✅ Encontradas ${measurements.length} mediciones`);

  if (measurements.length > 0) {
    console.log("\n📊 Últimas 5 mediciones:");
    measurements.slice(0, 5).forEach((m) => {
      console.log(
        `   - ${m.user_id_uuid}: score=${m.combined_score}, stress=${m.stress_level}, fecha=${m.created_at}`
      );
    });

    // Agrupar por usuario
    const byUser = {};
    measurements.forEach((m) => {
      if (!byUser[m.user_id_uuid]) byUser[m.user_id_uuid] = [];
      byUser[m.user_id_uuid].push(m);
    });

    console.log("\n👥 Mediciones por usuario:");
    Object.entries(byUser).forEach(([userId, meds]) => {
      const profile = profiles.find((p) => p.id === userId);
      console.log(`   - ${profile?.username || userId}: ${meds.length} mediciones`);
    });

    // Calcular promedios
    const scores = measurements.map((m) => m.combined_score).filter((s) => typeof s === "number");
    const avgScore = scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    console.log(`\n📈 Promedio de Score: ${avgScore}`);
  } else {
    console.log("❌ No hay mediciones en los últimos 15 días");
  }
}

debugTeamContext().catch(console.error);
