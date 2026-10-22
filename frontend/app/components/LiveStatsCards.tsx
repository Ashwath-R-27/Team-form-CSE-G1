"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Users, UserCheck } from "lucide-react";
import AnimatedCounter from "./AnimatedCounter";
import ProgressBar from "./ProgressBar";
import { FormStats } from "@/lib/api";

interface LiveStatsCardsProps {
  stats: FormStats;
  loading?: boolean;
}

export default function LiveStatsCards({ stats, loading = false }: LiveStatsCardsProps) {
  const prefersReducedMotion = useReducedMotion();

  const cards = [
    {
      label: "Boys Filled",
      value: stats.boys,
      sub: stats.classBoys > 0 ? `of ${stats.classBoys} boys` : "Male students",
      accent: "from-sky-400/20 to-blue-500/10 border-sky-400/25 text-sky-300",
      badgeBg: "bg-sky-500/20 text-sky-300 border-sky-400/30",
      badgeText: "M",
    },
    {
      label: "Girls Filled",
      value: stats.girls,
      sub: stats.classGirls > 0 ? `of ${stats.classGirls} girls` : "Female students",
      accent: "from-pink-400/20 to-fuchsia-500/10 border-pink-400/25 text-pink-300",
      badgeBg: "bg-pink-500/20 text-pink-300 border-pink-400/30",
      badgeText: "F",
    },
    {
      label: "Total Filled",
      value: stats.total,
      sub: stats.classTotal > 0 ? `of ${stats.classTotal} students` : "Registered so far",
      accent: "from-[#5227FF]/25 to-[#FF9FFC]/15 border-[#B15CFF]/30 text-[#FF9FFC]",
      icon: UserCheck,
    },
    {
      label: "Teams Formed",
      value: stats.teams,
      sub: "Confirmed teams",
      accent: "from-emerald-400/20 to-teal-500/10 border-emerald-400/25 text-emerald-300",
      icon: Users,
    },
  ];

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
            Live Registration Stats
          </span>
        </div>
        <span className="text-[11px] text-white/40">
          Updates every 5s
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.06 }}
              className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-3.5 backdrop-blur-xl ${card.accent}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-white/65">
                  {card.label}
                </span>
                {card.badgeText ? (
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${card.badgeBg}`}
                  >
                    {card.badgeText}
                  </span>
                ) : Icon ? (
                  <Icon className="h-4 w-4 opacity-80" />
                ) : null}
              </div>

              <div className="mt-1.5 flex items-baseline gap-1.5">
                {loading ? (
                  <div className="h-7 w-12 animate-pulse rounded-lg bg-white/10" />
                ) : (
                  <AnimatedCounter
                    value={card.value}
                    className="text-2xl font-extrabold tracking-tight text-white"
                  />
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-white/45">{card.sub}</p>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-1">
        <ProgressBar
          current={stats.total}
          total={stats.classTotal || 87}
          label="Students who've joined a team"
        />
      </div>
    </div>
  );
}
