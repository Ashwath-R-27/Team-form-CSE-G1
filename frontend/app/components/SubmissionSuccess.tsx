"use client";

import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import confetti from "canvas-confetti";
import AnimatedCounter from "./AnimatedCounter";
import { StudentMember } from "@/lib/api";

interface SubmissionSuccessProps {
  teamNumber: number;
  members: StudentMember[];
  topic?: string | null;
  formTitle?: string;
  onRegisterAnother?: () => void;
}

export default function SubmissionSuccess({
  teamNumber,
  members,
  topic,
  formTitle,
  onRegisterAnother,
}: SubmissionSuccessProps) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) return;

    try {
      confetti({
        particleCount: 75,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#5227FF", "#B15CFF", "#FF9FFC", "#34D399", "#38BDF8"],
      });

      const timer = setTimeout(() => {
        confetti({
          particleCount: 45,
          angle: 60,
          spread: 55,
          origin: { x: 0.15, y: 0.65 },
          colors: ["#5227FF", "#FF9FFC", "#FFFFFF"],
        });
        confetti({
          particleCount: 45,
          angle: 120,
          spread: 55,
          origin: { x: 0.85, y: 0.65 },
          colors: ["#5227FF", "#FF9FFC", "#FFFFFF"],
        });
      }, 260);

      return () => clearTimeout(timer);
    } catch {
      // Ignore confetti errors in headless/non-canvas environments
    }
  }, [prefersReducedMotion]);

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="flex w-full flex-col items-center text-center"
    >
      {/* Badge: pulsing ring + gradient circle + drawn checkmark */}
      <div className="relative mb-5 h-20 w-20">
        <span className="absolute inset-0 animate-ping rounded-full bg-gradient-to-r from-[#5227FF] to-[#FF9FFC] opacity-20" />
        <span className="absolute inset-0 rounded-full bg-gradient-to-br from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] shadow-[0_0_32px_-4px_rgba(255,159,252,0.65)]" />

        <svg className="relative h-20 w-20" viewBox="0 0 24 24" fill="none">
          <motion.path
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
            d="M5 12.5l4.5 4.5L19 7"
            stroke="white"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/90">
        Registration Complete
      </p>

      {formTitle && (
        <p className="mt-1 text-xs text-white/50">{formTitle}</p>
      )}

      <div className="mt-2 flex items-baseline justify-center gap-1 bg-gradient-to-r from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] bg-clip-text text-4xl font-extrabold text-transparent sm:text-5xl">
        <span>Team #</span>
        <AnimatedCounter value={teamNumber} duration={0.8} />
      </div>

      <p className="mt-1.5 text-xs text-white/55">
        Save your team number for future reference
      </p>

      {topic && (
        <div className="mt-4 w-full max-w-md rounded-2xl border border-[#B15CFF]/35 bg-[#5227FF]/15 px-4 py-3 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#FF9FFC]/80">
            Selected Topic
          </p>
          <p className="mt-0.5 text-sm font-bold text-white">{topic}</p>
        </div>
      )}

      <div className="mt-4 w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-4 text-left backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
            Sorted Team Members ({members.length})
          </p>
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-400/25">
            Confirmed
          </span>
        </div>

        <ul className="space-y-2.5">
          {members.map((m, i) => (
            <motion.li
              key={m.roll_no}
              initial={prefersReducedMotion ? false : { opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.25 + i * 0.08 }}
              className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2 text-sm text-white/90"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <svg className="h-4 w-4 shrink-0 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M16.704 5.29a1 1 0 010 1.415l-7.004 7a1 1 0 01-1.414 0l-3.004-3a1 1 0 111.414-1.414l2.297 2.296 6.297-6.296a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="font-mono font-bold text-white">{m.roll_no}</span>
                <span className="truncate text-white/70">— {m.name}</span>
              </div>

              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  m.gender === "M"
                    ? "border-sky-400/35 bg-sky-500/15 text-sky-300"
                    : "border-pink-400/35 bg-pink-500/15 text-pink-300"
                }`}
              >
                {m.gender === "M" ? "Boy • M" : "Girl • F"}
              </span>
            </motion.li>
          ))}
        </ul>
      </div>

      {onRegisterAnother && (
        <motion.button
          type="button"
          whileHover={prefersReducedMotion ? {} : { scale: 1.02 }}
          whileTap={prefersReducedMotion ? {} : { scale: 0.98 }}
          onClick={onRegisterAnother}
          className="mt-6 rounded-2xl border border-white/15 bg-white/10 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15"
        >
          Register Another Team
        </motion.button>
      )}
    </motion.div>
  );
}
