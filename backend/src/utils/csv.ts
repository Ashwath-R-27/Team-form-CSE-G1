import { parse } from "csv-parse/sync";
import { AppError } from "../middleware/errorHandler";

export interface StudentRow {
  roll_no: string;
  name: string;
  gender: "M" | "F";
}

/**
 * Natural sort for roll numbers: shorter roll number first, then alphabetical
 * (so "21CS9" comes before "21CS10", matching SQL `order by length(r), r`).
 */
export function compareRollNumbers(a: string, b: string): number {
  const ra = a.trim().toUpperCase();
  const rb = b.trim().toUpperCase();
  if (ra.length !== rb.length) {
    return ra.length - rb.length;
  }
  return ra < rb ? -1 : ra > rb ? 1 : 0;
}

/**
 * Normalises a topic string by trimming and collapsing internal whitespace.
 * Returns null if empty.
 */
export function normalizeTopic(raw?: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/\s+/g, " ");
  return cleaned.length > 0 ? cleaned : null;
}

export function normalizeGender(raw: string): "M" | "F" {
  const val = raw.trim().toUpperCase();
  if (val === "M" || val === "B" || val === "MALE" || val === "BOY" || val === "BOYS") {
    return "M";
  }
  if (val === "F" || val === "G" || val === "FEMALE" || val === "GIRL" || val === "GIRLS") {
    return "F";
  }
  throw new AppError(
    400,
    "INVALID_GENDER",
    `Invalid gender value "${raw}". Expected M/F (or B/G, Male/Female).`
  );
}

export function parseClassListCsv(csvContent: string | Buffer): StudentRow[] {
  const text =
    typeof csvContent === "string"
      ? csvContent.replace(/^\uFEFF/, "")
      : csvContent.toString("utf-8").replace(/^\uFEFF/, "");

  let records: string[][];
  try {
    records = parse(text, {
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (err: any) {
    throw new AppError(400, "INVALID_CSV", `Failed to parse CSV: ${err?.message || "Syntax error"}`);
  }

  if (!records || records.length < 2) {
    throw new AppError(400, "EMPTY_CSV", "CSV must contain a header row and at least one student row.");
  }

  // Validate headers (supports roll_no or rollno, name, gender case-insensitively)
  const rawHeaders = records[0].map((h) => h.trim().toLowerCase().replace(/[\s_-]+/g, ""));
  const rollIdx = rawHeaders.findIndex((h) => h === "rollno" || h === "roll" || h === "rollnumber");
  const nameIdx = rawHeaders.findIndex((h) => h === "name" || h === "studentname");
  const genderIdx = rawHeaders.findIndex((h) => h === "gender" || h === "sex");

  if (rollIdx === -1 || nameIdx === -1 || genderIdx === -1) {
    throw new AppError(
      400,
      "INVALID_CSV_HEADERS",
      `CSV must have headers: roll_no,name,gender (found: ${records[0].join(",")})`
    );
  }

  const studentMap = new Map<string, StudentRow>();

  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    if (!row || row.every((c) => !c || !c.trim())) continue;

    const roll_no = (row[rollIdx] || "").trim().toUpperCase();
    const name = (row[nameIdx] || "").trim();
    const rawGender = (row[genderIdx] || "").trim();

    if (!roll_no || !name || !rawGender) {
      throw new AppError(
        400,
        "INVALID_CSV_ROW",
        `Row ${i + 1} is missing roll_no, name, or gender.`
      );
    }

    const gender = normalizeGender(rawGender);
    studentMap.set(roll_no, { roll_no, name, gender });
  }

  const students = Array.from(studentMap.values());
  if (students.length === 0) {
    throw new AppError(400, "EMPTY_CSV", "No valid student records found in CSV.");
  }

  return students;
}

export function parseTopicsCsv(csvContent: string | Buffer): string[] {
  const text =
    typeof csvContent === "string"
      ? csvContent.replace(/^\uFEFF/, "")
      : csvContent.toString("utf-8").replace(/^\uFEFF/, "");

  let records: string[][];
  try {
    records = parse(text, {
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (err: any) {
    throw new AppError(400, "INVALID_CSV", `Failed to parse topics CSV: ${err?.message || "Syntax error"}`);
  }

  if (!records || records.length < 2) {
    throw new AppError(
      400,
      "EMPTY_TOPICS_CSV",
      "Topics CSV must contain a 'topic' header row and at least one topic row."
    );
  }

  const rawHeaders = records[0].map((h) => h.trim().toLowerCase().replace(/[\s_-]+/g, ""));
  const topicIdx = rawHeaders.findIndex(
    (h) => h === "topic" || h === "topics" || h === "topicname" || h === "title" || h === "name"
  );

  if (topicIdx === -1) {
    throw new AppError(
      400,
      "INVALID_CSV_HEADERS",
      `Topics CSV must have a 'topic' header column (found: ${records[0].join(",")})`
    );
  }

  const seenLower = new Set<string>();
  const topics: string[] = [];

  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    if (!row || row.every((c) => !c || !c.trim())) continue;

    const cleaned = normalizeTopic(row[topicIdx]);
    if (!cleaned) continue;

    const key = cleaned.toLowerCase();
    if (!seenLower.has(key)) {
      seenLower.add(key);
      topics.push(cleaned);
    }
  }

  if (topics.length === 0) {
    throw new AppError(400, "EMPTY_TOPICS_CSV", "No valid topics found in CSV.");
  }

  return topics;
}
