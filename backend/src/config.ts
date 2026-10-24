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
const jwtSecret = (process.env.JWT_SECRET || "").trim();

const missingEnvVars: string[] = [];
if (!cleanedSupabaseUrl) {
  missingEnvVars.push("SUPABASE_URL");
}
if (!supabaseServiceRoleKey) {
  missingEnvVars.push("SUPABASE_SERVICE_ROLE_KEY");
}
if (!jwtSecret) {
  missingEnvVars.push("JWT_SECRET");
}

if (missingEnvVars.length > 0) {
  console.error(
    `[Startup Error] Missing required environment variable(s): ${missingEnvVars.join(
      ", "
    )}. Please set ${missingEnvVars.join(", ")} in your environment.`
  );
  process.exit(1);
}

if (supabaseServiceRoleKey.startsWith("sb_publishable_")) {
  console.warn(
    "[Startup Warning] SUPABASE_SERVICE_ROLE_KEY starts with 'sb_publishable_' (which is a publishable/anon key, not a service_role secret key). " +
      "When Row Level Security (RLS) is enabled in Supabase, you must set SUPABASE_SERVICE_ROLE_KEY to your secret 'service_role' / 'sb_secret_' key."
  );
}

const rawFrontendOrigin = (process.env.FRONTEND_ORIGIN || "http://localhost:3000").trim();
const frontendOrigins = Array.from(
  new Set(
    rawFrontendOrigin
      .split(",")
      .map((o) => o.trim().replace(/\/+$/, ""))
      .filter(Boolean)
  )
);

export const config = {
  port: Number(process.env.PORT) || 4000,
  frontendOrigin: frontendOrigins[0] || "http://localhost:3000",
  frontendOrigins,
  supabaseUrl: cleanedSupabaseUrl,
  supabaseServiceRoleKey,
  jwtSecret,
};
