/**
 * Script para verificar empleadores (usuarios con department asignado)
 * Ejecuta: node get-employers.js
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getEmployers() {
  console.log("📋 Obteniendo empleadores (usuarios con department)...\n");

  const { data: employers, error } = await supabase
    .from("profiles")
    .select("id, username, department")
    .not("department", "is", null)
    .limit(10);

  if (error) {
    console.error("❌ Error:", error);
    return;
  }

  if (!employers || employers.length === 0) {
    console.log("⚠️ No hay usuarios con department asignado");
    return;
  }

  console.log(`✅ Encontrados ${employers.length} empleadores:\n`);
  employers.forEach((emp, i) => {
    console.log(`${i + 1}. ${emp.username || emp.id.slice(0, 8)}`);
    console.log(`   ID: ${emp.id}`);
    console.log(`   Depto: ${emp.department}\n`);
  });

  // Verificar qué equipos tienen mediciones
  console.log("📊 Verificando mediciones por departamento:\n");
  
  const departments = [...new Set(employers.map(e => e.department))];
  
  for (const dept of departments) {
    const { data: meas, error: err } = await supabase
      .from("measurements")
      .select("user_id_uuid")
      .eq("department", dept);
    
    if (!err && meas) {
      const uniqueUsers = new Set(meas.map(m => m.user_id_uuid)).size;
      console.log(`  ${dept}: ${meas.length} mediciones de ${uniqueUsers} usuarios`);
    }
  }
}

getEmployers();
