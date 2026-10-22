import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Clean SUPABASE_URL in case someone pasted ".../rest/v1/"
const rawSupabaseUrl = (process.env.SUPABASE_URL || "").trim();
const cleanedSupabaseUrl = rawSupabaseUrl
  .replace(/\/rest\/v1\/?$/i, "")
  .replace(/\/+$/, "");

export const config = {
  port: Number(process.env.PORT) || 4000,
  frontendOrigin: (process.env.FRONTEND_ORIGIN || "http://localhost:3000").trim(),
  supabaseUrl: cleanedSupabaseUrl,
  supabaseServiceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
  jwtSecret: (process.env.JWT_SECRET || "").trim() || "team-registration-jwt-secret-key",
};
