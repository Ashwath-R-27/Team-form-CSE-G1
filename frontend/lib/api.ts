export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"
)
  .trim()
  .replace(/\/+$/, "");

const TOKEN_STORAGE_KEY = "team_reg_admin_token";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors (e.g., private browsing or disabled storage)
  }
}

export function clearAdminToken(): void {
  setAdminToken(null);
}

function handleUnauthorized(): void {
  clearAdminToken();
  if (typeof window !== "undefined" && window.location.pathname !== "/admin/login") {
    window.location.replace("/admin/login");
  }
}

export type AdminRole = "admin" | "super_admin";

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  created_at?: string;
}

export interface StudentMember {
  roll_no: string;
  name: string;
  gender: "M" | "F";
  position?: number;
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

export interface FormInfo {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  min_team_size: number;
  max_team_size: number;
  collect_topic: boolean;
  allow_topic_repeat: boolean;
  is_open: boolean;
  hasTopicOptions?: boolean;
  topicsCount?: number;
  created_by?: string | null;
  created_by_email?: string | null;
  created_at: string;
  stats?: FormStats;
}

export interface TopicOption {
  id: string;
  form_id?: string;
  name: string;
  taken: boolean;
  teamNo?: number;
}

export interface CheckRollResponse {
  status: "available" | "taken" | "not_found";
  name?: string;
  gender?: "M" | "F";
  teamNo?: number;
}

export interface CheckTopicResponse {
  status: "available" | "taken";
  teamNo?: number;
}

export interface SubmitTeamResult {
  teamNo: number;
  teamId: string;
  topic: string | null;
  members: StudentMember[];
}

export interface TeamResponseItem {
  id: string;
  form_id: string;
  team_no: number;
  topic: string | null;
  submitted_at: string;
  members: StudentMember[];
}

export interface ClassStats {
  total: number;
  boys: number;
  girls: number;
}

export class ApiClientError extends Error {
  status: number;
  code: string;
  rollNo?: string;
  teamNo?: number;

  constructor(
    status: number,
    code: string,
    message: string,
    extra?: { rollNo?: string; teamNo?: number }
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.rollNo = extra?.rollNo;
    this.teamNo = extra?.teamNo;
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const { auth = false, headers, ...rest } = options;
  const reqHeaders = new Headers(headers || {});

  if (
    rest.body !== undefined &&
    !(rest.body instanceof FormData) &&
    !reqHeaders.has("Content-Type")
  ) {
    reqHeaders.set("Content-Type", "application/json");
  }

  if (auth) {
    const token = getAdminToken();
    if (token) {
      reqHeaders.set("Authorization", `Bearer ${token}`);
    }
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: reqHeaders,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw err;
    }
    throw new ApiClientError(
      0,
      "NETWORK_ERROR",
      "Network or CORS error: unable to reach the server. The server may be starting up, please retry in a few seconds"
    );
  }

  if (res.status === 401 && auth) {
    handleUnauthorized();
  }

  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw new ApiClientError(
      res.status,
      "SERVER_WAKING_UP",
      "The server may be starting up, please retry in a few seconds"
    );
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiClientError(
      res.status,
      data?.code || data?.error || "API_ERROR",
      data?.message || `Request failed with status ${res.status}`,
      { rollNo: data?.rollNo, teamNo: data?.teamNo }
    );
  }

  return data as T;
}

export function formatTeamSizeLabel(min: number, max: number): string {
  return min === max ? `${min}` : `${min}–${max}`;
}

// -----------------------------------------------------------------------------
// Public Endpoints
// -----------------------------------------------------------------------------

export async function fetchPublicForms(): Promise<{ forms: FormInfo[] }> {
  return apiFetch<{ forms: FormInfo[] }>("/api/forms");
}

export async function fetchFormBySlug(slug: string): Promise<FormInfo> {
  return apiFetch<FormInfo>(`/api/forms/${encodeURIComponent(slug)}`);
}

export async function fetchFormStats(slug: string): Promise<FormStats> {
  return apiFetch<FormStats>(`/api/forms/${encodeURIComponent(slug)}/stats`);
}

export async function checkRollNumber(
  slug: string,
  roll: string,
  signal?: AbortSignal
): Promise<CheckRollResponse> {
  return apiFetch<CheckRollResponse>(
    `/api/forms/${encodeURIComponent(slug)}/check-roll/${encodeURIComponent(
      roll.trim().toUpperCase()
    )}`,
    { signal }
  );
}

export async function fetchPublicFormTopics(
  slug: string
): Promise<{ topics: TopicOption[] }> {
  return apiFetch<{ topics: TopicOption[] }>(
    `/api/forms/${encodeURIComponent(slug)}/topics`
  );
}

export async function checkTopicForForm(
  slug: string,
  topic: string,
  signal?: AbortSignal
): Promise<CheckTopicResponse> {
  return apiFetch<CheckTopicResponse>(
    `/api/forms/${encodeURIComponent(slug)}/check-topic?topic=${encodeURIComponent(
      topic
    )}`,
    { signal }
  );
}

export async function submitTeamForForm(
  slug: string,
  rolls: string[],
  topic?: string
): Promise<SubmitTeamResult> {
  return apiFetch<SubmitTeamResult>(
    `/api/forms/${encodeURIComponent(slug)}/submit`,
    {
      method: "POST",
      body: JSON.stringify({
        rolls: rolls.map((r) => r.trim().toUpperCase()),
        ...(topic !== undefined ? { topic } : {}),
      }),
    }
  );
}

// -----------------------------------------------------------------------------
// Admin Auth & Management Endpoints
// -----------------------------------------------------------------------------

export async function adminLogin(
  email: string,
  password: string
): Promise<{ token: string; admin: AdminUser }> {
  const res = await apiFetch<{
    token: string;
    admin: AdminUser;
  }>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  if (res.token) {
    setAdminToken(res.token);
  }
  return res;
}

export async function adminLogout(): Promise<void> {
  clearAdminToken();
}

export async function fetchAdminMe(): Promise<{
  ok: boolean;
  admin: AdminUser;
  classStats: ClassStats;
}> {
  return apiFetch("/api/admin/me", { auth: true });
}

export async function adminChangePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean; message: string }> {
  return apiFetch("/api/admin/change-password", {
    method: "POST",
    auth: true,
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function fetchAdminList(): Promise<{ admins: AdminUser[] }> {
  return apiFetch("/api/admin/admins", { auth: true });
}

export async function createNewAdmin(payload: {
  email: string;
  password: string;
  role: AdminRole;
}): Promise<{ admin: AdminUser }> {
  return apiFetch("/api/admin/admins", {
    method: "POST",
    auth: true,
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminAccount(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/admins/${encodeURIComponent(id)}`, {
    method: "DELETE",
    auth: true,
  });
}

export async function resetAdminPassword(
  id: string,
  newPassword: string
): Promise<{ ok: boolean; message: string }> {
  return apiFetch(`/api/admin/admins/${encodeURIComponent(id)}/reset-password`, {
    method: "POST",
    auth: true,
    body: JSON.stringify({ newPassword }),
  });
}

// -----------------------------------------------------------------------------
// Admin Forms, Topics, Responses & Exports
// -----------------------------------------------------------------------------

export async function fetchAdminForms(): Promise<{
  forms: FormInfo[];
  classStats: ClassStats;
}> {
  return apiFetch("/api/admin/forms", { auth: true });
}

export async function createAdminForm(payload: {
  title: string;
  description?: string;
  slug?: string;
  min_team_size: number;
  max_team_size: number;
  collect_topic?: boolean;
  allow_topic_repeat?: boolean;
  is_open?: boolean;
}): Promise<{ form: FormInfo }> {
  return apiFetch("/api/admin/forms", {
    method: "POST",
    auth: true,
    body: JSON.stringify(payload),
  });
}

export async function updateAdminForm(
  id: string,
  patch: Partial<{
    title: string;
    description: string | null;
    slug: string;
    min_team_size: number;
    max_team_size: number;
    collect_topic: boolean;
    allow_topic_repeat: boolean;
    is_open: boolean;
  }>
): Promise<{ form: FormInfo }> {
  return apiFetch(`/api/admin/forms/${encodeURIComponent(id)}`, {
    method: "PATCH",
    auth: true,
    body: JSON.stringify(patch),
  });
}

export async function deleteAdminForm(id: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/forms/${encodeURIComponent(id)}`, {
    method: "DELETE",
    auth: true,
  });
}

export async function fetchAdminFormResponses(id: string): Promise<{
  form: FormInfo;
  stats: FormStats;
  responses: TeamResponseItem[];
  topics: TopicOption[];
}> {
  return apiFetch(`/api/admin/forms/${encodeURIComponent(id)}/responses`, {
    auth: true,
  });
}

export async function deleteAdminTeam(teamId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/teams/${encodeURIComponent(teamId)}`, {
    method: "DELETE",
    auth: true,
  });
}

export async function fetchAdminFormTopics(
  formId: string
): Promise<{ topics: TopicOption[] }> {
  return apiFetch(`/api/admin/forms/${encodeURIComponent(formId)}/topics`, {
    auth: true,
  });
}

export async function uploadFormTopicsCsv(
  formId: string,
  file: File
): Promise<{
  ok: boolean;
  uploaded: number;
  topics: TopicOption[];
  form: FormInfo;
}> {
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch(`/api/admin/forms/${encodeURIComponent(formId)}/topics/upload`, {
    method: "POST",
    auth: true,
    body: formData,
  });
}

export async function deleteAdminFormTopic(
  formId: string,
  topicId: string
): Promise<{ ok: boolean; form: FormInfo }> {
  return apiFetch(
    `/api/admin/forms/${encodeURIComponent(formId)}/topics/${encodeURIComponent(
      topicId
    )}`,
    {
      method: "DELETE",
      auth: true,
    }
  );
}

export async function uploadStudentsCsv(file: File): Promise<{
  ok: boolean;
  uploaded: number;
  stats: ClassStats;
}> {
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch("/api/admin/students/upload", {
    method: "POST",
    auth: true,
    body: formData,
  });
}

async function downloadAdminFile(urlPath: string, fallbackFilename: string): Promise<void> {
  const headers = new Headers();
  const token = getAdminToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${urlPath}`, {
      method: "GET",
      headers,
    });
  } catch {
    throw new ApiClientError(
      0,
      "NETWORK_ERROR",
      "Network or CORS error: unable to reach the server. The server may be starting up, please retry in a few seconds"
    );
  }

  if (res.status === 401) {
    handleUnauthorized();
    throw new ApiClientError(401, "UNAUTHORIZED", "Session expired. Please sign in again.");
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new ApiClientError(
      res.status,
      errData?.code || "DOWNLOAD_FAILED",
      errData?.message || `Failed to download file (${res.status})`
    );
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fallbackFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function downloadFormExcel(formId: string, slug: string): Promise<void> {
  return downloadAdminFile(
    `/api/admin/forms/${encodeURIComponent(formId)}/export/xlsx`,
    `${slug}-responses.xlsx`
  );
}

export async function downloadFormPdf(formId: string, slug: string): Promise<void> {
  return downloadAdminFile(
    `/api/admin/forms/${encodeURIComponent(formId)}/export/pdf`,
    `${slug}-responses.pdf`
  );
}
