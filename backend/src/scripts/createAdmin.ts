import bcrypt from "bcryptjs";
import { AdminRole, createAdmin } from "../db/repository";
import { AppError } from "../middleware/errorHandler";

function parseArgs(argv: string[]): { email?: string; password?: string; role: AdminRole } {
  let email: string | undefined;
  let password: string | undefined;
  let role: AdminRole = "admin";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--email" && argv[i + 1]) {
      email = argv[++i];
    } else if (arg.startsWith("--email=")) {
      email = arg.slice("--email=".length);
    } else if (arg === "--password" && argv[i + 1]) {
      password = argv[++i];
    } else if (arg.startsWith("--password=")) {
      password = arg.slice("--password=".length);
    } else if (arg === "--super" || arg === "--super-admin" || arg === "--super_admin") {
      role = "super_admin";
    } else if (arg === "--role" && argv[i + 1]) {
      const r = argv[++i];
      if (r === "super_admin" || r === "super") role = "super_admin";
      else role = "admin";
    } else if (arg.startsWith("--role=")) {
      const r = arg.slice("--role=".length);
      if (r === "super_admin" || r === "super") role = "super_admin";
      else role = "admin";
    }
  }

  return { email, password, role };
}

async function main() {
  const { email, password, role } = parseArgs(process.argv.slice(2));

  if (!email || !password) {
    console.error(
      "Usage: npm run create-admin -- --email you@example.com --password 'YourPassword' [--super]"
    );
    process.exit(1);
  }

  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail.includes("@")) {
    console.error("Error: Please provide a valid email address.");
    process.exit(1);
  }

  if (password.length < 6) {
    console.error("Error: Password must be at least 6 characters long.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await createAdmin({
    email: trimmedEmail,
    passwordHash,
    role,
  });

  console.log(`✅ Created admin account:`);
  console.log(`   ID      : ${admin.id}`);
  console.log(`   Email   : ${admin.email}`);
  console.log(`   Role    : ${admin.role}`);
  console.log(`   Storage : Supabase Postgres`);
}

main().catch((err) => {
  if (err instanceof AppError && err.code === "ADMIN_EXISTS") {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  console.error("Failed to create admin:", err?.message || err);
  process.exit(1);
});
