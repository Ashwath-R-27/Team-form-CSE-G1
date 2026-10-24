// Entry point that verifies all required tables/columns (including forms.show_chosen_topics) and RPCs
import { runSchemaCheck } from "../backend/scripts/check-schema";

runSchemaCheck().catch((err) => {
  console.error("[FAIL] Unexpected error running check-schema:", err?.message || err);
  process.exit(1);
});

