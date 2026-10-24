import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import { AppError } from "../middleware/errorHandler";
import { compareRollNumbers, normalizeTopic, StudentRow } from "../utils/csv";

export type AdminRole = "admin" | "super_admin";

export interface AdminRecord {
  id: string;
  email: string;
  password_hash: string;
  role: AdminRole;
  created_at: string;
}

export interface AdminPublic {
  id: string;
  email: string;
  role: AdminRole;
  created_at: string;
}

export interface FormRecord {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  min_team_size: number;
  max_team_size: number;
  collect_topic: boolean;
  allow_topic_repeat: boolean;
  is_open: boolean;
  created_by: string | null;
  created_at: string;
}

export interface FormEnriched extends FormRecord {
  hasTopicOptions: boolean;
  topicsCount: number;
  created_by_email?: string | null;
}

export interface TopicRecord {
  id: string;
  form_id: string;
  name: string;
}

export interface TopicOptionWithStatus {
  id: string;
  form_id: string;
  name: string;
  taken: boolean;
  teamNo?: number;
}

export interface TeamRecord {
  id: string;
  form_id: string;
  team_no: number;
  topic: string | null;
  submitted_at: string;
}

export interface TeamMemberRecord {
  id: string;
  team_id: string;
  form_id: string;
  roll_no: string;
  position: number;
}

export interface TeamMemberDetail {
  roll_no: string;
  name: string;
  gender: "M" | "F";
  position: number;
}

export interface TeamWithMembers {
  id: string;
  form_id: string;
  team_no: number;
  topic: string | null;
  submitted_at: string;
  members: TeamMemberDetail[];
}

export interface FormStats {
  boys: number;
  girls: number;
  total: number;
  teams: number;
  classTotal: number;
  classBoys: number;
  classGirls: number;
}

if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set."
  );
}

export const supabase: SupabaseClient = createClient(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

function handleSupabaseError(error: any): never {
  const rawMsg: string = error?.message || "Database operation failed";
  console.error("[Database Error]", {
    code: error?.code,
    message: rawMsg,
    details: error?.details,
    hint: error?.hint,
  });

  if (rawMsg.includes("row-level security policy") || error?.code === "42501") {
    throw new AppError(
      500,
      "DATABASE_RLS_ERROR",
      "Database permission error. Ensure SUPABASE_SERVICE_ROLE_KEY is set to the secret service_role / sb_secret_ key."
    );
  }
  if (
    rawMsg.includes("Could not find the table") ||
    rawMsg.includes("Could not find the ") ||
    rawMsg.includes("schema cache") ||
    rawMsg.includes("does not exist") ||
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "42883" ||
    error?.code === "PGRST202" ||
    error?.code === "PGRST204" ||
    error?.code === "PGRST205"
  ) {
    throw new AppError(
      500,
      "DATABASE_SCHEMA_ERROR",
      "Database schema is out of sync with the application. Please run backend/supabase/migrations/002_upgrade.sql in the Supabase SQL Editor."
    );
  }
  if (error?.code === "22P02") {
    throw new AppError(400, "INVALID_ID", "Invalid identifier format.");
  }
  if (error?.code === "23505") {
    throw new AppError(409, "CONFLICT", "A record with these details already exists.");
  }
  if (error?.code === "23503") {
    throw new AppError(400, "FOREIGN_KEY_ERROR", "Referenced record was not found.");
  }
  if (error?.code === "23514") {
    throw new AppError(400, "CHECK_CONSTRAINT_ERROR", "Provided values are outside the allowed range.");
  }
  throw new AppError(500, "DATABASE_ERROR", "A database error occurred. Please try again.");
}

// ---------------------------------------------------------------------------
// Admins
// ---------------------------------------------------------------------------

export async function getAdminByEmail(rawEmail: string): Promise<AdminRecord | null> {
  const email = rawEmail.trim().toLowerCase();
  const { data, error } = await supabase
    .from("admins")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  if (error) handleSupabaseError(error);
  if (data) return data as AdminRecord;

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("admins")
    .select("*")
    .ilike("email", email)
    .maybeSingle();
  if (fallbackError) handleSupabaseError(fallbackError);
  return (fallbackData as AdminRecord) || null;
}

export async function getAdminById(id: string): Promise<AdminRecord | null> {
  const { data, error } = await supabase
    .from("admins")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) handleSupabaseError(error);
  return (data as AdminRecord) || null;
}

export async function listAdmins(): Promise<AdminPublic[]> {
  const { data, error } = await supabase
    .from("admins")
    .select("id, email, role, created_at")
    .order("created_at", { ascending: true });
  if (error) handleSupabaseError(error);
  return (data || []) as AdminPublic[];
}

export async function createAdmin(input: {
  email: string;
  passwordHash: string;
  role: AdminRole;
}): Promise<AdminPublic> {
  const email = input.email.trim().toLowerCase();

  const existing = await getAdminByEmail(email);
  if (existing) {
    throw new AppError(409, "ADMIN_EXISTS", `An admin with email "${email}" already exists.`);
  }

  const { data, error } = await supabase
    .from("admins")
    .insert({
      email,
      password_hash: input.passwordHash,
      role: input.role,
    })
    .select("id, email, role, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AppError(409, "ADMIN_EXISTS", `An admin with email "${email}" already exists.`);
    }
    handleSupabaseError(error);
  }

  return data as AdminPublic;
}

export async function updateAdminPassword(adminId: string, newPasswordHash: string): Promise<void> {
  const { data, error } = await supabase
    .from("admins")
    .update({ password_hash: newPasswordHash })
    .eq("id", adminId)
    .select("id")
    .maybeSingle();
  if (error) handleSupabaseError(error);
  if (!data) {
    throw new AppError(404, "ADMIN_NOT_FOUND", "Admin account not found.");
  }
}

export async function deleteAdminById(adminId: string, requestingAdminId: string): Promise<void> {
  if (adminId === requestingAdminId) {
    throw new AppError(400, "CANNOT_DELETE_SELF", "You cannot delete your own admin account.");
  }

  const allAdmins = await listAdmins();
  const target = allAdmins.find((a) => a.id === adminId);
  if (!target) {
    throw new AppError(404, "ADMIN_NOT_FOUND", "Admin account not found.");
  }

  if (target.role === "super_admin") {
    const superAdminCount = allAdmins.filter((a) => a.role === "super_admin").length;
    if (superAdminCount <= 1) {
      throw new AppError(
        400,
        "LAST_SUPER_ADMIN",
        "Cannot delete the last super admin account."
      );
    }
  }

  const { error } = await supabase.from("admins").delete().eq("id", adminId);
  if (error) handleSupabaseError(error);
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

export async function upsertStudents(
  students: StudentRow[]
): Promise<{ total: number; boys: number; girls: number }> {
  const rows = students.map((s) => ({
    roll_no: s.roll_no.trim().toUpperCase(),
    name: s.name.trim(),
    gender: s.gender,
  }));
  const { error } = await supabase.from("students").upsert(rows, { onConflict: "roll_no" });
  if (error) handleSupabaseError(error);
  return getClassStats();
}

export async function getClassStats(): Promise<{ total: number; boys: number; girls: number }> {
  const { data, error } = await supabase.from("students").select("gender");
  if (error) handleSupabaseError(error);
  const list = data || [];
  const boys = list.filter((s) => s.gender === "M").length;
  const girls = list.filter((s) => s.gender === "F").length;
  return { total: list.length, boys, girls };
}

export async function getAllStudents(): Promise<StudentRow[]> {
  const { data, error } = await supabase
    .from("students")
    .select("roll_no, name, gender")
    .order("roll_no", { ascending: true });
  if (error) handleSupabaseError(error);
  return ((data || []) as StudentRow[]).sort((a, b) => compareRollNumbers(a.roll_no, b.roll_no));
}

export async function getStudentByRoll(rollNo: string): Promise<StudentRow | null> {
  const normalized = rollNo.trim().toUpperCase();
  const { data, error } = await supabase
    .from("students")
    .select("roll_no, name, gender")
    .ilike("roll_no", normalized)
    .maybeSingle();
  if (error) handleSupabaseError(error);
  return (data as StudentRow) || null;
}

// ---------------------------------------------------------------------------
// Forms & Enrichment
// ---------------------------------------------------------------------------

async function enrichFormRecord(form: FormRecord): Promise<FormEnriched> {
  const [{ count: topicsCount, error: tErr }, creatorRes] = await Promise.all([
    supabase.from("topics").select("*", { count: "exact", head: true }).eq("form_id", form.id),
    form.created_by
      ? supabase.from("admins").select("email").eq("id", form.created_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (tErr) handleSupabaseError(tErr);
  if (creatorRes.error) handleSupabaseError(creatorRes.error);
  const count = topicsCount || 0;
  return {
    ...form,
    hasTopicOptions: count > 0,
    topicsCount: count,
    created_by_email: (creatorRes.data as any)?.email ?? null,
  };
}

export async function listForms(): Promise<FormEnriched[]> {
  const { data, error } = await supabase
    .from("forms")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) handleSupabaseError(error);
  const rawForms = (data || []) as FormRecord[];
  return Promise.all(rawForms.map(enrichFormRecord));
}

export async function getFormBySlug(slug: string): Promise<FormEnriched | null> {
  const cleanSlug = slug.trim().toLowerCase();
  const { data, error } = await supabase
    .from("forms")
    .select("*")
    .eq("slug", cleanSlug)
    .maybeSingle();
  if (error) handleSupabaseError(error);
  if (!data) return null;
  return enrichFormRecord(data as FormRecord);
}

export async function getFormById(id: string): Promise<FormEnriched | null> {
  const { data, error } = await supabase
    .from("forms")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) handleSupabaseError(error);
  if (!data) return null;
  return enrichFormRecord(data as FormRecord);
}

export async function createForm(input: {
  slug: string;
  title: string;
  description?: string | null;
  min_team_size: number;
  max_team_size: number;
  collect_topic?: boolean;
  allow_topic_repeat?: boolean;
  is_open?: boolean;
  created_by?: string | null;
}): Promise<FormEnriched> {
  const cleanSlug = input.slug.trim().toLowerCase();

  if (input.min_team_size > input.max_team_size) {
    throw new AppError(
      400,
      "INVALID_TEAM_SIZE_RANGE",
      "Minimum team size cannot be greater than maximum team size."
    );
  }

  const { data, error } = await supabase
    .from("forms")
    .insert({
      slug: cleanSlug,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      min_team_size: input.min_team_size,
      max_team_size: input.max_team_size,
      collect_topic: input.collect_topic ?? false,
      allow_topic_repeat: input.allow_topic_repeat ?? true,
      is_open: input.is_open ?? true,
      created_by: input.created_by ?? null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new AppError(409, "SLUG_TAKEN", `A form with slug "${cleanSlug}" already exists.`);
    }
    handleSupabaseError(error);
  }

  return enrichFormRecord(data as FormRecord);
}

export async function updateForm(
  id: string,
  patch: Partial<{
    slug: string;
    title: string;
    description: string | null;
    min_team_size: number;
    max_team_size: number;
    collect_topic: boolean;
    allow_topic_repeat: boolean;
    is_open: boolean;
  }>
): Promise<FormEnriched> {
  const existing = await getFormById(id);
  if (!existing) {
    throw new AppError(404, "FORM_NOT_FOUND", "Form not found.");
  }

  const nextMin = patch.min_team_size ?? existing.min_team_size;
  const nextMax = patch.max_team_size ?? existing.max_team_size;
  const nextCollectTopic = patch.collect_topic ?? existing.collect_topic;

  if (nextMin > nextMax) {
    throw new AppError(
      400,
      "INVALID_TEAM_SIZE_RANGE",
      `Minimum team size (${nextMin}) cannot be greater than maximum team size (${nextMax}).`
    );
  }

  // Validate against existing submissions so no setting change invalidates existing teams
  const existingTeams = await getFormResponses(id);
  if (existingTeams.length > 0) {
    // 1. Check min/max team size against existing team member counts
    if (patch.min_team_size !== undefined || patch.max_team_size !== undefined) {
      for (const team of existingTeams) {
        const memberCount = team.members.length;
        if (memberCount < nextMin || memberCount > nextMax) {
          throw new AppError(
            400,
            "EXISTING_DATA_CONFLICT",
            `Cannot change team size range to ${nextMin}–${nextMax} because existing Team #${team.team_no} has ${memberCount} member(s).`
          );
        }
      }
    }

    // 2. If turning ON collect_topic when existing teams have no topic
    if (patch.collect_topic === true && !existing.collect_topic) {
      const teamMissingTopic = existingTeams.find((t) => !t.topic || !t.topic.trim());
      if (teamMissingTopic) {
        throw new AppError(
          400,
          "EXISTING_DATA_CONFLICT",
          `Cannot enable topic collection because existing Team #${teamMissingTopic.team_no} was registered without a topic.`
        );
      }
    }

    // 3. If turning OFF allow_topic_repeat when duplicate topics already exist
    if (patch.allow_topic_repeat === false && existing.allow_topic_repeat && nextCollectTopic) {
      const topicTeamMap = new Map<string, number>();
      for (const team of existingTeams) {
        const norm = normalizeTopic(team.topic)?.toLowerCase();
        if (!norm) continue;
        const firstTeamNo = topicTeamMap.get(norm);
        if (firstTeamNo !== undefined) {
          throw new AppError(
            400,
            "EXISTING_DATA_CONFLICT",
            `Cannot disable topic repetition because topic "${team.topic}" is already shared by Team #${firstTeamNo} and Team #${team.team_no}.`
          );
        }
        topicTeamMap.set(norm, team.team_no);
      }
    }
  }

  const cleanPatch: Record<string, any> = {};
  if (patch.slug !== undefined) cleanPatch.slug = patch.slug.trim().toLowerCase();
  if (patch.title !== undefined) cleanPatch.title = patch.title.trim();
  if (patch.description !== undefined) cleanPatch.description = patch.description?.trim() || null;
  if (patch.min_team_size !== undefined) cleanPatch.min_team_size = patch.min_team_size;
  if (patch.max_team_size !== undefined) cleanPatch.max_team_size = patch.max_team_size;
  if (patch.collect_topic !== undefined) cleanPatch.collect_topic = patch.collect_topic;
  if (patch.allow_topic_repeat !== undefined) cleanPatch.allow_topic_repeat = patch.allow_topic_repeat;
  if (patch.is_open !== undefined) cleanPatch.is_open = patch.is_open;

  const { data, error } = await supabase
    .from("forms")
    .update(cleanPatch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      throw new AppError(409, "SLUG_TAKEN", `A form with slug "${cleanPatch.slug}" already exists.`);
    }
    handleSupabaseError(error);
  }
  if (!data) {
    throw new AppError(404, "FORM_NOT_FOUND", "Form not found.");
  }
  return enrichFormRecord(data as FormRecord);
}

export async function deleteForm(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("forms")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) handleSupabaseError(error);
  if (!data) {
    throw new AppError(404, "FORM_NOT_FOUND", "Form not found.");
  }
}

// ---------------------------------------------------------------------------
// Topics per Form
// ---------------------------------------------------------------------------

export async function getFormTopics(
  formId: string,
  options?: { respectAllowRepeat?: boolean; allowTopicRepeat?: boolean }
): Promise<TopicOptionWithStatus[]> {
  const [topicsRes, teamsRes] = await Promise.all([
    supabase
      .from("topics")
      .select("id, form_id, name")
      .eq("form_id", formId)
      .order("name", { ascending: true }),
    supabase
      .from("teams")
      .select("team_no, topic")
      .eq("form_id", formId)
      .order("team_no", { ascending: true }),
  ]);
  if (topicsRes.error) handleSupabaseError(topicsRes.error);
  if (teamsRes.error) handleSupabaseError(teamsRes.error);

  const topicsList = (topicsRes.data || []) as TopicRecord[];
  const teamsList = (teamsRes.data || []) as { team_no: number; topic: string | null }[];

  // Map lower(btrim(topic)) -> lowest team_no that claimed it
  const takenByTeam = new Map<string, number>();
  for (const t of teamsList) {
    const norm = normalizeTopic(t.topic)?.toLowerCase();
    if (norm && !takenByTeam.has(norm)) {
      takenByTeam.set(norm, t.team_no);
    }
  }

  const ignoreTaken = options?.respectAllowRepeat && options?.allowTopicRepeat;

  return topicsList.map((topic) => {
    const key = normalizeTopic(topic.name)?.toLowerCase() || "";
    const teamNo = takenByTeam.get(key);
    if (ignoreTaken || teamNo === undefined) {
      return {
        id: topic.id,
        form_id: topic.form_id,
        name: topic.name,
        taken: false,
      };
    }
    return {
      id: topic.id,
      form_id: topic.form_id,
      name: topic.name,
      taken: true,
      teamNo,
    };
  });
}

export async function uploadFormTopics(
  formId: string,
  topicNames: string[]
): Promise<TopicOptionWithStatus[]> {
  const form = await getFormById(formId);
  if (!form) {
    throw new AppError(404, "FORM_NOT_FOUND", "Form not found.");
  }

  // Deduplicate case-insensitively
  const seen = new Set<string>();
  const uniqueNames: string[] = [];
  for (const raw of topicNames) {
    const cleaned = normalizeTopic(raw);
    if (!cleaned) continue;
    const lower = cleaned.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      uniqueNames.push(cleaned);
    }
  }

  // Replace existing topics for this form with the uploaded deduplicated list
  const { error: delErr } = await supabase.from("topics").delete().eq("form_id", formId);
  if (delErr) handleSupabaseError(delErr);

  if (uniqueNames.length > 0) {
    const rows = uniqueNames.map((name) => ({ form_id: formId, name }));
    const { error: insErr } = await supabase.from("topics").insert(rows);
    if (insErr) handleSupabaseError(insErr);
  }

  return getFormTopics(formId);
}

export async function deleteFormTopic(formId: string, topicId: string): Promise<void> {
  const { data, error } = await supabase
    .from("topics")
    .delete()
    .eq("id", topicId)
    .eq("form_id", formId)
    .select("id")
    .maybeSingle();
  if (error) handleSupabaseError(error);
  if (!data) {
    throw new AppError(404, "TOPIC_NOT_FOUND", "Topic not found.");
  }
}

export async function checkTopicForForm(
  formId: string,
  rawTopic: string
): Promise<{ status: "available" | "taken"; teamNo?: number }> {
  const form = await getFormById(formId);
  if (!form) {
    throw new AppError(404, "FORM_NOT_FOUND", "Form not found.");
  }

  const normalized = normalizeTopic(rawTopic);
  if (!normalized || form.allow_topic_repeat) {
    return { status: "available" };
  }

  const targetLower = normalized.toLowerCase();

  const { data, error } = await supabase
    .from("teams")
    .select("team_no, topic")
    .eq("form_id", formId)
    .order("team_no", { ascending: true });
  if (error) handleSupabaseError(error);

  for (const row of (data || []) as { team_no: number; topic: string | null }[]) {
    const rowTopic = normalizeTopic(row.topic)?.toLowerCase();
    if (rowTopic && rowTopic === targetLower) {
      return { status: "taken", teamNo: row.team_no };
    }
  }
  return { status: "available" };
}

// ---------------------------------------------------------------------------
// Stats, Roll Check, Submissions & Responses
// ---------------------------------------------------------------------------

export async function getFormStats(formId: string): Promise<FormStats> {
  const classStats = await getClassStats();

  const [{ count: teamsCount, error: teamsErr }, { data: membersData, error: membersErr }] =
    await Promise.all([
      supabase.from("teams").select("*", { count: "exact", head: true }).eq("form_id", formId),
      supabase
        .from("team_members")
        .select("roll_no, students(gender)")
        .eq("form_id", formId),
    ]);

  if (teamsErr) handleSupabaseError(teamsErr);
  if (membersErr) handleSupabaseError(membersErr);

  let boys = 0;
  let girls = 0;
  for (const row of (membersData as any[]) || []) {
    const studentObj = Array.isArray(row.students) ? row.students[0] : row.students;
    const g = studentObj?.gender;
    if (g === "M") boys++;
    else if (g === "F") girls++;
  }

  return {
    boys,
    girls,
    total: boys + girls,
    teams: teamsCount || 0,
    classTotal: classStats.total,
    classBoys: classStats.boys,
    classGirls: classStats.girls,
  };
}

export async function checkRollForForm(
  formId: string,
  rawRoll: string
): Promise<{
  status: "available" | "taken" | "not_found";
  name?: string;
  gender?: "M" | "F";
  teamNo?: number;
}> {
  const rollNo = rawRoll.trim().toUpperCase();
  const student = await getStudentByRoll(rollNo);

  if (!student) {
    return { status: "not_found" };
  }

  const { data, error } = await supabase
    .from("team_members")
    .select("team_id, teams(team_no)")
    .eq("form_id", formId)
    .eq("roll_no", student.roll_no)
    .maybeSingle();

  if (error) handleSupabaseError(error);

  if (data) {
    const teamObj = Array.isArray((data as any).teams) ? (data as any).teams[0] : (data as any).teams;
    return {
      status: "taken",
      name: student.name,
      gender: student.gender,
      teamNo: teamObj?.team_no,
    };
  }

  return {
    status: "available",
    name: student.name,
    gender: student.gender,
  };
}

export async function submitTeamAtomic(
  formId: string,
  rawRolls: string[],
  rawTopic?: string | null
): Promise<{
  teamNo: number;
  teamId: string;
  topic: string | null;
  members: TeamMemberDetail[];
}> {
  const rolls = rawRolls.map((r) => r.trim().toUpperCase());

  const form = await getFormById(formId);
  if (!form) {
    throw new AppError(404, "FORM_NOT_FOUND", "Form not found.");
  }
  if (!form.is_open) {
    throw new AppError(403, "FORM_CLOSED", "This registration form is currently closed.");
  }

  const uniqueRolls = new Set(rolls);
  if (uniqueRolls.size !== rolls.length) {
    throw new AppError(
      400,
      "DUPLICATE_IN_TEAM",
      "Duplicate roll numbers entered within the same team."
    );
  }

  if (rolls.length < form.min_team_size || rolls.length > form.max_team_size) {
    const sizeText =
      form.min_team_size === form.max_team_size
        ? `exactly ${form.min_team_size}`
        : `between ${form.min_team_size} and ${form.max_team_size}`;
    throw new AppError(
      400,
      "WRONG_TEAM_SIZE",
      `Expected ${sizeText} team member(s), but received ${rolls.length}.`
    );
  }

  // Natural sort: shorter roll first, then alphabetical
  const sortedRolls = [...rolls].sort(compareRollNumbers);

  // Verify all students exist in classlist and build sorted members array
  const members: TeamMemberDetail[] = [];
  for (let i = 0; i < sortedRolls.length; i++) {
    const r = sortedRolls[i];
    const student = await getStudentByRoll(r);
    if (!student) {
      throw new AppError(
        400,
        "ROLL_NOT_FOUND",
        `Roll number ${r} was not found in the class list.`,
        { rollNo: r }
      );
    }
    members.push({
      roll_no: student.roll_no,
      name: student.name,
      gender: student.gender,
      position: i + 1,
    });
  }

  // Validate topic rules
  let finalTopic: string | null = null;
  if (form.collect_topic) {
    const cleaned = normalizeTopic(rawTopic);
    if (!cleaned) {
      throw new AppError(400, "TOPIC_REQUIRED", "A topic is required for this form.");
    }

    const topicOptions = await getFormTopics(formId);
    if (topicOptions.length > 0) {
      const matchedOption = topicOptions.find(
        (o) => normalizeTopic(o.name)?.toLowerCase() === cleaned.toLowerCase()
      );
      if (!matchedOption) {
        throw new AppError(
          400,
          "TOPIC_INVALID",
          "Please select a valid topic from the available options."
        );
      }
      finalTopic = matchedOption.name;
    } else {
      finalTopic = cleaned;
    }

    if (!form.allow_topic_repeat) {
      const topicCheck = await checkTopicForForm(formId, finalTopic);
      if (topicCheck.status === "taken") {
        throw new AppError(
          409,
          "TOPIC_TAKEN",
          `Topic already chosen by Team ${topicCheck.teamNo}`,
          { teamNo: topicCheck.teamNo }
        );
      }
    }
  }

  const { data, error } = await supabase.rpc("submit_team", {
    p_form_id: formId,
    p_rolls: sortedRolls,
    p_topic: finalTopic,
  });

  if (error) {
    const msg = error.message || "";
    if (msg.includes("FORM_NOT_FOUND")) {
      throw new AppError(404, "FORM_NOT_FOUND", "Form not found.");
    }
    if (msg.includes("FORM_CLOSED")) {
      throw new AppError(403, "FORM_CLOSED", "This registration form is currently closed.");
    }
    if (msg.includes("WRONG_TEAM_SIZE")) {
      throw new AppError(400, "WRONG_TEAM_SIZE", "Invalid number of team members.");
    }
    if (msg.includes("DUPLICATE_IN_TEAM")) {
      throw new AppError(400, "DUPLICATE_IN_TEAM", "Duplicate roll numbers in this team.");
    }
    if (msg.includes("TOPIC_REQUIRED")) {
      throw new AppError(400, "TOPIC_REQUIRED", "A topic is required for this form.");
    }
    if (msg.includes("TOPIC_INVALID")) {
      throw new AppError(400, "TOPIC_INVALID", "Selected topic is not valid for this form.");
    }
    const topicTakenMatch = msg.match(/TOPIC_TAKEN:(\d+)/);
    if (topicTakenMatch) {
      const takenNo = Number(topicTakenMatch[1]);
      throw new AppError(
        409,
        "TOPIC_TAKEN",
        `Topic already chosen by Team ${takenNo}`,
        { teamNo: takenNo }
      );
    }
    if (error.code === "23505" || msg.includes("duplicate key") || msg.includes("unique")) {
      for (const r of sortedRolls) {
        const check = await checkRollForForm(formId, r);
        if (check.status === "taken") {
          throw new AppError(
            409,
            "ALREADY_REGISTERED",
            `Roll number ${r} is already registered in Team ${check.teamNo}.`,
            { rollNo: r, teamNo: check.teamNo }
          );
        }
      }
      throw new AppError(
        409,
        "ALREADY_REGISTERED",
        "One or more roll numbers are already registered in another team."
      );
    }
    handleSupabaseError(error);
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    teamNo: row.team_no,
    teamId: row.team_id,
    topic: finalTopic,
    members,
  };
}

export async function getFormResponses(formId: string): Promise<TeamWithMembers[]> {
  const { data: teamsData, error: teamsErr } = await supabase
    .from("teams")
    .select("id, form_id, team_no, topic, submitted_at")
    .eq("form_id", formId)
    .order("team_no", { ascending: true });

  if (teamsErr) handleSupabaseError(teamsErr);

  const { data: membersData, error: membersErr } = await supabase
    .from("team_members")
    .select("id, team_id, roll_no, position, students(name, gender)")
    .eq("form_id", formId)
    .order("position", { ascending: true });

  if (membersErr) handleSupabaseError(membersErr);

  const membersByTeam = new Map<string, TeamMemberDetail[]>();
  for (const m of (membersData as any[]) || []) {
    const st = Array.isArray(m.students) ? m.students[0] : m.students;
    const list = membersByTeam.get(m.team_id) || [];
    list.push({
      roll_no: m.roll_no,
      name: st?.name || "Unknown",
      gender: st?.gender || "M",
      position: typeof m.position === "number" ? m.position : list.length + 1,
    });
    membersByTeam.set(m.team_id, list);
  }

  return ((teamsData as TeamRecord[]) || []).map((t) => {
    const teamMembers = (membersByTeam.get(t.id) || []).sort((a, b) =>
      a.position !== b.position ? a.position - b.position : compareRollNumbers(a.roll_no, b.roll_no)
    );
    return {
      ...t,
      topic: t.topic ?? null,
      members: teamMembers,
    };
  });
}

export async function deleteTeamById(teamId: string): Promise<void> {
  const { data, error } = await supabase
    .from("teams")
    .delete()
    .eq("id", teamId)
    .select("id")
    .maybeSingle();
  if (error) handleSupabaseError(error);
  if (!data) {
    throw new AppError(404, "TEAM_NOT_FOUND", "Team not found.");
  }
}
