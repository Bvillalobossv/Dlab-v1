import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/.env` });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkAdmin() {
  console.log("🔍 Buscando usuario admin...\n");

  // Primero obtener el UUID de auth_users
  const { data: authUsers, error: errAuth } = await supabase.auth.admin.listUsers();
  
  if (errAuth) {
    console.error("❌ Error listando usuarios auth:", errAuth);
    return;
  }

  const adminUser = authUsers.users.find(u => u.email === "admin@lia.app");
  
  if (!adminUser) {
    console.log("❌ No encontrado admin@lia.app en auth");
    return;
  }

  console.log(`✅ Usuario encontrado en auth:`);
  console.log(`   UID: ${adminUser.id}`);
  console.log(`   Email: ${adminUser.email}\n`);

  // Ahora buscar en profiles
  const { data: profile, error: errProfile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", adminUser.id)
    .single();

  if (errProfile) {
    console.error("❌ Error en profiles:", errProfile);
    return;
  }

  if (!profile) {
    console.log("⚠️ No existe perfil en la tabla profiles para este usuario");
    return;
  }

  console.log("✅ Perfil encontrado:");
  console.log(`   ID: ${profile.id}`);
  console.log(`   Username: ${profile.username}`);
  console.log(`   Department: ${profile.department || "SIN DEPARTAMENTO"}`);
  console.log(`   Full Name: ${profile.full_name}`);
}

checkAdmin().catch(console.error);
