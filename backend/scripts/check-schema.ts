import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from backend/.env and process.cwd()
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

const REQUIRED_TABLES: Record<string, string[]> = {
  admins: ["id", "email", "password_hash", "role", "created_at"],
  students: ["roll_no", "name", "gender"],
  forms: [
    "id",
    "slug",
    "title",
    "description",
    "min_team_size",
    "max_team_size",
    "collect_topic",
    "allow_topic_repeat",
    "show_chosen_topics",
    "is_open",
    "created_by",
    "created_at",
  ],
  topics: ["id", "form_id", "name"],
  teams: ["id", "form_id", "team_no", "topic", "submitted_at"],
  team_members: ["id", "team_id", "form_id", "roll_no", "position"],
};

function isServiceKeyValid(key: string): { valid: boolean; reason: string } {
  if (!key) {
    return { valid: false, reason: "SUPABASE_SERVICE_ROLE_KEY is empty" };
  }
  if (key.startsWith("sb_publishable_")) {
    return {
      valid: false,
      reason: "Key starts with 'sb_publishable_' (publishable key instead of secret service_role key)",
    };
  }
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
      if (payload?.role && payload.role !== "service_role") {
        return {
          valid: false,
          reason: `JWT role is '${payload.role}' (expected 'service_role')`,
        };
      }
      return { valid: true, reason: "JWT role='service_role' verified" };
    } catch {
      // Not a standard JWT payload
    }
  }
  if (key.startsWith("sb_secret_")) {
    return { valid: true, reason: "Supabase secret key prefix ('sb_secret_') verified" };
  }
  return { valid: true, reason: "Key present" };
}

export async function runSchemaCheck(): Promise<void> {
  const results: CheckResult[] = [];
  const record = (name: string, passed: boolean, detail: string) => {
    results.push({ name, passed, detail });
    const tag = passed ? "PASS" : "FAIL";
    console.log(`[${tag}] ${name} — ${detail}`);
  };

  const rawUrl = (process.env.SUPABASE_URL || "").trim();
  const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  record(
    "env:SUPABASE_URL",
    Boolean(supabaseUrl),
    supabaseUrl ? "SUPABASE_URL is set" : "SUPABASE_URL is missing"
  );

  const keyCheck = isServiceKeyValid(serviceKey);
  record("env:SUPABASE_SERVICE_ROLE_KEY", keyCheck.valid, keyCheck.reason);

  if (!supabaseUrl || !keyCheck.valid) {
    console.error("\nSchema check aborted due to missing or invalid Supabase credentials.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Check every required table and its required columns
  for (const [table, columns] of Object.entries(REQUIRED_TABLES)) {
    const selectClause = columns.join(", ");
    const { error } = await supabase.from(table).select(selectClause).limit(1);

    if (!error) {
      record(
        `table:${table}`,
        true,
        `All ${columns.length} columns verified (${columns.join(", ")})`
      );
    } else {
      // Probe individual columns to pinpoint which ones are missing
      const missingCols: string[] = [];
      let tableMissing = false;

      for (const col of columns) {
        const { error: colErr } = await supabase.from(table).select(col).limit(1);
        if (colErr) {
          const msg = colErr.message || "";
          if (
            colErr.code === "42P01" ||
            colErr.code === "PGRST205" ||
            msg.includes("Could not find the table")
          ) {
            tableMissing = true;
            break;
          }
          missingCols.push(col);
        }
      }

      if (tableMissing) {
        record(`table:${table}`, false, `Table '${table}' does not exist (${error.message})`);
      } else if (missingCols.length > 0) {
        record(
          `table:${table}`,
          false,
          `Missing column(s) on '${table}': ${missingCols.join(", ")}`
        );
      } else {
        record(`table:${table}`, false, error.message);
      }
    }
  }

  // 2. Check PostgREST foreign-key relationships used by repository queries
  const { error: joinStudentErr } = await supabase
    .from("team_members")
    .select("roll_no, students(name, gender)")
    .limit(1);
  record(
    "relation:team_members->students",
    !joinStudentErr,
    joinStudentErr
      ? `Foreign key join team_members -> students failed: ${joinStudentErr.message}`
      : "Embedded select team_members.students(name, gender) verified"
  );

  const { error: joinTeamErr } = await supabase
    .from("team_members")
    .select("team_id, teams(team_no)")
    .limit(1);
  record(
    "relation:team_members->teams",
    !joinTeamErr,
    joinTeamErr
      ? `Foreign key join team_members -> teams failed: ${joinTeamErr.message}`
      : "Embedded select team_members.teams(team_no) verified"
  );

  // 3. Check RPC submit_team(p_form_id, p_rolls, p_topic)
  const dummyFormId = "00000000-0000-0000-0000-000000000000";
  const { error: rpcErr } = await supabase.rpc("submit_team", {
    p_form_id: dummyFormId,
    p_rolls: ["__SCHEMA_CHECK__"],
    p_topic: "schema-check-topic",
  });

  if (rpcErr && (rpcErr.message || "").includes("FORM_NOT_FOUND")) {
    record(
      "rpc:submit_team(p_form_id, p_rolls, p_topic)",
      true,
      "Function signature (p_form_id, p_rolls, p_topic) verified and callable via PostgREST"
    );
  } else if (!rpcErr) {
    record(
      "rpc:submit_team(p_form_id, p_rolls, p_topic)",
      true,
      "Function callable via PostgREST"
    );
  } else {
    record(
      "rpc:submit_team(p_form_id, p_rolls, p_topic)",
      false,
      `RPC check failed: ${rpcErr.message} (code: ${rpcErr.code || "unknown"})`
    );
  }

  const failed = results.filter((r) => !r.passed);
  console.log(
    `\nSummary: ${results.length - failed.length}/${results.length} checks passed.`
  );

  if (failed.length > 0) {
    console.error(
      "Action Required: Run backend/supabase/migrations/002_upgrade.sql and backend/supabase/migrations/003_show_chosen_topics.sql in the Supabase SQL Editor."
    );
    process.exit(1);
  }
}

if (require.main === module) {
  runSchemaCheck().catch((err) => {
    console.error("[FAIL] Unexpected error running check-schema:", err?.message || err);
    process.exit(1);
  });
}

