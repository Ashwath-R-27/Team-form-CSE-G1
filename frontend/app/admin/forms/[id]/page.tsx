"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  Copy,
  Check,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Minus,
  Plus,
  Search,
  Settings,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import LiveStatsCards from "@/app/components/LiveStatsCards";
import PendingStudentsSection from "@/app/components/PendingStudentsSection";
import {
  ApiClientError,
  deleteAdminFormTopic,
  deleteAdminTeam,
  downloadFormExcel,
  downloadFormPdf,
  fetchAdminFormPending,
  fetchAdminFormResponses,
  formatTeamSizeLabel,
  FormInfo,
  FormStats,
  PendingStudentsResponse,
  TeamResponseItem,
  TopicOption,
  updateAdminForm,
  uploadFormTopicsCsv,
} from "@/lib/api";

const EMPTY_STATS: FormStats = {
  boys: 0,
  girls: 0,
  total: 0,
  teams: 0,
  classTotal: 87,
  classBoys: 43,
  classGirls: 44,
};

export default function AdminFormResponsesPage() {
  const params = useParams<{ id: string }>();
  const formId = typeof params?.id === "string" ? params.id : "";
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  const [form, setForm] = useState<FormInfo | null>(null);
  const [stats, setStats] = useState<FormStats>(EMPTY_STATS);
  const [responses, setResponses] = useState<TeamResponseItem[]>([]);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [copied, setCopied] = useState(false);

  // Settings Panel State
  const [minSize, setMinSize] = useState(4);
  const [maxSize, setMaxSize] = useState(5);
  const [savingSettings, setSavingSettings] = useState(false);

  // Export & Action states
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [topicsUploading, setTopicsUploading] = useState(false);
  const [deletingTopicId, setDeletingTopicId] = useState<string | null>(null);
  const [actionAlert, setActionAlert] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Delete Team Confirm Modal
  const [deletingTeam, setDeletingTeam] = useState<TeamResponseItem | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  // Tabs & Pending Students State
  const [activeTab, setActiveTab] = useState<"responses" | "pending">("responses");
  const [pendingData, setPendingData] = useState<PendingStudentsResponse | null>(null);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingRefreshing, setPendingRefreshing] = useState(false);

  const topicsFileInputRef = useRef<HTMLInputElement | null>(null);

  const loadPending = useCallback(
    async (showRefreshing = false) => {
      if (!formId) return;
      if (showRefreshing) setPendingRefreshing(true);
      try {
        const data = await fetchAdminFormPending(formId);
        setPendingData(data);
        setPendingLoading(false);
      } catch (err: any) {
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          router.replace("/admin/login");
          return;
        }
        setPendingLoading(false);
      } finally {
        if (showRefreshing) setPendingRefreshing(false);
      }
    },
    [formId, router]
  );

  const loadData = useCallback(
    async (syncFormControls = false) => {
      if (!formId) return;
      try {
        const data = await fetchAdminFormResponses(formId);
        setForm(data.form);
        setStats(data.stats);
        setResponses(data.responses);
        setTopics(data.topics || []);
        if (syncFormControls) {
          setMinSize(data.form.min_team_size);
          setMaxSize(data.form.max_team_size);
        }
        setLoading(false);
      } catch (err: any) {
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          router.replace("/admin/login");
          return;
        }
        if (syncFormControls) {
          setActionAlert({
            type: "error",
            text: err?.message || "Failed to load form details.",
          });
        }
        setLoading(false);
      }
    },
    [formId, router]
  );

  useEffect(() => {
    loadData(true);
    loadPending(false);
  }, [loadData, loadPending]);

  // Poll every 5 seconds for live updates
  useEffect(() => {
    if (loading || !formId) return;
    const interval = setInterval(() => loadData(false), 5000);
    return () => clearInterval(interval);
  }, [loading, formId, loadData]);

  // Keep pending list synced whenever registered count changes
  useEffect(() => {
    if (!loading && formId) {
      loadPending(false);
    }
  }, [stats.total, loading, formId, loadPending]);

  // Automatic refresh every 15 seconds while the "Not yet registered" tab is visible
  useEffect(() => {
    if (activeTab !== "pending" || !formId) return;
    loadPending(false);

    const interval = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        loadPending(false);
        loadData(false);
      }
    }, 15000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadPending(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeTab, formId, loadPending, loadData]);

  const handleRefreshPending = useCallback(async () => {
    await Promise.all([loadPending(true), loadData(false)]);
  }, [loadPending, loadData]);

  const filteredResponses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return responses;

    return responses.filter((team) => {
      if (
        `team ${team.team_no}`.includes(q) ||
        `#${team.team_no}`.includes(q) ||
        String(team.team_no) === q
      ) {
        return true;
      }
      if (team.topic && team.topic.toLowerCase().includes(q)) {
        return true;
      }
      return team.members.some(
        (m) =>
          m.roll_no.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          m.gender.toLowerCase() === q
      );
    });
  }, [responses, searchQuery]);

  const filteredTopics = useMemo(() => {
    const q = topicFilter.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((t) => t.name.toLowerCase().includes(q));
  }, [topics, topicFilter]);

  async function applyFormPatch(
    patch: Partial<{
      min_team_size: number;
      max_team_size: number;
      collect_topic: boolean;
      allow_topic_repeat: boolean;
      show_chosen_topics: boolean;
      is_open: boolean;
    }>,
    successMessage?: string
  ) {
    if (!form) return;
    setSavingSettings(true);
    setActionAlert(null);
    try {
      const { form: updated } = await updateAdminForm(form.id, patch);
      setForm(updated);
      setMinSize(updated.min_team_size);
      setMaxSize(updated.max_team_size);
      if (successMessage) {
        setActionAlert({ type: "success", text: successMessage });
      }
      await loadData(false);
    } catch (err: any) {
      setMinSize(form.min_team_size);
      setMaxSize(form.max_team_size);
      setActionAlert({
        type: "error",
        text: err?.message || "Failed to update form settings.",
      });
    } finally {
      setSavingSettings(false);
    }
  }

  function handleStepMin(delta: number) {
    const nextMin = Math.max(1, Math.min(20, minSize + delta));
    const nextMax = nextMin > maxSize ? nextMin : maxSize;
    setMinSize(nextMin);
    setMaxSize(nextMax);
  }

  function handleStepMax(delta: number) {
    const nextMax = Math.max(1, Math.min(20, maxSize + delta));
    const nextMin = nextMax < minSize ? nextMax : minSize;
    setMaxSize(nextMax);
    setMinSize(nextMin);
  }

  async function handleSaveTeamSizeRange() {
    if (!form) return;
    await applyFormPatch(
      { min_team_size: minSize, max_team_size: maxSize },
      `Team size range updated to ${formatTeamSizeLabel(minSize, maxSize)}.`
    );
  }

  function handleCopyLink() {
    if (!form) return;
    const url = `${window.location.origin}/f/${form.slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDownloadExcel() {
    if (!form) return;
    setDownloadingExcel(true);
    setActionAlert(null);
    try {
      await downloadFormExcel(form.id, form.slug);
    } catch (err: any) {
      setActionAlert({ type: "error", text: err?.message || "Failed to download Excel file." });
    } finally {
      setDownloadingExcel(false);
    }
  }

  async function handleDownloadPdf() {
    if (!form) return;
    setDownloadingPdf(true);
    setActionAlert(null);
    try {
      await downloadFormPdf(form.id, form.slug);
    } catch (err: any) {
      setActionAlert({ type: "error", text: err?.message || "Failed to download PDF report." });
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleConfirmDeleteTeam() {
    if (!deletingTeam) return;
    setDeletingBusy(true);
    try {
      await deleteAdminTeam(deletingTeam.id);
      setResponses((prev) => prev.filter((t) => t.id !== deletingTeam.id));
      setDeletingTeam(null);
      setActionAlert({
        type: "success",
        text: `Deleted Team #${deletingTeam.team_no} and freed its roll numbers${
          deletingTeam.topic ? " and topic" : ""
        }.`,
      });
      await Promise.all([loadData(false), loadPending(false)]);
    } catch (err: any) {
      setActionAlert({ type: "error", text: err?.message || "Failed to delete team." });
    } finally {
      setDeletingBusy(false);
    }
  }

  async function handleTopicsCsvUpload(file: File | null) {
    if (!file || !form) return;
    setTopicsUploading(true);
    setActionAlert(null);
    try {
      const res = await uploadFormTopicsCsv(form.id, file);
      setTopics(res.topics);
      if (res.form) setForm(res.form);
      setActionAlert({
        type: "success",
        text: `Uploaded ${res.uploaded} unique topic(s) for this form.`,
      });
      await loadData(false);
    } catch (err: any) {
      setActionAlert({
        type: "error",
        text: err?.message || "Failed to upload topics CSV.",
      });
    } finally {
      setTopicsUploading(false);
      if (topicsFileInputRef.current) topicsFileInputRef.current.value = "";
    }
  }

  async function handleDeleteTopic(topic: TopicOption) {
    if (!form) return;
    setDeletingTopicId(topic.id);
    setActionAlert(null);
    try {
      const res = await deleteAdminFormTopic(form.id, topic.id);
      setTopics((prev) => prev.filter((t) => t.id !== topic.id));
      if (res.form) setForm(res.form);
    } catch (err: any) {
      setActionAlert({
        type: "error",
        text: err?.message || "Failed to delete topic.",
      });
    } finally {
      setDeletingTopicId(null);
    }
  }

  const sizeRangeChanged =
    form !== null &&
    (minSize !== form.min_team_size || maxSize !== form.max_team_size);

  return (
    <div className="relative min-h-screen pb-16 font-sans">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/60 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/admin"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/75 transition hover:bg-white/10 hover:text-white"
              aria-label="Back to Admin Dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              {loading ? (
                <div className="h-5 w-56 animate-pulse rounded bg-white/10" />
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-lg font-extrabold text-white">
                    {form?.title || "Form Responses"}
                  </h1>
                  {form && (
                    <span className="rounded-lg border border-[#B15CFF]/30 bg-[#5227FF]/20 px-2.5 py-0.5 font-mono text-xs font-semibold text-[#FF9FFC]">
                      /f/{form.slug}
                    </span>
                  )}
                </div>
              )}
              <p className="text-xs text-white/50">
                {form
                  ? `Team Size: ${formatTeamSizeLabel(
                      form.min_team_size,
                      form.max_team_size
                    )} Members • Topics: ${
                      form.collect_topic
                        ? form.allow_topic_repeat
                          ? "Enabled (Repeat ON)"
                          : "Enabled (Unique)"
                        : "Off"
                    }`
                  : "Loading form details…"}
              </p>
            </div>
          </div>

          {form && (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={savingSettings}
                onClick={() => applyFormPatch({ is_open: !form.is_open })}
                className={`inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2 text-xs font-semibold transition ${
                  form.is_open
                    ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
                    : "border-rose-400/35 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    form.is_open ? "bg-emerald-400" : "bg-rose-400"
                  }`}
                />
                {form.is_open ? "Form Open" : "Form Closed"}
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/10"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-300">Copied URL</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy Link
                  </>
                )}
              </button>

              <Link
                href={`/f/${form.slug}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-2xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/10"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Public Form
              </Link>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto mt-8 max-w-6xl space-y-6 px-6">
        {/* Live Stats Card */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[30px] border border-white/10 bg-slate-950/65 p-6 shadow-2xl backdrop-blur-xl"
        >
          <LiveStatsCards stats={stats} loading={loading} />
        </motion.div>

        {actionAlert && (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            role="alert"
            className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-xs font-medium ${
              actionAlert.type === "success"
                ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
                : "border-rose-400/35 bg-rose-500/10 text-rose-200"
            }`}
          >
            <span>{actionAlert.text}</span>
            <button
              type="button"
              onClick={() => setActionAlert(null)}
              className="text-white/60 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}

        {/* Settings & Topics Grid */}
        {form && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Settings Panel */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 }}
              className="flex flex-col justify-between rounded-[30px] border border-white/10 bg-slate-950/65 p-6 shadow-2xl backdrop-blur-xl"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#B15CFF]/30 bg-[#5227FF]/20 text-[#FF9FFC]">
                      <Settings className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">Form Settings</h2>
                      <p className="text-xs text-white/50">
                        Configure team size range and topic collection rules
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3.5">
                  {/* Min & Max Team Size Steppers */}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <span className="block text-xs font-semibold text-white">
                          Team Size Range (Min – Max)
                        </span>
                        <span className="text-[11px] text-white/50">
                          If min and max are equal, team size is fixed
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-white/50">Min:</span>
                          <button
                            type="button"
                            onClick={() => handleStepMin(-1)}
                            disabled={minSize <= 1 || savingSettings}
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/15 disabled:opacity-35"
                            aria-label="Decrease minimum team size"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm font-extrabold text-white tabular-nums">
                            {minSize}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleStepMin(1)}
                            disabled={minSize >= 20 || savingSettings}
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/15 disabled:opacity-35"
                            aria-label="Increase minimum team size"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-white/50">Max:</span>
                          <button
                            type="button"
                            onClick={() => handleStepMax(-1)}
                            disabled={maxSize <= 1 || savingSettings}
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/15 disabled:opacity-35"
                            aria-label="Decrease maximum team size"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm font-extrabold text-white tabular-nums">
                            {maxSize}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleStepMax(1)}
                            disabled={maxSize >= 20 || savingSettings}
                            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white hover:bg-white/15 disabled:opacity-35"
                            aria-label="Increase maximum team size"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {sizeRangeChanged && (
                      <div className="mt-3 flex items-center justify-end gap-2 border-t border-white/10 pt-3">
                        <button
                          type="button"
                          onClick={() => {
                            setMinSize(form.min_team_size);
                            setMaxSize(form.max_team_size);
                          }}
                          className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/75 hover:bg-white/10"
                        >
                          Reset
                        </button>
                        <button
                          type="button"
                          disabled={savingSettings}
                          onClick={handleSaveTeamSizeRange}
                          className="rounded-xl bg-gradient-to-r from-[#5227FF] to-[#B15CFF] px-4 py-1.5 text-xs font-semibold text-white shadow hover:opacity-95 disabled:opacity-50"
                        >
                          {savingSettings ? "Saving…" : "Apply Size Range"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Collect Topic Toggle */}
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
                    <div>
                      <span className="block text-xs font-semibold text-white">
                        Collect Topic
                      </span>
                      <span className="text-[11px] text-white/50">
                        {form.collect_topic
                          ? topics.length > 0
                            ? `ON — Students pick from ${topics.length} uploaded topic option(s)`
                            : "ON — Students enter topic as free text (no CSV uploaded)"
                          : "OFF — No topic field shown on form or in exports"}
                      </span>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-label="Collect topic"
                      aria-checked={form.collect_topic}
                      disabled={savingSettings}
                      onClick={() => {
                        const nextCollect = !form.collect_topic;
                        applyFormPatch(
                          nextCollect
                            ? { collect_topic: true }
                            : { collect_topic: false, show_chosen_topics: false },
                          `Topic collection turned ${nextCollect ? "ON" : "OFF"}.`
                        );
                      }}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                        form.collect_topic ? "bg-[#5227FF]" : "bg-white/20"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                          form.collect_topic ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Allow Topic Repetition Toggle */}
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
                    <div>
                      <span className="block text-xs font-semibold text-white">
                        Allow Topic Repetition
                      </span>
                      <span className="text-[11px] text-white/50">
                        {form.allow_topic_repeat
                          ? "ON — Different teams may choose the same topic"
                          : "OFF — Each topic can be used by only one team"}
                      </span>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-label="Allow topic repetition"
                      aria-checked={form.allow_topic_repeat}
                      disabled={savingSettings}
                      onClick={() =>
                        applyFormPatch(
                          { allow_topic_repeat: !form.allow_topic_repeat },
                          `Topic repetition turned ${!form.allow_topic_repeat ? "ON" : "OFF"}.`
                        )
                      }
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                        form.allow_topic_repeat ? "bg-emerald-500" : "bg-white/20"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                          form.allow_topic_repeat ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Show Chosen Topics Toggle */}
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
                    <div>
                      <span className="block text-xs font-semibold text-white">
                        Show chosen topics to users
                      </span>
                      <span className="text-[11px] text-white/50">
                        {form.collect_topic && form.show_chosen_topics
                          ? "Students can see which topics teams have already chosen"
                          : "Chosen topics are hidden from students"}
                      </span>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-label="Show chosen topics to users"
                      aria-checked={Boolean(form.collect_topic && form.show_chosen_topics)}
                      disabled={!form.collect_topic || savingSettings}
                      onClick={() => {
                        if (!form.collect_topic) return;
                        const nextShow = !form.show_chosen_topics;
                        applyFormPatch(
                          { show_chosen_topics: nextShow },
                          `Show chosen topics turned ${nextShow ? "ON" : "OFF"}.`
                        );
                      }}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        form.collect_topic && form.show_chosen_topics
                          ? "bg-emerald-500"
                          : "bg-white/20"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                          form.collect_topic && form.show_chosen_topics
                            ? "translate-x-6"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Topics CSV Upload & List Panel */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 }}
              className="flex flex-col justify-between rounded-[30px] border border-white/10 bg-slate-950/65 p-6 shadow-2xl backdrop-blur-xl"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/15 text-sky-300">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">
                        Form Topics ({topics.length})
                      </h2>
                      <p className="text-xs text-white/50">
                        Upload a CSV with single column <code className="text-[#FF9FFC]">topic</code>
                      </p>
                    </div>
                  </div>

                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/90 transition hover:bg-white/10">
                    <Upload className="h-3.5 w-3.5 text-[#FF9FFC]" />
                    {topicsUploading
                      ? "Uploading…"
                      : topics.length > 0
                      ? "Replace Topics CSV"
                      : "Upload Topics CSV"}
                    <input
                      ref={topicsFileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      disabled={topicsUploading}
                      onChange={(e) => handleTopicsCsvUpload(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </div>

                {topics.length === 0 ? (
                  <div className="mt-5 flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-8 text-center">
                    <p className="text-xs font-semibold text-white/75">
                      No preset topic options uploaded for this form
                    </p>
                    <p className="mt-1 max-w-sm text-[11px] text-white/45">
                      {form.collect_topic
                        ? "Since 'Collect Topic' is ON and no topics CSV is uploaded, students will type their topic as free text."
                        : "Upload a topics.csv file (header: topic) if you want students to pick from a searchable dropdown."}
                    </p>
                  </div>
                ) : (
                  <div className="mt-4">
                    <input
                      type="search"
                      value={topicFilter}
                      onChange={(e) => setTopicFilter(e.target.value)}
                      placeholder="Filter uploaded topics…"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/35 outline-none focus:border-[#FF9FFC]/50"
                    />

                    <ul className="mt-2.5 max-h-44 space-y-1.5 overflow-y-auto pr-1">
                      {filteredTopics.map((t) => (
                        <li
                          key={t.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate font-medium text-white/90">{t.name}</span>
                            {t.taken && (
                              <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                                Team #{t.teamNo}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            disabled={deletingTopicId === t.id}
                            onClick={() => handleDeleteTopic(t)}
                            className="shrink-0 rounded-lg p-1 text-white/40 transition hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-40"
                            aria-label={`Delete topic ${t.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {/* Responses & Not Yet Registered Section */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-[30px] border border-white/10 bg-slate-950/65 p-6 shadow-2xl backdrop-blur-xl"
        >
          {/* Section Tabs: Responses vs Not yet registered */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div
              role="tablist"
              aria-label="Form registration views"
              className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "responses"}
                onClick={() => setActiveTab("responses")}
                className={`relative inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                  activeTab === "responses"
                    ? "bg-gradient-to-r from-[#5227FF] to-[#B15CFF] text-white shadow"
                    : "text-white/65 hover:text-white"
                }`}
              >
                <span>Responses</span>
                <span
                  className={`rounded-lg px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums ${
                    activeTab === "responses"
                      ? "bg-white/20 text-white"
                      : "bg-white/10 text-white/70"
                  }`}
                >
                  {responses.length}
                </span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "pending"}
                onClick={() => setActiveTab("pending")}
                className={`relative inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                  activeTab === "pending"
                    ? "bg-gradient-to-r from-[#5227FF] to-[#B15CFF] text-white shadow"
                    : "text-white/65 hover:text-white"
                }`}
              >
                <span>Not yet registered</span>
                <span
                  className={`rounded-lg px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums ${
                    activeTab === "pending"
                      ? "bg-white/20 text-white"
                      : "bg-white/10 text-white/70"
                  }`}
                >
                  {pendingData
                    ? pendingData.total
                    : Math.max(0, (stats.classTotal || 0) - stats.total)}
                </span>
              </button>
            </div>

            {activeTab === "pending" && (
              <span className="text-[11px] text-white/40">
                Auto-refreshes every 15s while visible
              </span>
            )}
          </div>

          {activeTab === "pending" ? (
            <PendingStudentsSection
              form={form}
              stats={stats}
              pendingData={pendingData}
              loading={pendingLoading}
              refreshing={pendingRefreshing}
              onRefresh={handleRefreshPending}
              onError={(msg) => setActionAlert({ type: "error", text: msg })}
            />
          ) : (
            <>
              {/* Toolbar: Search + Export Buttons */}
              <div className="flex flex-col justify-between gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-center">
                <div className="relative flex-1 max-w-md">
                  <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by team #, roll number, name, or topic…"
                    aria-label="Search responses"
                    className="w-full rounded-2xl border border-white/15 bg-white/5 py-2.5 pr-4 pl-11 text-sm text-white placeholder-white/40 outline-none transition focus:border-[#FF9FFC]/60 focus:bg-white/10"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={downloadingExcel || loading}
                    onClick={handleDownloadExcel}
                    className="inline-flex items-center gap-2 rounded-2xl border border-emerald-400/35 bg-emerald-500/15 px-4 py-2.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {downloadingExcel ? (
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                      </svg>
                    ) : (
                      <FileSpreadsheet className="h-4 w-4 text-emerald-300" />
                    )}
                    {downloadingExcel ? "Generating Excel…" : "Download Excel (.xlsx)"}
                  </button>

                  <button
                    type="button"
                    disabled={downloadingPdf || loading}
                    onClick={handleDownloadPdf}
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_6px_24px_-6px_rgba(177,92,255,0.65)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {downloadingPdf ? (
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                      </svg>
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    {downloadingPdf ? "Generating PDF…" : "Download PDF"}
                  </button>
                </div>
              </div>

              {/* Table */}
              {loading ? (
                <div className="mt-6 space-y-3">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-16 w-full animate-pulse rounded-2xl bg-white/5" />
                  ))}
                </div>
              ) : filteredResponses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/40">
                    <Users className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-semibold text-white/80">
                    {searchQuery
                      ? "No teams match your search query"
                      : "No teams have registered for this form yet"}
                  </p>
                  <p className="mt-1 text-xs text-white/45">
                    {searchQuery
                      ? "Try searching by another roll number, student name, topic, or team number."
                      : "Share the public form link with students to start collecting team registrations."}
                  </p>
                </div>
              ) : (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-white/10 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                        <th className="py-3 pr-4 pl-3 w-24">Team No.</th>
                        <th className="py-3 px-4">Members (Sorted by Roll No)</th>
                        {form?.collect_topic && <th className="py-3 px-4 w-56">Topic</th>}
                        <th className="py-3 px-4 w-40">Submitted Time</th>
                        <th className="py-3 pr-3 pl-4 text-right w-24">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10 text-sm">
                      {filteredResponses.map((team) => (
                        <tr
                          key={team.id}
                          className="group transition-colors hover:bg-white/[0.03]"
                        >
                          <td className="py-4 pr-4 pl-3 align-top">
                            <span className="inline-flex items-center justify-center rounded-xl border border-[#B15CFF]/35 bg-[#5227FF]/20 px-3 py-1 font-mono text-sm font-extrabold text-[#FF9FFC]">
                              #{team.team_no}
                            </span>
                          </td>

                          <td className="py-4 px-4 align-top">
                            <div className="flex flex-wrap gap-2">
                              {team.members.map((m) => (
                                <div
                                  key={m.roll_no}
                                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5"
                                >
                                  <span className="font-mono text-xs font-bold text-white">
                                    {m.roll_no}
                                  </span>
                                  <span className="text-xs text-white/75">{m.name}</span>
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                      m.gender === "M"
                                        ? "border-sky-400/35 bg-sky-500/15 text-sky-300"
                                        : "border-pink-400/35 bg-pink-500/15 text-pink-300"
                                    }`}
                                  >
                                    {m.gender}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>

                          {form?.collect_topic && (
                            <td className="py-4 px-4 align-top text-xs font-medium text-white/85">
                              {team.topic || <span className="text-white/35">—</span>}
                            </td>
                          )}

                          <td className="py-4 px-4 align-top text-xs text-white/55">
                            {new Date(team.submitted_at).toLocaleString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>

                          <td className="py-4 pr-3 pl-4 align-top text-right">
                            <button
                              type="button"
                              onClick={() => setDeletingTeam(team)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20"
                              aria-label={`Delete Team #${team.team_no}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>

      {/* Delete Team Confirm Modal */}
      <AnimatePresence>
        {deletingTeam && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setDeletingTeam(null)}
          >
            <motion.div
              initial={prefersReducedMotion ? false : { scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={prefersReducedMotion ? {} : { scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-[30px] border border-white/15 bg-slate-950/95 p-6 text-center shadow-2xl backdrop-blur-xl"
            >
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-400/30 bg-rose-500/15 text-rose-300">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-white">
                Delete Team #{deletingTeam.team_no}?
              </h3>
              <p className="mt-2 text-xs text-white/60">
                Deleting this team will immediately free its roll numbers (
                <span className="font-mono font-semibold text-white">
                  {deletingTeam.members.map((m) => m.roll_no).join(", ")}
                </span>
                )
                {deletingTeam.topic ? (
                  <>
                    {" "}
                    and its topic (
                    <span className="font-semibold text-white">
                      &ldquo;{deletingTeam.topic}&rdquo;
                    </span>
                    )
                  </>
                ) : null}{" "}
                so they can be used again.
              </p>

              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setDeletingTeam(null)}
                  className="rounded-2xl border border-white/15 bg-white/5 px-5 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingBusy}
                  onClick={handleConfirmDeleteTeam}
                  className="rounded-2xl bg-rose-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg hover:bg-rose-500 disabled:opacity-50"
                >
                  {deletingBusy ? "Deleting…" : "Delete Team"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
