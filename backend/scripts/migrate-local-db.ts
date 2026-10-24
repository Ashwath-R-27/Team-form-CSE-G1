import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { compareRollNumbers, normalizeTopic, parseClassListCsv, StudentRow } from "../src/utils/csv";

// Load environment variables from backend/.env and process.cwd()
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const rawSupabaseUrl = (process.env.SUPABASE_URL || "").trim();
const supabaseUrl = rawSupabaseUrl
  .replace(/\/rest\/v1\/?$/i, "")
  .replace(/\/+$/, "");
const supabaseServiceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

const missingVars: string[] = [];
if (!supabaseUrl) missingVars.push("SUPABASE_URL");
if (!supabaseServiceRoleKey) missingVars.push("SUPABASE_SERVICE_ROLE_KEY");

if (missingVars.length > 0) {
  console.error(
    `[Error] Missing required environment variable(s): ${missingVars.join(
      ", "
    )}. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env.`
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function toRecordArray<T>(collection: unknown): T[] {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection as T[];
  if (typeof collection === "object") {
    return Object.values(collection as Record<string, T>);
  }
  return [];
}

function resolveLocalDbPaths(): string[] {
  const cliArg = process.argv[2];
  if (cliArg && !cliArg.startsWith("-")) {
    const resolved = path.resolve(process.cwd(), cliArg);
    if (!fs.existsSync(resolved)) {
      console.error(`[Error] Specified local-db.json path does not exist: ${resolved}`);
      process.exit(1);
    }
    return [resolved];
  }

  const candidates = [
    path.resolve(__dirname, "../local-db.json"),
    path.resolve(__dirname, "../.data/local-db.json"),
    path.resolve(process.cwd(), "local-db.json"),
    path.resolve(process.cwd(), ".data/local-db.json"),
    path.resolve(process.cwd(), "backend/local-db.json"),
    path.resolve(process.cwd(), "backend/.data/local-db.json"),
  ];

  const uniqueExisting: string[] = [];
  for (const p of candidates) {
    if (fs.existsSync(p) && !uniqueExisting.includes(p)) {
      uniqueExisting.push(p);
    }
  }
  return uniqueExisting;
}

export async function runMigration(): Promise<void> {
  const dbPaths = resolveLocalDbPaths();
  if (dbPaths.length === 0) {
    console.error(
      "[Error] Could not find local-db.json (checked backend/local-db.json and backend/.data/local-db.json)."
    );
    process.exit(1);
  }

  const rawAdmins: any[] = [];
  const rawStudents: any[] = [];
  const rawForms: any[] = [];
  const rawTopics: any[] = [];
  const rawTeams: any[] = [];
  const rawMembers: any[] = [];

  for (const dbPath of dbPaths) {
    console.log(`Reading local database from: ${dbPath}`);
    const content = fs.readFileSync(dbPath, "utf-8");
    const parsed = JSON.parse(content);

    rawAdmins.push(...toRecordArray(parsed.admins));
    rawStudents.push(...toRecordArray(parsed.students));
    rawForms.push(...toRecordArray(parsed.forms));
    rawTopics.push(...toRecordArray(parsed.topics));
    rawTeams.push(...toRecordArray(parsed.teams));
    rawMembers.push(...toRecordArray(parsed.team_members || parsed.members));
  }

  // Also extract any members nested directly inside team objects if present
  for (const team of rawTeams) {
    if (Array.isArray(team.members)) {
      team.members.forEach((m: any, idx: number) => {
        const rollNo = typeof m === "string" ? m : m?.roll_no;
        if (!rollNo) return;
        rawMembers.push({
          id: m?.id || crypto.randomUUID(),
          team_id: team.id,
          form_id: team.form_id,
          roll_no: String(rollNo).trim().toUpperCase(),
          position: typeof m?.position === "number" ? m.position : idx + 1,
        });
      });
    }
  }

  // -------------------------------------------------------------------------
  // 1. Migrate Students (required by team_members.roll_no FK, skip existing)
  // -------------------------------------------------------------------------
  const studentMap = new Map<string, StudentRow>();

  const csvCandidates = [
    path.resolve(__dirname, "../../classlist.csv"),
    path.resolve(__dirname, "../classlist.csv"),
  ];
  const csvPath = csvCandidates.find((p) => fs.existsSync(p));
  if (csvPath) {
    try {
      const csvStudents = parseClassListCsv(fs.readFileSync(csvPath, "utf-8"));
      for (const s of csvStudents) {
        studentMap.set(s.roll_no.toUpperCase(), s);
      }
    } catch {
      // Ignore CSV parse errors if local-db already has students
    }
  }

  for (const s of rawStudents) {
    if (!s?.roll_no) continue;
    const roll_no = String(s.roll_no).trim().toUpperCase();
    studentMap.set(roll_no, {
      roll_no,
      name: String(s.name || roll_no).trim(),
      gender: s.gender === "F" ? "F" : "M",
    });
  }

  for (const m of rawMembers) {
    if (!m?.roll_no) continue;
    const roll_no = String(m.roll_no).trim().toUpperCase();
    if (!studentMap.has(roll_no)) {
      studentMap.set(roll_no, {
        roll_no,
        name: String(m.name || roll_no).trim(),
        gender: m.gender === "F" ? "F" : "M",
      });
    }
  }

  const studentsToInsert = Array.from(studentMap.values());
  if (studentsToInsert.length > 0) {
    const { error: stuErr } = await supabase
      .from("students")
      .upsert(studentsToInsert, { onConflict: "roll_no", ignoreDuplicates: true });
    if (stuErr) {
      throw new Error(`Failed to migrate students: ${stuErr.message}`);
    }
    console.log(`Processed ${studentsToInsert.length} student(s) (existing rows skipped).`);
  }

  // -------------------------------------------------------------------------
  // 2. Migrate Admins (upsert by lowercase email, keeping existing bcrypt hash)
  // -------------------------------------------------------------------------
  const adminIdMap = new Map<string, string>();
  const { data: existingAdmins, error: fetchAdminsErr } = await supabase
    .from("admins")
    .select("id, email");
  if (fetchAdminsErr) {
    throw new Error(`Failed to query admins table: ${fetchAdminsErr.message}`);
  }

  const existingAdminByEmail = new Map<string, string>();
  const existingAdminIds = new Set<string>();
  for (const a of existingAdmins || []) {
    existingAdminByEmail.set(String(a.email).trim().toLowerCase(), a.id);
    existingAdminIds.add(a.id);
  }

  let upsertedAdminsCount = 0;
  for (const a of rawAdmins) {
    if (!a?.email || !a?.password_hash) continue;
    const email = String(a.email).trim().toLowerCase();
    const role = a.role === "super_admin" ? "super_admin" : "admin";
    const localId = a.id || crypto.randomUUID();
    const createdAt = a.created_at || new Date().toISOString();

    const existingIdForEmail = existingAdminByEmail.get(email);
    if (existingIdForEmail) {
      const { error: updErr } = await supabase
        .from("admins")
        .update({
          email,
          password_hash: a.password_hash,
          role,
        })
        .eq("id", existingIdForEmail);
      if (updErr) {
        throw new Error(`Failed to upsert admin "${email}": ${updErr.message}`);
      }
      adminIdMap.set(localId, existingIdForEmail);
      existingAdminIds.add(existingIdForEmail);
      upsertedAdminsCount++;
    } else {
      const targetId = existingAdminIds.has(localId) ? crypto.randomUUID() : localId;
      const { data: inserted, error: insErr } = await supabase
        .from("admins")
        .insert({
          id: targetId,
          email,
          password_hash: a.password_hash,
          role,
          created_at: createdAt,
        })
        .select("id")
        .single();
      if (insErr) {
        throw new Error(`Failed to insert admin "${email}": ${insErr.message}`);
      }
      adminIdMap.set(localId, inserted.id);
      existingAdminByEmail.set(email, inserted.id);
      existingAdminIds.add(inserted.id);
      upsertedAdminsCount++;
    }
  }
  console.log(`Upserted ${upsertedAdminsCount} admin(s) by lowercase email.`);

  // -------------------------------------------------------------------------
  // 3. Migrate Forms (skip rows that already exist)
  // -------------------------------------------------------------------------
  const formIdMap = new Map<string, string>();
  const { data: existingForms, error: fetchFormsErr } = await supabase
    .from("forms")
    .select("id, slug");
  if (fetchFormsErr) {
    throw new Error(`Failed to query forms table: ${fetchFormsErr.message}`);
  }

  const existingFormBySlug = new Map<string, string>();
  const existingFormIds = new Set<string>();
  for (const f of existingForms || []) {
    existingFormBySlug.set(String(f.slug).trim().toLowerCase(), f.id);
    existingFormIds.add(f.id);
  }

  let insertedFormsCount = 0;
  let skippedFormsCount = 0;
  for (const f of rawForms) {
    if (!f?.slug || !f?.title) continue;
    const localId = f.id || crypto.randomUUID();
    const slug = String(f.slug).trim().toLowerCase();

    const existingIdForSlug = existingFormBySlug.get(slug);
    if (existingIdForSlug) {
      formIdMap.set(localId, existingIdForSlug);
      skippedFormsCount++;
      continue;
    }
    if (existingFormIds.has(localId)) {
      formIdMap.set(localId, localId);
      skippedFormsCount++;
      continue;
    }

    const minSize =
      typeof f.min_team_size === "number"
        ? f.min_team_size
        : typeof f.team_size === "number"
        ? f.team_size
        : 3;
    const maxSize =
      typeof f.max_team_size === "number"
        ? f.max_team_size
        : typeof f.team_size === "number"
        ? f.team_size
        : minSize;

    let createdBy: string | null = null;
    if (f.created_by) {
      if (adminIdMap.has(f.created_by)) {
        createdBy = adminIdMap.get(f.created_by)!;
      } else if (existingAdminIds.has(f.created_by)) {
        createdBy = f.created_by;
      }
    }

    const { data: insertedForm, error: formErr } = await supabase
      .from("forms")
      .insert({
        id: localId,
        slug,
        title: String(f.title).trim(),
        description: f.description ?? null,
        min_team_size: minSize,
        max_team_size: maxSize,
        collect_topic: Boolean(f.collect_topic ?? false),
        allow_topic_repeat: Boolean(f.allow_topic_repeat ?? true),
        is_open: Boolean(f.is_open ?? true),
        created_by: createdBy,
        created_at: f.created_at || new Date().toISOString(),
      })
      .select("id")
      .single();

    if (formErr) {
      throw new Error(`Failed to insert form "${slug}": ${formErr.message}`);
    }

    formIdMap.set(localId, insertedForm.id);
    existingFormBySlug.set(slug, insertedForm.id);
    existingFormIds.add(insertedForm.id);
    insertedFormsCount++;
  }
  console.log(
    `Forms: ${insertedFormsCount} inserted, ${skippedFormsCount} skipped (already existed).`
  );

  // -------------------------------------------------------------------------
  // 4. Migrate Topics (skip rows that already exist)
  // -------------------------------------------------------------------------
  let insertedTopicsCount = 0;
  let skippedTopicsCount = 0;
  for (const t of rawTopics) {
    if (!t?.form_id || !t?.name) continue;
    const formId = formIdMap.get(t.form_id) || t.form_id;
    const cleanedName = normalizeTopic(t.name);
    if (!cleanedName) continue;

    const { data: existingTopics, error: topFetchErr } = await supabase
      .from("topics")
      .select("id, name")
      .eq("form_id", formId);
    if (topFetchErr) {
      throw new Error(`Failed to query topics for form "${formId}": ${topFetchErr.message}`);
    }

    const alreadyExists = (existingTopics || []).some(
      (et) => normalizeTopic(et.name)?.toLowerCase() === cleanedName.toLowerCase()
    );
    if (alreadyExists) {
      skippedTopicsCount++;
      continue;
    }

    const { error: topInsErr } = await supabase.from("topics").insert({
      id: t.id || crypto.randomUUID(),
      form_id: formId,
      name: cleanedName,
    });
    if (topInsErr) {
      throw new Error(`Failed to insert topic "${cleanedName}": ${topInsErr.message}`);
    }
    insertedTopicsCount++;
  }
  if (insertedTopicsCount > 0 || skippedTopicsCount > 0) {
    console.log(
      `Topics: ${insertedTopicsCount} inserted, ${skippedTopicsCount} skipped (already existed).`
    );
  }

  // -------------------------------------------------------------------------
  // 5. Migrate Teams (skip rows that already exist)
  // -------------------------------------------------------------------------
  const teamIdMap = new Map<string, string>();
  const teamFormMap = new Map<string, string>();
  let insertedTeamsCount = 0;
  let skippedTeamsCount = 0;

  for (const t of rawTeams) {
    if (!t?.form_id || typeof t?.team_no !== "number") continue;
    const localTeamId = t.id || crypto.randomUUID();
    const formId = formIdMap.get(t.form_id) || t.form_id;

    const { data: existingTeam, error: findTeamErr } = await supabase
      .from("teams")
      .select("id")
      .eq("form_id", formId)
      .eq("team_no", t.team_no)
      .maybeSingle();
    if (findTeamErr) {
      throw new Error(`Failed to check existing team #${t.team_no}: ${findTeamErr.message}`);
    }

    if (existingTeam) {
      teamIdMap.set(localTeamId, existingTeam.id);
      teamFormMap.set(existingTeam.id, formId);
      skippedTeamsCount++;
      continue;
    }

    const { data: insertedTeam, error: teamErr } = await supabase
      .from("teams")
      .insert({
        id: localTeamId,
        form_id: formId,
        team_no: t.team_no,
        topic: normalizeTopic(t.topic),
        submitted_at: t.submitted_at || new Date().toISOString(),
      })
      .select("id")
      .single();

    if (teamErr) {
      throw new Error(`Failed to insert team #${t.team_no}: ${teamErr.message}`);
    }

    teamIdMap.set(localTeamId, insertedTeam.id);
    teamFormMap.set(insertedTeam.id, formId);
    insertedTeamsCount++;
  }
  console.log(
    `Teams: ${insertedTeamsCount} inserted, ${skippedTeamsCount} skipped (already existed).`
  );

  // -------------------------------------------------------------------------
  // 6. Migrate Team Members (skip rows that already exist)
  // -------------------------------------------------------------------------
  const { data: existingMembers, error: fetchMemErr } = await supabase
    .from("team_members")
    .select("id, form_id, roll_no");
  if (fetchMemErr) {
    throw new Error(`Failed to query team_members table: ${fetchMemErr.message}`);
  }

  const existingMemberKeys = new Set<string>();
  const existingMemberIds = new Set<string>();
  for (const em of existingMembers || []) {
    existingMemberKeys.add(`${em.form_id}:${String(em.roll_no).trim().toUpperCase()}`);
    existingMemberIds.add(em.id);
  }

  const membersByTeam = new Map<
    string,
    { id: string; team_id: string; form_id: string; roll_no: string; position?: number }[]
  >();

  for (const m of rawMembers) {
    if (!m?.team_id || !m?.roll_no) continue;
    const mappedTeamId = teamIdMap.get(m.team_id) || m.team_id;
    const mappedFormId =
      (m.form_id ? formIdMap.get(m.form_id) || m.form_id : undefined) ||
      teamFormMap.get(mappedTeamId);
    if (!mappedFormId) continue;

    const list = membersByTeam.get(mappedTeamId) || [];
    const rollNo = String(m.roll_no).trim().toUpperCase();
    if (!list.some((item) => item.roll_no === rollNo)) {
      list.push({
        id: m.id || crypto.randomUUID(),
        team_id: mappedTeamId,
        form_id: mappedFormId,
        roll_no: rollNo,
        position: typeof m.position === "number" ? m.position : undefined,
      });
      membersByTeam.set(mappedTeamId, list);
    }
  }

  let insertedMembersCount = 0;
  let skippedMembersCount = 0;
  for (const [, teamMembers] of membersByTeam.entries()) {
    teamMembers.sort((a, b) => {
      if (a.position !== undefined && b.position !== undefined && a.position !== b.position) {
        return a.position - b.position;
      }
      return compareRollNumbers(a.roll_no, b.roll_no);
    });

    const rowsToInsert: {
      id: string;
      team_id: string;
      form_id: string;
      roll_no: string;
      position: number;
    }[] = [];

    teamMembers.forEach((m, idx) => {
      const key = `${m.form_id}:${m.roll_no}`;
      if (existingMemberKeys.has(key) || existingMemberIds.has(m.id)) {
        skippedMembersCount++;
        return;
      }
      existingMemberKeys.add(key);
      existingMemberIds.add(m.id);
      rowsToInsert.push({
        id: m.id,
        team_id: m.team_id,
        form_id: m.form_id,
        roll_no: m.roll_no,
        position: m.position ?? idx + 1,
      });
    });

    if (rowsToInsert.length > 0) {
      const { error: memErr } = await supabase.from("team_members").insert(rowsToInsert);
      if (memErr) {
        throw new Error(`Failed to insert team members: ${memErr.message}`);
      }
      insertedMembersCount += rowsToInsert.length;
    }
  }
  console.log(
    `Team members: ${insertedMembersCount} inserted, ${skippedMembersCount} skipped (already existed).`
  );
  console.log("Migration completed successfully. (local-db.json was not modified or deleted.)");
}

if (require.main === module) {
  runMigration().catch((err) => {
    console.error("[Migration Failed]", err?.message || err);
    process.exit(1);
  });
}
