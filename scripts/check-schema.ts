import { runSchemaCheck } from "../backend/scripts/check-schema";

runSchemaCheck().catch((err) => {
  console.error("[FAIL] Unexpected error running check-schema:", err?.message || err);
  process.exit(1);
});

