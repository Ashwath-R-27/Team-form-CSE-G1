"use client";

import { useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { toJpeg } from "html-to-image";
import {
  CheckCircle2,
  Download,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import AnimatedCounter from "./AnimatedCounter";
import {
  FormInfo,
  FormStats,
  PendingStudentsResponse,
  StudentMember,
} from "@/lib/api";

export type GenderFilter = "ALL" | "M" | "F";

interface PendingStudentsSectionProps {
  form: FormInfo | null;
  stats: FormStats;
  pendingData: PendingStudentsResponse | null;
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => Promise<void> | void;
  onError?: (message: string) => void;
}

interface NumberedStudent extends StudentMember {
  sNo: number;
}

const MAX_SINGLE_IMAGE_ROWS = 120;
const ROWS_PER_PART_WHEN_SPLIT = 50;

function formatCalcuttaDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Calcutta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);
}

function formatCalcuttaDateSlug(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Calcutta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value || String(date.getFullYear());
  const month = parts.find((p) => p.type === "month")?.value || "01";
  const day = parts.find((p) => p.type === "day")?.value || "01";
  return `${year}-${month}-${day}`;
}

function splitIntoColumns(rows: NumberedStudent[]): NumberedStudent[][] {
  const total = rows.length;
  if (total === 0) return [[]];

  // 1 column for <= 20 rows, 2 columns for 21..60 rows, 3 columns for > 60 rows
  const colCount = total <= 20 ? 1 : total <= 60 ? 2 : 3;
  const rowsPerCol = Math.ceil(total / colCount);
  const columns: NumberedStudent[][] = [];

  for (let c = 0; c < colCount; c++) {
    const slice = rows.slice(c * rowsPerCol, (c + 1) * rowsPerCol);
    if (slice.length > 0) {
      columns.push(slice);
    }
  }
  return columns;
}

export default function PendingStudentsSection({
  form,
  stats,
  pendingData,
  loading,
  refreshing,
  onRefresh,
  onError,
}: PendingStudentsSectionProps) {
  const prefersReducedMotion = useReducedMotion();

  const [searchQuery, setSearchQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("ALL");
  const [downloadingJpeg, setDownloadingJpeg] = useState(false);
  const [captureTimestamp, setCaptureTimestamp] = useState<string>(() =>
    formatCalcuttaDateTime(new Date())
  );

  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const allPendingStudents = useMemo(
    () => pendingData?.students ?? [],
    [pendingData]
  );

  const pendingTotal = pendingData?.total ?? 0;
  const pendingBoys = pendingData?.boys ?? 0;
  const pendingGirls = pendingData?.girls ?? 0;

  // Total students in the class list (Y) and registered students (X)
  const classTotal = useMemo(() => {
    return Math.max(stats.classTotal || 0, pendingTotal + stats.total);
  }, [stats.classTotal, stats.total, pendingTotal]);

  const registeredCount = useMemo(() => {
    if (pendingData) {
      return Math.max(0, classTotal - pendingData.total);
    }
    return stats.total;
  }, [pendingData, classTotal, stats.total]);

  const registeredPct =
    classTotal > 0 ? Math.min(100, Math.round((registeredCount / classTotal) * 100)) : 0;

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allPendingStudents.filter((s) => {
      if (genderFilter !== "ALL" && s.gender !== genderFilter) {
        return false;
      }
      if (!q) return true;
      return (
        s.roll_no.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q)
      );
    });
  }, [allPendingStudents, genderFilter, searchQuery]);

  const filteredBoys = useMemo(
    () => filteredStudents.filter((s) => s.gender === "M").length,
    [filteredStudents]
  );
  const filteredGirls = useMemo(
    () => filteredStudents.filter((s) => s.gender === "F").length,
    [filteredStudents]
  );

  // Build numbered rows and split into JPEG report parts if > 120 rows
  const reportParts = useMemo(() => {
    const numbered: NumberedStudent[] = filteredStudents.map((s, idx) => ({
      ...s,
      sNo: idx + 1,
    }));

    if (numbered.length <= MAX_SINGLE_IMAGE_ROWS) {
      return [numbered];
    }

    const parts: NumberedStudent[][] = [];
    for (let i = 0; i < numbered.length; i += ROWS_PER_PART_WHEN_SPLIT) {
      parts.push(numbered.slice(i, i + ROWS_PER_PART_WHEN_SPLIT));
    }
    return parts;
  }, [filteredStudents]);

  const filterLabel = useMemo(() => {
    const parts: string[] = [];
    if (genderFilter === "M") parts.push("Boys only");
    else if (genderFilter === "F") parts.push("Girls only");
    else parts.push("All genders");

    if (searchQuery.trim()) {
      parts.push(`Search: "${searchQuery.trim()}"`);
    }
    return parts.join(" • ");
  }, [genderFilter, searchQuery]);

  const isFiltered = genderFilter !== "ALL" || searchQuery.trim().length > 0;

  async function handleDownloadJpeg() {
    if (!form || filteredStudents.length === 0 || downloadingJpeg) return;

    setDownloadingJpeg(true);
    const now = new Date();
    setCaptureTimestamp(formatCalcuttaDateTime(now));
    const dateSlug = formatCalcuttaDateSlug(now);

    try {
      // Wait for React state flush and web fonts to finish loading
      if (typeof document !== "undefined" && document.fonts?.ready) {
        await document.fonts.ready;
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );

      const totalParts = reportParts.length;

      for (let i = 0; i < totalParts; i++) {
        const el = pageRefs.current[i];
        if (!el) continue;

        const width = 1200;
        const height = Math.max(
          200,
          Math.ceil(el.getBoundingClientRect().height || el.offsetHeight || el.scrollHeight)
        );

        const baseOptions = {
          pixelRatio: 2,
          quality: 0.95,
          backgroundColor: "#ffffff",
          width,
          height,
          cacheBust: true,
          style: {
            transform: "none",
            margin: "0",
          },
        };

        let dataUrl: string;
        try {
          dataUrl = await toJpeg(el, baseOptions);
        } catch {
          dataUrl = await toJpeg(el, { ...baseOptions, skipFonts: true });
        }

        const filename =
          totalParts > 1
            ? `${form.slug}-pending-${dateSlug}-part-${i + 1}.jpg`
            : `${form.slug}-pending-${dateSlug}.jpg`;

        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();

        if (totalParts > 1 && i < totalParts - 1) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    } catch (err: any) {
      onError?.(err?.message || "Failed to generate JPEG image.");
    } finally {
      setDownloadingJpeg(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Summary Section: Pending Total, Boys, Girls, and X of Y students registered */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Pending Total */}
          <div className="rounded-2xl border border-[#B15CFF]/30 bg-gradient-to-br from-[#5227FF]/20 to-[#FF9FFC]/10 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-white/65">
                Pending Total
              </span>
              <Users className="h-4 w-4 text-[#FF9FFC] opacity-80" />
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              {loading ? (
                <div className="h-7 w-12 animate-pulse rounded-lg bg-white/10" />
              ) : (
                <AnimatedCounter
                  value={pendingTotal}
                  className="text-2xl font-extrabold tracking-tight text-white"
                />
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-white/45">
              Not yet in any team
            </p>
          </div>

          {/* Pending Boys */}
          <div className="rounded-2xl border border-sky-400/25 bg-gradient-to-br from-sky-400/15 to-blue-500/10 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-white/65">
                Pending Boys
              </span>
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-sky-400/30 bg-sky-500/20 text-[10px] font-bold text-sky-300">
                M
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              {loading ? (
                <div className="h-7 w-12 animate-pulse rounded-lg bg-white/10" />
              ) : (
                <AnimatedCounter
                  value={pendingBoys}
                  className="text-2xl font-extrabold tracking-tight text-white"
                />
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-white/45">
              {stats.classBoys > 0 ? `of ${stats.classBoys} boys in class` : "Male students pending"}
            </p>
          </div>

          {/* Pending Girls */}
          <div className="rounded-2xl border border-pink-400/25 bg-gradient-to-br from-pink-400/15 to-fuchsia-500/10 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-white/65">
                Pending Girls
              </span>
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-pink-400/30 bg-pink-500/20 text-[10px] font-bold text-pink-300">
                F
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              {loading ? (
                <div className="h-7 w-12 animate-pulse rounded-lg bg-white/10" />
              ) : (
                <AnimatedCounter
                  value={pendingGirls}
                  className="text-2xl font-extrabold tracking-tight text-white"
                />
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-white/45">
              {stats.classGirls > 0 ? `of ${stats.classGirls} girls in class` : "Female students pending"}
            </p>
          </div>
        </div>

        {/* Small animated progress bar: X of Y students registered */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-white/85">
              {registeredCount} of {classTotal} students registered
            </span>
            <span className="font-mono font-bold text-white/75 tabular-nums">
              {registeredPct}%
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              initial={prefersReducedMotion ? false : { width: 0 }}
              animate={{ width: `${registeredPct}%` }}
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : { duration: 0.6, ease: "easeOut" }
              }
              className="h-full rounded-full bg-gradient-to-r from-[#5227FF] via-[#B15CFF] to-[#FF9FFC]"
            />
          </div>
        </div>
      </div>

      {/* Toolbar: Search + Gender Filter + Filtered Count + Refresh + Download JPEG */}
      <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-center">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by roll number or name…"
              aria-label="Search pending students"
              className="w-full rounded-2xl border border-white/15 bg-white/5 py-2.5 pr-4 pl-11 text-sm text-white placeholder-white/40 outline-none transition focus:border-[#FF9FFC]/60 focus:bg-white/10"
            />
          </div>

          {/* Gender Filter (All / Boys / Girls) */}
          <div
            role="group"
            aria-label="Filter pending students by gender"
            className="inline-flex items-center rounded-2xl border border-white/15 bg-white/5 p-1"
          >
            {(
              [
                { value: "ALL", label: "All" },
                { value: "M", label: "Boys" },
                { value: "F", label: "Girls" },
              ] as const
            ).map((opt) => {
              const active = genderFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGenderFilter(opt.value)}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "bg-[#5227FF] text-white shadow"
                      : "text-white/65 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Count that updates with the filter */}
          {!loading && (
            <span
              data-testid="pending-filtered-count"
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/80 tabular-nums"
            >
              {isFiltered
                ? `${filteredStudents.length} of ${pendingTotal} pending`
                : `${filteredStudents.length} pending`}
            </span>
          )}
        </div>

        {/* Actions: Refresh + Download JPEG */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={loading || refreshing}
            onClick={() => onRefresh()}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-xs font-semibold text-white/85 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-[#FF9FFC]" : ""}`}
            />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>

          <button
            type="button"
            disabled={loading || downloadingJpeg || filteredStudents.length === 0}
            onClick={handleDownloadJpeg}
            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_6px_24px_-6px_rgba(177,92,255,0.65)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloadingJpeg ? (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
                />
              </svg>
            ) : (
              <Download className="h-4 w-4" />
            )}
            {downloadingJpeg ? "Generating JPEG…" : "Download JPEG"}
          </button>
        </div>
      </div>

      {/* Pending Students Table / Skeleton / Empty State */}
      {loading ? (
        <div className="space-y-3" data-testid="pending-skeleton">
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              className="h-12 w-full animate-pulse rounded-2xl bg-white/5"
            />
          ))}
        </div>
      ) : pendingTotal === 0 ? (
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-14 text-center"
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-400/30 bg-emerald-500/15 text-emerald-300">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-white">
            Everyone has registered
          </p>
          <p className="mt-1 text-xs text-white/45">
            All {classTotal} students in the class list have joined a team for this form.
          </p>
        </motion.div>
      ) : filteredStudents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/40">
            <Users className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-white/80">
            No pending students match your filter
          </p>
          <p className="mt-1 text-xs text-white/45">
            Try clearing the search box or switching the gender filter to All.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-white/10 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                <th className="py-3 pr-4 pl-3 w-16">S.No</th>
                <th className="py-3 px-4 w-40">Roll No</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 pr-3 pl-4 text-right w-32">Gender</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-sm">
              {filteredStudents.map((student, idx) => (
                <tr
                  key={student.roll_no}
                  className="transition-colors hover:bg-white/[0.03]"
                >
                  <td className="py-3 pr-4 pl-3 font-mono text-xs text-white/45 tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs font-bold text-white">
                    {student.roll_no}
                  </td>
                  <td className="py-3 px-4 text-xs font-medium text-white/85">
                    {student.name}
                  </td>
                  <td className="py-3 pr-3 pl-4 text-right">
                    <span
                      className={`inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                        student.gender === "M"
                          ? "border-sky-400/35 bg-sky-500/15 text-sky-300"
                          : "border-pink-400/35 bg-pink-500/15 text-pink-300"
                      }`}
                    >
                      {student.gender === "M" ? "Boy • M" : "Girl • F"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dedicated Off-Screen Fixed-Width (1200px) Report Elements for JPEG Export */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: "-10000px",
          top: 0,
          width: "1200px",
          pointerEvents: "none",
          zIndex: -1,
          overflow: "visible",
        }}
      >
        {reportParts.map((partRows, partIdx) => {
          const columns = splitIntoColumns(partRows);
          const totalParts = reportParts.length;

          return (
            <div
              key={partIdx}
              ref={(el) => {
                pageRefs.current[partIdx] = el;
              }}
              data-testid={`pending-jpeg-report-part-${partIdx + 1}`}
              style={{
                width: "1200px",
                backgroundColor: "#ffffff",
                color: "#0f172a",
                padding: "36px 40px",
                boxSizing: "border-box",
                fontFamily:
                  "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
              }}
            >
              {/* Report Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  backgroundColor: "#1e1b4b",
                  color: "#ffffff",
                  borderRadius: "12px",
                  padding: "22px 28px",
                  marginBottom: "18px",
                }}
              >
                <div style={{ maxWidth: "760px" }}>
                  <div
                    style={{
                      fontSize: "22px",
                      fontWeight: 800,
                      letterSpacing: "-0.01em",
                      lineHeight: 1.25,
                      color: "#ffffff",
                      wordBreak: "break-word",
                    }}
                  >
                    {form?.title || "Registration Form"}
                  </div>
                  <div
                    style={{
                      fontSize: "15px",
                      fontWeight: 700,
                      color: "#c4b5fd",
                      marginTop: "6px",
                    }}
                  >
                    Students not yet registered
                    {totalParts > 1
                      ? ` (Part ${partIdx + 1} of ${totalParts})`
                      : ""}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#e2e8f0",
                      marginTop: "6px",
                    }}
                  >
                    Form: /f/{form?.slug || ""} • Filter: {filterLabel}
                  </div>
                </div>

                <div style={{ textAlign: "right", minWidth: "300px" }}>
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "#cbd5e1",
                    }}
                  >
                    Generated Date &amp; Time (Asia/Calcutta)
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: 700,
                      color: "#ffffff",
                      marginTop: "4px",
                    }}
                  >
                    {captureTimestamp}
                  </div>
                </div>
              </div>

              {/* Summary Line (pending, boys, girls, registered of total) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "12px",
                  backgroundColor: "#f8fafc",
                  border: "1px solid #cbd5e1",
                  borderRadius: "10px",
                  padding: "14px 20px",
                  marginBottom: "20px",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "#64748b",
                    }}
                  >
                    Pending
                  </div>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: 800,
                      color: "#4338ca",
                      marginTop: "2px",
                    }}
                  >
                    {filteredStudents.length}
                    {isFiltered && filteredStudents.length !== pendingTotal
                      ? ` (of ${pendingTotal})`
                      : ""}
                  </div>
                </div>

                <div
                  style={{
                    borderLeft: "1px solid #e2e8f0",
                    paddingLeft: "16px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "#64748b",
                    }}
                  >
                    Boys (M)
                  </div>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: 800,
                      color: "#0284c7",
                      marginTop: "2px",
                    }}
                  >
                    {filteredBoys}
                    {isFiltered && filteredBoys !== pendingBoys
                      ? ` (of ${pendingBoys})`
                      : ""}
                  </div>
                </div>

                <div
                  style={{
                    borderLeft: "1px solid #e2e8f0",
                    paddingLeft: "16px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "#64748b",
                    }}
                  >
                    Girls (F)
                  </div>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: 800,
                      color: "#db2777",
                      marginTop: "2px",
                    }}
                  >
                    {filteredGirls}
                    {isFiltered && filteredGirls !== pendingGirls
                      ? ` (of ${pendingGirls})`
                      : ""}
                  </div>
                </div>

                <div
                  style={{
                    borderLeft: "1px solid #e2e8f0",
                    paddingLeft: "16px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "#64748b",
                    }}
                  >
                    Registered of Total
                  </div>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: 800,
                      color: "#059669",
                      marginTop: "2px",
                    }}
                  >
                    {registeredCount} of {classTotal}
                  </div>
                </div>
              </div>

              {/* Multi-column Table Layout */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
                  gap: "16px",
                  alignItems: "start",
                }}
              >
                {columns.map((colRows, colIdx) => (
                  <table
                    key={colIdx}
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      border: "1px solid #cbd5e1",
                      fontSize: "12.5px",
                      backgroundColor: "#ffffff",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          backgroundColor: "#312e81",
                          color: "#ffffff",
                          textAlign: "left",
                          fontSize: "11.5px",
                          fontWeight: 700,
                        }}
                      >
                        <th
                          style={{
                            padding: "9px 8px",
                            width: "44px",
                            textAlign: "center",
                            borderRight: "1px solid #4338ca",
                          }}
                        >
                          S.No
                        </th>
                        <th
                          style={{
                            padding: "9px 10px",
                            width: "92px",
                            borderRight: "1px solid #4338ca",
                          }}
                        >
                          Roll No
                        </th>
                        <th
                          style={{
                            padding: "9px 10px",
                            borderRight: "1px solid #4338ca",
                          }}
                        >
                          Name
                        </th>
                        <th
                          style={{
                            padding: "9px 8px",
                            width: "60px",
                            textAlign: "center",
                          }}
                        >
                          Gender
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {colRows.map((row, rIdx) => {
                        const isZebra = rIdx % 2 === 1;
                        return (
                          <tr
                            key={row.roll_no}
                            style={{
                              backgroundColor: isZebra ? "#f1f5f9" : "#ffffff",
                              borderTop: "1px solid #cbd5e1",
                            }}
                          >
                            <td
                              style={{
                                padding: "8px 6px",
                                textAlign: "center",
                                fontWeight: 600,
                                color: "#475569",
                                borderRight: "1px solid #e2e8f0",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {row.sNo}
                            </td>
                            <td
                              style={{
                                padding: "8px 10px",
                                fontFamily:
                                  "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                                fontWeight: 700,
                                color: "#0f172a",
                                whiteSpace: "nowrap",
                                borderRight: "1px solid #e2e8f0",
                              }}
                            >
                              {row.roll_no}
                            </td>
                            <td
                              style={{
                                padding: "8px 10px",
                                fontWeight: 500,
                                color: "#1e293b",
                                wordBreak: "break-word",
                                overflowWrap: "anywhere",
                                lineHeight: 1.35,
                                borderRight: "1px solid #e2e8f0",
                              }}
                            >
                              {row.name}
                            </td>
                            <td
                              style={{
                                padding: "8px 6px",
                                textAlign: "center",
                                fontWeight: 700,
                                color: row.gender === "M" ? "#0369a1" : "#be185d",
                              }}
                            >
                              {row.gender}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
