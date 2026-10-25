// Entry point that runs the full end-to-end smoke test suite (including show_chosen_topics, GET /api/forms/:slug/chosen-topics, and GET /api/admin/forms/:id/pending)
import { runSmokeTest } from "../backend/scripts/smoke-test";

runSmokeTest().catch((err) => {
  console.error("[FAIL] Smoke test aborted:", err?.message || err);
  process.exit(1);
});


