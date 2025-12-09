/**
 * Test Script: Fetch Profile Data
 * Verifica que se obtienen datos del perfil desde Supabase
 */

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("[ERROR] ❌ Faltan variables de entorno");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testProfileFetch() {
  console.log("[TEST] 🔍 Buscando perfiles en Supabase...\n");

  try {
    // Obtener los primeros 5 perfiles
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, full_name, department, avatar_url")
      .limit(5);

    if (profileError) {
      console.error("[ERROR] ❌ Error fetching profiles:", profileError);
      return;
    }

    console.log("[SUCCESS] ✅ Perfiles obtenidos:\n");
    profiles.forEach((profile, idx) => {
      console.log(`${idx + 1}. ${profile.full_name || profile.username}`);
      console.log(`   ID: ${profile.id}`);
      console.log(`   Username: ${profile.username}`);
      console.log(`   Departamento: ${profile.department || "Sin especificar"}`);
      console.log("");
    });

    // Probar con el primer perfil
    if (profiles.length > 0) {
      const firstProfile = profiles[0];
      console.log(`[TEST] 🎯 Probando con perfil: ${firstProfile.username}\n`);

      const { data: singleProfile, error: singleError } = await supabase
        .from("profiles")
        .select("username, full_name, department, avatar_url")
        .eq("id", firstProfile.id)
        .single();

      if (singleError) {
        console.error("[ERROR] ❌ Error fetching single profile:", singleError);
        return;
      }

      console.log("[SUCCESS] ✅ Datos del perfil:");
      console.log(`   Username: ${singleProfile.username}`);
      console.log(`   Full Name: ${singleProfile.full_name}`);
      console.log(`   Department: ${singleProfile.department}`);
      console.log(`   Avatar URL: ${singleProfile.avatar_url || "N/A"}`);
    }
  } catch (err) {
    console.error("[ERROR] ❌ Exception:", err.message);
  }
}

testProfileFetch();
