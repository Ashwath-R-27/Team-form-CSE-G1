"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Plus,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  Edit3,
  Upload,
  LogOut,
  Users,
  FileSpreadsheet,
  Shield,
  Minus,
  X,
  Calendar,
  ChevronRight,
  KeyRound,
  UserCog,
  BookOpen,
} from "lucide-react";
import GlassInput from "@/app/components/GlassInput";
import AnimatedCounter from "@/app/components/AnimatedCounter";
import {
  adminLogout,
  AdminUser,
  ApiClientError,
  ClassStats,
  createAdminForm,
  deleteAdminForm,
  fetchAdminForms,
  fetchAdminMe,
  formatTeamSizeLabel,
  FormInfo,
  updateAdminForm,
  uploadStudentsCsv,
} from "@/lib/api";

export default function AdminDashboardPage() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null);
  const [forms, setForms] = useState<FormInfo[]>([]);
  const [classStats, setClassStats] = useState<ClassStats>({ total: 0, boys: 0, girls: 0 });
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Create / Edit Form Modal State
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<FormInfo | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [minTeamSize, setMinTeamSize] = useState(4);
  const [maxTeamSize, setMaxTeamSize] = useState(5);
  const [collectTopic, setCollectTopic] = useState(false);
  const [allowTopicRepeat, setAllowTopicRepeat] = useState(true);
  const [isOpen, setIsOpen] = useState(true);
  const [savingForm, setSavingForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete Confirm Modal State
  const [deletingForm, setDeletingForm] = useState<FormInfo | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // CSV Upload Modal State
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvMessage, setCsvMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const [meRes, formsRes] = await Promise.all([fetchAdminMe(), fetchAdminForms()]);
      setCurrentAdmin(meRes.admin);
      setForms(formsRes.forms);
      setClassStats(formsRes.classStats);
      setLoading(false);
    } catch (err: any) {
      if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
        router.replace("/admin/login");
        return;
      }
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Poll admin stats every 6s
  useEffect(() => {
    if (loading) return;
    const timer = setInterval(loadDashboard, 6000);
    return () => clearInterval(timer);
  }, [loading, loadDashboard]);

  function openCreateModal() {
    setEditingForm(null);
    setTitle("");
    setDescription("");
    setSlug("");
    setSlugManuallyEdited(false);
    setMinTeamSize(4);
    setMaxTeamSize(5);
    setCollectTopic(false);
    setAllowTopicRepeat(false);
    setIsOpen(true);
    setFormError(null);
    setFormModalOpen(true);
  }

  function openEditModal(form: FormInfo) {
    setEditingForm(form);
    setTitle(form.title);
    setDescription(form.description || "");
    setSlug(form.slug);
    setSlugManuallyEdited(true);
    setMinTeamSize(form.min_team_size);
    setMaxTeamSize(form.max_team_size);
    setCollectTopic(form.collect_topic);
    setAllowTopicRepeat(form.allow_topic_repeat);
    setIsOpen(form.is_open);
    setFormError(null);
    setFormModalOpen(true);
  }

  function handleTitleChange(val: string) {
    setTitle(val);
    if (!slugManuallyEdited) {
      const autoSlug = val
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      setSlug(autoSlug);
    }
  }

  function handleMinSizeChange(nextMin: number) {
    const clamped = Math.max(1, Math.min(20, nextMin));
    setMinTeamSize(clamped);
    if (clamped > maxTeamSize) {
      setMaxTeamSize(clamped);
    }
  }

  function handleMaxSizeChange(nextMax: number) {
    const clamped = Math.max(1, Math.min(20, nextMax));
    setMaxTeamSize(clamped);
    if (clamped < minTeamSize) {
      setMinTeamSize(clamped);
    }
  }

  async function handleSaveForm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError("Form title is required.");
      return;
    }

    if (minTeamSize > maxTeamSize) {
      setFormError("Minimum team size cannot exceed maximum team size.");
      return;
    }

    setSavingForm(true);
    try {
      if (editingForm) {
        const { form: updated } = await updateAdminForm(editingForm.id, {
          title: title.trim(),
          description: description.trim() || null,
          slug: slug.trim() || undefined,
          min_team_size: minTeamSize,
          max_team_size: maxTeamSize,
          collect_topic: collectTopic,
          allow_topic_repeat: allowTopicRepeat,
          is_open: isOpen,
        });
        setForms((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      } else {
        const { form: created } = await createAdminForm({
          title: title.trim(),
          description: description.trim() || undefined,
          slug: slug.trim() || undefined,
          min_team_size: minTeamSize,
          max_team_size: maxTeamSize,
          collect_topic: collectTopic,
          allow_topic_repeat: allowTopicRepeat,
          is_open: isOpen,
        });
        setForms((prev) => [created, ...prev]);
      }
      setFormModalOpen(false);
    } catch (err: any) {
      setFormError(err?.message || "Failed to save form.");
    } finally {
      setSavingForm(false);
    }
  }

  async function handleToggleOpen(form: FormInfo) {
    const nextState = !form.is_open;
    setDashboardError(null);
    setForms((prev) => prev.map((f) => (f.id === form.id ? { ...f, is_open: nextState } : f)));
    try {
      const { form: updated } = await updateAdminForm(form.id, { is_open: nextState });
      setForms((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    } catch (err: any) {
      setForms((prev) => prev.map((f) => (f.id === form.id ? { ...f, is_open: form.is_open } : f)));
      setDashboardError(err?.message || "Failed to update form status.");
    }
  }

  async function handleConfirmDelete() {
    if (!deletingForm) return;
    setDeletingBusy(true);
    setDashboardError(null);
    try {
      await deleteAdminForm(deletingForm.id);
      setForms((prev) => prev.filter((f) => f.id !== deletingForm.id));
      setDeletingForm(null);
    } catch (err: any) {
      setDashboardError(err?.message || "Failed to delete form.");
      setDeletingForm(null);
    } finally {
      setDeletingBusy(false);
    }
  }

  function handleCopyLink(form: FormInfo) {
    const url = `${window.location.origin}/f/${form.slug}`;
    navigator.clipboard.writeText(url);
    setCopiedId(form.id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === form.id ? null : prev));
    }, 2000);
  }

  async function handleCsvFileChange(file: File | null) {
    if (!file) return;
    setCsvUploading(true);
    setCsvMessage(null);
    try {
      const res = await uploadStudentsCsv(file);
      setClassStats(res.stats);
      setCsvMessage({
        type: "success",
        text: `Successfully uploaded ${res.uploaded} students (${res.stats.boys} Boys, ${res.stats.girls} Girls).`,
      });
      await loadDashboard();
    } catch (err: any) {
      setCsvMessage({
        type: "error",
        text: err?.message || "Failed to upload CSV file.",
      });
    } finally {
      setCsvUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleLogout() {
    await adminLogout();
    router.push("/admin/login");
  }

  return (
    <div className="relative min-h-screen pb-16 font-sans">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/60 px-6 py-4 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] text-white shadow-lg">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold tracking-tight text-white">
                  Admin Dashboard
                </h1>
                {currentAdmin && (
                  <span className="rounded-full border border-[#B15CFF]/35 bg-[#5227FF]/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#FF9FFC]">
                    {currentAdmin.role === "super_admin" ? "Super Admin" : "Admin"}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/50">
                {currentAdmin ? currentAdmin.email : "Manage registration forms, class list & exports"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCsvMessage(null);
                setCsvModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-xs font-semibold text-white/85 transition hover:bg-white/10"
            >
              <Upload className="h-3.5 w-3.5 text-[#FF9FFC]" />
              Class List ({classStats.total})
            </button>

            {currentAdmin?.role === "super_admin" && (
              <Link
                href="/admin/admins"
                className="inline-flex items-center gap-1.5 rounded-2xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-xs font-semibold text-white/85 transition hover:bg-white/10"
              >
                <UserCog className="h-3.5 w-3.5 text-[#FF9FFC]" />
                Admins
              </Link>
            )}

            <Link
              href="/admin/account"
              className="inline-flex items-center gap-1.5 rounded-2xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-xs font-semibold text-white/85 transition hover:bg-white/10"
            >
              <KeyRound className="h-3.5 w-3.5 text-[#FF9FFC]" />
              Account
            </Link>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_6px_24px_-6px_rgba(177,92,255,0.7)] transition hover:opacity-95"
            >
              <Plus className="h-4 w-4" />
              New Form
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs font-medium text-white/65 transition hover:border-rose-400/30 hover:bg-rose-500/10 hover:text-rose-200"
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="mx-auto mt-8 max-w-6xl px-6">
        {dashboardError && (
          <div
            role="alert"
            className="mb-6 flex items-center justify-between rounded-2xl border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-xs font-medium text-rose-200"
          >
            <span>{dashboardError}</span>
            <button
              type="button"
              onClick={() => setDashboardError(null)}
              className="text-white/60 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Class Roster Summary Banner */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-[26px] border border-white/10 bg-slate-950/60 p-5 shadow-xl backdrop-blur-xl"
        >
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#B15CFF]/30 bg-[#5227FF]/20 text-[#FF9FFC]">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Active Class Roster (classlist.csv)</h2>
              <p className="text-xs text-white/55">
                Used across all forms to verify roll numbers and auto-fill student names & gender
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-center">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-white/45">
                Total Roster
              </span>
              <AnimatedCounter value={classStats.total} className="text-base font-extrabold text-white" />
            </div>
            <div className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-3.5 py-2 text-center">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-sky-300/80">
                Boys (M)
              </span>
              <AnimatedCounter value={classStats.boys} className="text-base font-extrabold text-sky-200" />
            </div>
            <div className="rounded-xl border border-pink-400/25 bg-pink-500/10 px-3.5 py-2 text-center">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-pink-300/80">
                Girls (F)
              </span>
              <AnimatedCounter value={classStats.girls} className="text-base font-extrabold text-pink-200" />
            </div>
            <button
              type="button"
              onClick={() => {
                setCsvMessage(null);
                setCsvModalOpen(true);
              }}
              className="rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-white/15"
            >
              Replace CSV
            </button>
          </div>
        </motion.div>

        {/* Forms Grid */}
        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {[1, 2].map((n) => (
              <div
                key={n}
                className="h-64 animate-pulse rounded-[30px] border border-white/10 bg-slate-950/60 p-6"
              />
            ))}
          </div>
        ) : forms.length === 0 ? (
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center rounded-[30px] border border-white/10 bg-slate-950/60 px-6 py-16 text-center shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#B15CFF]/30 bg-[#5227FF]/20 text-[#FF9FFC]">
              <FileSpreadsheet className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-bold text-white">No Registration Forms Yet</h3>
            <p className="mt-1.5 max-w-md text-sm text-white/55">
              Create your first team registration form to get a shareable /f/[slug] link, configure team size and topics, and export responses to Excel or PDF.
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-95"
            >
              <Plus className="h-4 w-4" />
              Create Your First Form
            </button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {forms.map((form, i) => {
              const s = form.stats || {
                boys: 0,
                girls: 0,
                total: 0,
                teams: 0,
                classTotal: classStats.total,
                classBoys: classStats.boys,
                classGirls: classStats.girls,
              };
              const isCopied = copiedId === form.id;
              const sizeLabel = formatTeamSizeLabel(form.min_team_size, form.max_team_size);

              return (
                <motion.div
                  key={form.id}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.05 }}
                  className="flex flex-col justify-between rounded-[30px] border border-white/10 bg-slate-950/65 p-6 shadow-2xl backdrop-blur-xl transition hover:border-white/20"
                >
                  <div>
                    {/* Top Row: Slug + Badges + Open/Close Switch */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-xl border border-[#B15CFF]/30 bg-[#5227FF]/20 px-3 py-1 font-mono text-xs font-semibold text-[#FF9FFC]">
                          /f/{form.slug}
                        </span>
                        <span className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/75">
                          Team of {sizeLabel}
                        </span>
                        {form.collect_topic && (
                          <span className="inline-flex items-center gap-1 rounded-xl border border-sky-400/30 bg-sky-500/15 px-2.5 py-1 text-[11px] font-semibold text-sky-300">
                            <BookOpen className="h-3 w-3" />
                            Topic ({form.allow_topic_repeat ? "Repeat ON" : "Unique"})
                          </span>
                        )}
                      </div>

                      {/* Open/Close Switch */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={form.is_open}
                        onClick={() => handleToggleOpen(form)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
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
                        {form.is_open ? "Open" : "Closed"}
                      </button>
                    </div>

                    {/* Title & Description */}
                    <h3 className="mt-4 text-xl font-bold text-white">{form.title}</h3>
                    {form.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-white/55">{form.description}</p>
                    ) : (
                      <p className="mt-1 text-xs italic text-white/35">No description provided</p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-white/40">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Created{" "}
                        {new Date(form.created_at).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      {form.created_by_email && (
                        <span>by {form.created_by_email}</span>
                      )}
                      {form.collect_topic && (
                        <span>
                          • {form.topicsCount || 0} uploaded topic
                          {form.topicsCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>

                    {/* Mini Live Stats Grid */}
                    <div className="mt-5 grid grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center">
                      <div>
                        <span className="block text-[10px] font-medium uppercase text-white/45">
                          Teams
                        </span>
                        <AnimatedCounter
                          value={s.teams}
                          className="text-base font-extrabold text-emerald-300"
                        />
                      </div>
                      <div>
                        <span className="block text-[10px] font-medium uppercase text-sky-300/75">
                          Boys
                        </span>
                        <AnimatedCounter
                          value={s.boys}
                          className="text-base font-extrabold text-sky-300"
                        />
                      </div>
                      <div>
                        <span className="block text-[10px] font-medium uppercase text-pink-300/75">
                          Girls
                        </span>
                        <AnimatedCounter
                          value={s.girls}
                          className="text-base font-extrabold text-pink-300"
                        />
                      </div>
                      <div>
                        <span className="block text-[10px] font-medium uppercase text-white/45">
                          Total
                        </span>
                        <AnimatedCounter
                          value={s.total}
                          className="text-base font-extrabold text-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleCopyLink(form)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
                      >
                        {isCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="text-emerald-300">Copied!</span>
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
                        className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Public Form
                      </Link>

                      <button
                        type="button"
                        onClick={() => openEditModal(form)}
                        className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                        aria-label={`Edit ${form.title}`}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeletingForm(form)}
                        className="rounded-xl border border-white/10 bg-white/5 p-2 text-rose-300/80 transition hover:border-rose-400/30 hover:bg-rose-500/15 hover:text-rose-200"
                        aria-label={`Delete ${form.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <Link
                      href={`/admin/forms/${form.id}`}
                      className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-[#5227FF] to-[#B15CFF] px-4 py-2 text-xs font-semibold text-white shadow transition hover:opacity-95"
                    >
                      Manage & Responses ({s.teams})
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Form Dialog */}
      <AnimatePresence>
        {formModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setFormModalOpen(false)}
          >
            <motion.div
              initial={prefersReducedMotion ? false : { scale: 0.95, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? {} : { scale: 0.95, opacity: 0, y: 12 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="my-8 w-full max-w-lg rounded-[30px] border border-white/15 bg-slate-950/95 p-6 shadow-2xl backdrop-blur-xl sm:p-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">
                  {editingForm ? "Edit Registration Form" : "Create Registration Form"}
                </h2>
                <button
                  type="button"
                  onClick={() => setFormModalOpen(false)}
                  className="rounded-xl p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSaveForm} className="mt-5 space-y-4">
                <GlassInput
                  label="Form Title (e.g. 23Z304 Data Structures Team)"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  required
                />

                <GlassInput
                  label="Description (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />

                <GlassInput
                  label="URL Slug (public link will be /f/slug)"
                  value={slug}
                  onChange={(e) => {
                    setSlugManuallyEdited(true);
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                  }}
                  helperText={slug ? `Public URL: /f/${slug}` : undefined}
                />

                {/* Min & Max Team Size Steppers */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/[0.03] px-4 py-3">
                    <div>
                      <span className="block text-xs font-semibold text-white">
                        Min Team Size
                      </span>
                      <span className="text-[11px] text-white/50">
                        Required rows
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleMinSizeChange(minTeamSize - 1)}
                        disabled={minTeamSize <= 1}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white transition hover:bg-white/15 disabled:opacity-35"
                        aria-label="Decrease minimum team size"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center text-base font-extrabold text-white tabular-nums">
                        {minTeamSize}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleMinSizeChange(minTeamSize + 1)}
                        disabled={minTeamSize >= 20}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white transition hover:bg-white/15 disabled:opacity-35"
                        aria-label="Increase minimum team size"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/[0.03] px-4 py-3">
                    <div>
                      <span className="block text-xs font-semibold text-white">
                        Max Team Size
                      </span>
                      <span className="text-[11px] text-white/50">
                        Max allowed rows
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleMaxSizeChange(maxTeamSize - 1)}
                        disabled={maxTeamSize <= 1}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white transition hover:bg-white/15 disabled:opacity-35"
                        aria-label="Decrease maximum team size"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center text-base font-extrabold text-white tabular-nums">
                        {maxTeamSize}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleMaxSizeChange(maxTeamSize + 1)}
                        disabled={maxTeamSize >= 20}
                        className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white transition hover:bg-white/15 disabled:opacity-35"
                        aria-label="Increase maximum team size"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Collect Topic Switch */}
                <div className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/[0.03] px-4 py-3">
                  <div>
                    <span className="block text-xs font-semibold text-white">
                      Collect Topic
                    </span>
                    <span className="text-[11px] text-white/50">
                      {collectTopic
                        ? "Teams must choose from uploaded topics CSV or enter a topic"
                        : "Off — no topic field shown on form or in exports"}
                    </span>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={collectTopic}
                    onClick={() => setCollectTopic((c) => !c)}
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                      collectTopic ? "bg-[#5227FF]" : "bg-white/20"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        collectTopic ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {/* Allow Topic Repetition Switch */}
                {collectTopic && (
                  <div className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/[0.03] px-4 py-3">
                    <div>
                      <span className="block text-xs font-semibold text-white">
                        Allow Topic Repetition
                      </span>
                      <span className="text-[11px] text-white/50">
                        {allowTopicRepeat
                          ? "Multiple teams may select the same topic"
                          : "Off — each topic can be claimed by only one team"}
                      </span>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={allowTopicRepeat}
                      onClick={() => setAllowTopicRepeat((r) => !r)}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                        allowTopicRepeat ? "bg-emerald-500" : "bg-white/20"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                          allowTopicRepeat ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                )}

                {/* Open/Closed Switch */}
                <div className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/[0.03] px-4 py-3">
                  <div>
                    <span className="block text-xs font-semibold text-white">Form Status</span>
                    <span className="text-[11px] text-white/50">
                      {isOpen
                        ? "Open — students can submit teams"
                        : "Closed — new submissions are paused"}
                    </span>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={isOpen}
                    onClick={() => setIsOpen((o) => !o)}
                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                      isOpen ? "bg-emerald-500" : "bg-white/20"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                        isOpen ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                {formError && (
                  <div className="rounded-2xl border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
                    {formError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setFormModalOpen(false)}
                    className="rounded-2xl border border-white/15 bg-white/5 px-5 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingForm}
                    className="rounded-2xl bg-gradient-to-r from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] px-6 py-2.5 text-xs font-semibold text-white shadow-lg transition hover:opacity-95 disabled:opacity-50"
                  >
                    {savingForm
                      ? "Saving…"
                      : editingForm
                      ? "Save Changes"
                      : "Create Form"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Form Confirm Dialog */}
      <AnimatePresence>
        {deletingForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setDeletingForm(null)}
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
              <h3 className="text-lg font-bold text-white">Delete Form?</h3>
              <p className="mt-2 text-xs text-white/60">
                Are you sure you want to delete{" "}
                <span className="font-semibold text-white">&ldquo;{deletingForm.title}&rdquo;</span>?
                All registered teams and responses for this form will be permanently removed.
              </p>

              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setDeletingForm(null)}
                  className="rounded-2xl border border-white/15 bg-white/5 px-5 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deletingBusy}
                  onClick={handleConfirmDelete}
                  className="rounded-2xl bg-rose-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg hover:bg-rose-500 disabled:opacity-50"
                >
                  {deletingBusy ? "Deleting…" : "Yes, Delete Form"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CSV Upload Modal */}
      <AnimatePresence>
        {csvModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
            onClick={() => setCsvModalOpen(false)}
          >
            <motion.div
              initial={prefersReducedMotion ? false : { scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={prefersReducedMotion ? {} : { scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-[30px] border border-white/15 bg-slate-950/95 p-6 shadow-2xl backdrop-blur-xl sm:p-8"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Upload Class List CSV</h3>
                <button
                  type="button"
                  onClick={() => setCsvModalOpen(false)}
                  className="rounded-xl p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="mt-2 text-xs text-white/60">
                Upload a CSV file with headers{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-[#FF9FFC]">
                  roll_no,name,gender
                </code>{" "}
                (supports <code className="text-white/80">M/F</code> or{" "}
                <code className="text-white/80">B/G</code>). Existing students are updated by roll
                number.
              </p>

              <div className="mt-5">
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/20 bg-white/[0.03] px-4 py-8 text-center transition hover:border-[#FF9FFC]/50 hover:bg-white/[0.06]">
                  <Upload className="mb-2 h-7 w-7 text-[#FF9FFC]" />
                  <span className="text-xs font-semibold text-white">
                    {csvUploading ? "Uploading & parsing CSV…" : "Click to choose CSV file"}
                  </span>
                  <span className="mt-1 text-[11px] text-white/45">
                    e.g. classlist.csv (max 5MB)
                  </span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    disabled={csvUploading}
                    onChange={(e) => handleCsvFileChange(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
              </div>

              {csvMessage && (
                <div
                  className={`mt-4 rounded-2xl border px-4 py-3 text-xs ${
                    csvMessage.type === "success"
                      ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
                      : "border-rose-400/35 bg-rose-500/10 text-rose-200"
                  }`}
                >
                  {csvMessage.text}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
