import { runMigration } from "../backend/scripts/migrate-local-db";

runMigration().catch((err) => {
  console.error("[Migration Failed]", err?.message || err);
  process.exit(1);
});

