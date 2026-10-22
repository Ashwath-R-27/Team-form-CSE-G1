"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LiveStatsCards from "@/app/components/LiveStatsCards";
import TeamRegistrationForm from "@/app/components/TeamRegistrationForm";
import { fetchFormStats, fetchPublicForms, FormInfo, FormStats } from "@/lib/api";

const DEFAULT_STATS: FormStats = {
  boys: 0,
  girls: 0,
  total: 0,
  teams: 0,
  classTotal: 87,
  classBoys: 43,
  classGirls: 44,
};

export default function FormPage() {
  const [form, setForm] = useState<FormInfo | null>(null);
  const [stats, setStats] = useState<FormStats>(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPublicForms()
      .then((res) => {
        const firstOpen = res.forms.find((f) => f.is_open) || res.forms[0] || null;
        setForm(firstOpen);
        if (firstOpen?.stats) {
          setStats(firstOpen.stats);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!form) return;
    const interval = setInterval(() => {
      fetchFormStats(form.slug)
        .then(setStats)
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [form]);

  return (
    <div className="relative flex min-h-screen flex-col font-sans">
      <header className="fixed top-0 left-0 z-50 flex w-full items-center justify-between border-b border-white/10 bg-slate-950/50 p-6 backdrop-blur-md">
        <span className="text-center text-[17px] font-bold text-white md:text-xl">
          {form?.title || "TEAM REGISTRATION"}
        </span>
        {form && (
          <Link
            href={`/f/${form.slug}`}
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-xs text-[#FF9FFC] hover:bg-white/10"
          >
            /f/{form.slug}
          </Link>
        )}
      </header>

      <main className="mt-22 flex flex-1 flex-col items-center justify-center gap-6 p-6">
        <div className="w-full max-w-2xl rounded-[30px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur-xl">
          <LiveStatsCards stats={stats} loading={loading} />
        </div>

        <div className="flex w-full max-w-2xl flex-col items-center justify-center rounded-[30px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur-xl">
          <span className="text-[17px] font-bold text-white md:text-xl">
            ENTER YOUR TEAM DETAILS
          </span>
          <hr className="my-4 w-full border-white/10" />
          {form ? (
            <TeamRegistrationForm
              slug={form.slug}
              minTeamSize={form.min_team_size}
              maxTeamSize={form.max_team_size}
              collectTopic={form.collect_topic}
              allowTopicRepeat={form.allow_topic_repeat}
              hasTopicOptions={Boolean(form.hasTopicOptions)}
              formTitle={form.title}
              onSubmitted={() => fetchFormStats(form.slug).then(setStats)}
            />
          ) : (
            <div className="py-6 text-center text-sm text-white/60">
              No active registration form is currently open.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
