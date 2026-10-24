"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import LiveStatsCards from "@/app/components/LiveStatsCards";
import ChosenTopicsSection from "@/app/components/ChosenTopicsSection";
import TeamRegistrationForm from "@/app/components/TeamRegistrationForm";
import {
  ChosenTopicItem,
  fetchChosenTopics,
  fetchFormStats,
  fetchPublicForms,
  FormInfo,
  FormStats,
} from "@/lib/api";

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
  const [chosenTopics, setChosenTopics] = useState<ChosenTopicItem[]>([]);
  const [loadingChosenTopics, setLoadingChosenTopics] = useState(false);
  const [pickedTopicRequest, setPickedTopicRequest] = useState<{
    topic: string;
    seq: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshState = useCallback(
    async (slug: string, collectTopic: boolean, showChosenTopics: boolean) => {
      try {
        const [latestStats, latestChosen] = await Promise.all([
          fetchFormStats(slug),
          collectTopic && showChosenTopics
            ? fetchChosenTopics(slug).catch(() => null)
            : Promise.resolve([]),
        ]);
        setStats(latestStats);
        if (latestChosen !== null) {
          setChosenTopics(latestChosen);
        }
        setLoadingChosenTopics(false);
      } catch {
        // Ignore transient errors
      }
    },
    []
  );

  useEffect(() => {
    fetchPublicForms()
      .then(async (res) => {
        const firstOpen = res.forms.find((f) => f.is_open) || res.forms[0] || null;
        setForm(firstOpen);
        if (firstOpen?.stats) {
          setStats(firstOpen.stats);
        }
        if (firstOpen?.collect_topic && firstOpen?.show_chosen_topics) {
          const initialChosen = await fetchChosenTopics(firstOpen.slug).catch(() => []);
          setChosenTopics(initialChosen);
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setLoadingChosenTopics(false);
      });
  }, []);

  useEffect(() => {
    if (!form) return;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      refreshState(form.slug, form.collect_topic, Boolean(form.show_chosen_topics));
    }, 5000);
    return () => clearInterval(interval);
  }, [form, refreshState]);

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

        {form?.collect_topic && form?.show_chosen_topics && (
          <div className="w-full max-w-2xl rounded-[30px] border border-white/10 bg-slate-950/60 p-6 shadow-2xl backdrop-blur-xl">
            <ChosenTopicsSection
              topics={chosenTopics}
              allowTopicRepeat={form.allow_topic_repeat}
              loading={loadingChosenTopics}
              onSelectTopic={
                form.allow_topic_repeat && form.is_open
                  ? (topic) =>
                      setPickedTopicRequest((prev) => ({
                        topic,
                        seq: (prev?.seq || 0) + 1,
                      }))
                  : undefined
              }
            />
          </div>
        )}

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
              chosenTopics={chosenTopics}
              pickedTopicRequest={pickedTopicRequest}
              onSubmitted={() =>
                refreshState(
                  form.slug,
                  form.collect_topic,
                  Boolean(form.show_chosen_topics)
                )
              }
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
