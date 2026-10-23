import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

// Clean SUPABASE_URL in case someone pasted ".../rest/v1/"
const rawSupabaseUrl = (process.env.SUPABASE_URL || "").trim();
const cleanedSupabaseUrl = rawSupabaseUrl
  .replace(/\/rest\/v1\/?$/i, "")
  .replace(/\/+$/, "");

const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const missingEnvVars: string[] = [];
if (!cleanedSupabaseUrl) {
  missingEnvVars.push("SUPABASE_URL");
}
if (!supabaseServiceRoleKey) {
  missingEnvVars.push("SUPABASE_SERVICE_ROLE_KEY");
}

if (missingEnvVars.length > 0) {
  console.error(
    `[Startup Error] Missing required environment variable(s): ${missingEnvVars.join(
      ", "
    )}. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env.`
  );
  process.exit(1);
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  frontendOrigin: (process.env.FRONTEND_ORIGIN || "http://localhost:3000").trim(),
  supabaseUrl: cleanedSupabaseUrl,
  supabaseServiceRoleKey,
  jwtSecret: (process.env.JWT_SECRET || "").trim() || "team-registration-jwt-secret-key",
};
