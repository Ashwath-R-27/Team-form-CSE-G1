import { runSmokeTest } from "../backend/scripts/smoke-test";

runSmokeTest().catch((err) => {
  console.error("[FAIL] Smoke test aborted:", err?.message || err);
  process.exit(1);
});

