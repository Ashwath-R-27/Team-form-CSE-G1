"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Users, ArrowRight, Lock } from "lucide-react";
import AnimatedCounter from "@/app/components/AnimatedCounter";
import { fetchPublicForms, formatTeamSizeLabel, FormInfo } from "@/lib/api";

export default function HomePage() {
  const prefersReducedMotion = useReducedMotion();
  const [forms, setForms] = useState<FormInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPublicForms()
      .then((res) => setForms(res.forms))
      .catch(() => setForms([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col font-sans">
      <header className="sticky top-0 z-50 flex w-full items-center justify-between border-b border-white/10 bg-slate-950/50 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] text-white shadow">
            <Users className="h-4 w-4" />
          </div>
          <span className="text-base font-bold tracking-wide text-white md:text-lg">
            CSE G1 TEAM REGISTRATION PORTAL
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 py-12">
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="bg-gradient-to-r from-white via-white to-[#FF9FFC] bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-5xl">
            Register Your Course Team
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-white/60 sm:text-base">
            Select an active registration form below, enter your team members&apos; roll numbers, and receive your official team number instantly.
          </p>
        </motion.div>

        <div className="mt-10 w-full">
          {loading ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {[1, 2].map((n) => (
                <div
                  key={n}
                  className="h-52 animate-pulse rounded-[30px] border border-white/10 bg-slate-950/60 p-6"
                />
              ))}
            </div>
          ) : forms.length === 0 ? (
            <motion.div
              initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto max-w-lg rounded-[30px] border border-white/10 bg-slate-950/65 p-8 text-center shadow-2xl backdrop-blur-xl"
            >
              <h2 className="text-lg font-bold text-white">No Active Forms Yet</h2>
              <p className="mt-2 text-xs text-white/55">
                No team registration forms have been published yet. Please check back later or use the direct form link shared by your course instructor.
              </p>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {forms.map((form, i) => {
                const s = form.stats || {
                  boys: 0,
                  girls: 0,
                  total: 0,
                  teams: 0,
                  classTotal: 87,
                  classBoys: 43,
                  classGirls: 44,
                };
                const sizeLabel = formatTeamSizeLabel(form.min_team_size, form.max_team_size);
                return (
                  <motion.div
                    key={form.id}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: i * 0.06 }}
                    className="group flex flex-col justify-between rounded-[30px] border border-white/10 bg-slate-950/65 p-6 shadow-2xl backdrop-blur-xl transition hover:border-[#FF9FFC]/40"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#B15CFF]/35 bg-[#5227FF]/20 px-3 py-1 text-xs font-semibold text-[#FF9FFC]">
                          <Users className="h-3.5 w-3.5" />
                          Team of {sizeLabel}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                            form.is_open
                              ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-300"
                              : "border-rose-400/35 bg-rose-500/15 text-rose-300"
                          }`}
                        >
                          {form.is_open ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          ) : (
                            <Lock className="h-3 w-3" />
                          )}
                          {form.is_open ? "Open" : "Closed"}
                        </span>
                      </div>

                      <h2 className="mt-4 text-xl font-bold text-white transition-colors group-hover:text-[#FF9FFC]">
                        {form.title}
                      </h2>
                      {form.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-white/60">
                          {form.description}
                        </p>
                      )}

                      <div className="mt-5 grid grid-cols-4 gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center">
                        <div>
                          <span className="block text-[10px] uppercase text-white/45">Teams</span>
                          <AnimatedCounter
                            value={s.teams}
                            className="text-sm font-extrabold text-emerald-300"
                          />
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase text-sky-300/75">Boys</span>
                          <AnimatedCounter
                            value={s.boys}
                            className="text-sm font-extrabold text-sky-300"
                          />
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase text-pink-300/75">Girls</span>
                          <AnimatedCounter
                            value={s.girls}
                            className="text-sm font-extrabold text-pink-300"
                          />
                        </div>
                        <div>
                          <span className="block text-[10px] uppercase text-white/45">Total</span>
                          <AnimatedCounter
                            value={s.total}
                            className="text-sm font-extrabold text-white"
                          />
                        </div>
                      </div>
                    </div>

                    <Link
                      href={`/f/${form.slug}`}
                      className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] px-6 py-3 text-xs font-semibold text-white shadow-lg transition hover:opacity-95"
                    >
                      {form.is_open ? "Register Team" : "View Form Stats"}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
