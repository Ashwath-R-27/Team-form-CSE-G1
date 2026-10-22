"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Lock, Users, AlertCircle, ArrowLeft } from "lucide-react";
import LiveStatsCards from "@/app/components/LiveStatsCards";
import TeamRegistrationForm from "@/app/components/TeamRegistrationForm";
import {
  ApiClientError,
  fetchFormBySlug,
  fetchFormStats,
  formatTeamSizeLabel,
  FormInfo,
  FormStats,
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

export default function PublicFormPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const prefersReducedMotion = useReducedMotion();

  const [form, setForm] = useState<FormInfo | null>(null);
  const [stats, setStats] = useState<FormStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshLiveState = useCallback(async () => {
    if (!slug) return;
    try {
      const [latestForm, latestStats] = await Promise.all([
        fetchFormBySlug(slug),
        fetchFormStats(slug),
      ]);
      setForm(latestForm);
      setStats(latestStats);
    } catch {
      // Ignore transient polling errors
    }
  }, [slug]);

  const loadForm = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFormBySlug(slug);
      setForm(data);
      if (data.stats) {
        setStats(data.stats);
      } else {
        const latestStats = await fetchFormStats(slug);
        setStats(latestStats);
      }
    } catch (err: any) {
      if (err instanceof ApiClientError && err.status === 404) {
        setError("This registration form does not exist or may have been removed.");
      } else {
        setError(err?.message || "Unable to load the registration form.");
      }
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  // Poll live stats and form settings every 5 seconds
  useEffect(() => {
    if (!slug || error) return;
    const interval = setInterval(refreshLiveState, 5000);
    return () => clearInterval(interval);
  }, [slug, error, refreshLiveState]);

  const sizeLabel = form
    ? formatTeamSizeLabel(form.min_team_size, form.max_team_size)
    : "";

  return (
    <div className="relative flex min-h-screen flex-col font-sans">
      {/* Header */}
      <header className="fixed top-0 left-0 z-50 flex w-full items-center justify-between border-b border-white/10 bg-slate-950/50 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Back to all forms"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            {loading ? (
              <div className="h-5 w-48 animate-pulse rounded-lg bg-white/15" />
            ) : (
              <h1 className="truncate text-base font-bold tracking-wide text-white md:text-lg">
                {form?.title || "TEAM REGISTRATION"}
              </h1>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {form && (
            <span className="hidden items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 sm:inline-flex">
              <Users className="h-3.5 w-3.5 text-[#FF9FFC]" />
              Team of {sizeLabel}
            </span>
          )}
          {form && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                form.is_open
                  ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300"
                  : "border-rose-400/30 bg-rose-500/15 text-rose-300"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  form.is_open ? "bg-emerald-400" : "bg-rose-400"
                }`}
              />
              {form.is_open ? "Open" : "Closed"}
            </span>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="mt-20 flex flex-1 flex-col items-center justify-center gap-6 px-4 py-8 sm:px-6">
        {loading ? (
          /* Skeleton Loader */
          <div className="flex w-full max-w-2xl flex-col gap-6">
            <div className="w-full rounded-[30px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur-xl">
              <div className="mb-4 h-4 w-44 animate-pulse rounded bg-white/10" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-20 animate-pulse rounded-2xl bg-white/5" />
                ))}
              </div>
              <div className="mt-4 h-3 w-full animate-pulse rounded-full bg-white/10" />
            </div>
            <div className="w-full rounded-[30px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur-xl">
              <div className="mx-auto mb-6 h-6 w-56 animate-pulse rounded bg-white/10" />
              <div className="space-y-4">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-14 w-full animate-pulse rounded-2xl bg-white/5" />
                ))}
                <div className="h-12 w-full animate-pulse rounded-2xl bg-white/10" />
              </div>
            </div>
          </div>
        ) : error || !form ? (
          /* Friendly Error / 404 State */
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex w-full max-w-lg flex-col items-center rounded-[30px] border border-white/10 bg-slate-950/70 p-8 text-center shadow-2xl backdrop-blur-xl"
          >
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-400/30 bg-rose-500/15 text-rose-300">
              <AlertCircle className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold text-white">Form Unavailable</h2>
            <p className="mt-2 text-sm text-white/60">{error}</p>
            <Link
              href="/"
              className="mt-6 rounded-2xl bg-gradient-to-r from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-95"
            >
              Browse Available Forms
            </Link>
          </motion.div>
        ) : (
          <>
            {/* Live Stats Card */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="w-full max-w-2xl rounded-[30px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur-xl"
            >
              <LiveStatsCards stats={stats} />
            </motion.div>

            {/* Form Card or Closed State */}
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08 }}
              className="flex w-full max-w-2xl flex-col items-center justify-center rounded-[30px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur-xl sm:p-8"
            >
              <div className="flex w-full flex-col items-center text-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#B15CFF]/30 bg-[#5227FF]/20 px-3.5 py-1 text-xs font-semibold text-[#FF9FFC]">
                  <Users className="h-3.5 w-3.5" />
                  Team Size: {sizeLabel}{" "}
                  {form.min_team_size === 1 && form.max_team_size === 1
                    ? "Member"
                    : "Members"}
                </div>
                <h2 className="mt-3 text-lg font-bold tracking-wide text-white md:text-xl">
                  ENTER YOUR TEAM DETAILS
                </h2>
                {form.description && (
                  <p className="mt-1 max-w-lg text-xs text-white/60 sm:text-sm">
                    {form.description}
                  </p>
                )}
              </div>

              <hr className="my-5 w-full border-white/10" />

              {!form.is_open ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/15 text-amber-300">
                    <Lock className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Registrations Are Closed</h3>
                  <p className="mt-1.5 max-w-md text-sm text-white/55">
                    This form is currently not accepting new team submissions. Please contact your course instructor if you need assistance.
                  </p>
                </div>
              ) : (
                <TeamRegistrationForm
                  slug={form.slug}
                  minTeamSize={form.min_team_size}
                  maxTeamSize={form.max_team_size}
                  collectTopic={form.collect_topic}
                  allowTopicRepeat={form.allow_topic_repeat}
                  hasTopicOptions={Boolean(form.hasTopicOptions)}
                  formTitle={form.title}
                  onSubmitted={refreshLiveState}
                />
              )}
            </motion.div>
          </>
        )}
      </main>
    </div>
  );
}
