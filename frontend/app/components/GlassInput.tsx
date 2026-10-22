"use client";

import { forwardRef, InputHTMLAttributes, ReactNode, useId } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

export type InputStatus = "idle" | "checking" | "valid" | "invalid" | "warning";

interface GlassInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
  studentName?: string;
  gender?: "M" | "F";
  icon?: ReactNode;
  /** Drives the border color + trailing icon — handy for async validation. */
  status?: InputStatus;
}

function StatusIcon({ status }: { status: InputStatus }) {
  if (status === "checking") {
    return (
      <svg className="h-4 w-4 animate-spin text-[#FF9FFC]" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
      </svg>
    );
  }
  if (status === "valid") {
    return (
      <motion.svg
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 18 }}
        className="h-4 w-4 text-emerald-400"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M16.704 5.29a1 1 0 010 1.415l-7.004 7a1 1 0 01-1.414 0l-3.004-3a1 1 0 111.414-1.414l2.297 2.296 6.297-6.296a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </motion.svg>
    );
  }
  if (status === "warning") {
    return (
      <motion.svg
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="h-4 w-4 text-amber-400"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </motion.svg>
    );
  }
  if (status === "invalid") {
    return (
      <motion.svg
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="h-4 w-4 text-rose-400"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 6a1 1 0 112 0v4a1 1 0 11-2 0V6zm1 8.5a1.125 1.125 0 100-2.25 1.125 1.125 0 000 2.25z"
          clipRule="evenodd"
        />
      </motion.svg>
    );
  }
  return null;
}

const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
  (
    {
      label,
      error,
      helperText,
      studentName,
      gender,
      icon,
      status = "idle",
      id,
      className = "",
      type = "text",
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const prefersReducedMotion = useReducedMotion();

    const isWarning = status === "warning";
    const isError = status === "invalid" || (!!error && !isWarning);
    const isValid = status === "valid" && !error;

    const borderClasses = isWarning
      ? "bg-gradient-to-r from-amber-400 via-yellow-400 to-orange-400 shadow-[0_0_20px_-6px_rgba(251,191,36,0.45)]"
      : isError
      ? "bg-gradient-to-r from-rose-500 via-red-400 to-orange-400 shadow-[0_0_20px_-6px_rgba(244,63,94,0.45)]"
      : isValid
      ? "bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 shadow-[0_0_20px_-6px_rgba(52,211,153,0.45)]"
      : "bg-white/15 hover:bg-white/25 focus-within:bg-gradient-to-r focus-within:from-[#5227FF] focus-within:via-[#B15CFF] focus-within:to-[#FF9FFC] focus-within:shadow-[0_0_28px_-6px_rgba(255,159,252,0.55)]";

    const displayName = studentName ?? (isValid ? helperText : undefined);

    return (
      <div className="w-full">
        <motion.div
          animate={
            !prefersReducedMotion && (isError || isWarning)
              ? { x: [0, -6, 6, -4, 4, 0] }
              : { x: 0 }
          }
          transition={{ duration: 0.35 }}
          className={`relative rounded-2xl p-[1.5px] transition-all duration-300 ${borderClasses}`}
        >
          <div className="relative flex items-center rounded-[15px] bg-slate-950/50 backdrop-blur-xl">
            {icon && <span className="pointer-events-none absolute left-4 text-white/50">{icon}</span>}

            <input
              ref={ref}
              id={inputId}
              type={type}
              placeholder=" "
              aria-invalid={isError || isWarning}
              aria-describedby={error || helperText || displayName ? `${inputId}-desc` : undefined}
              className={`peer w-full rounded-[15px] bg-transparent px-4 pb-2.5 pt-5 text-sm text-white placeholder-transparent outline-none focus-visible:ring-2 focus-visible:ring-[#FF9FFC]/40 ${
                icon ? "pl-11" : ""
              } ${status !== "idle" ? "pr-10" : ""} ${className}`}
              {...props}
            />

            <label
              htmlFor={inputId}
              className={`pointer-events-none absolute top-2 text-[11px] font-medium text-white/70 transition-all duration-200 ${
                icon ? "left-11" : "left-4"
              } peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-sm peer-placeholder-shown:text-white/45 peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[11px] peer-focus:text-white/80`}
            >
              {label}
            </label>

            {status !== "idle" && (
              <span className="absolute right-4 flex items-center">
                <StatusIcon status={status} />
              </span>
            )}
          </div>
        </motion.div>

        <div aria-live="polite" className="min-h-[20px]">
          <AnimatePresence mode="wait">
            {(error || displayName || helperText) && (
              <motion.div
                key={error || displayName || helperText}
                id={`${inputId}-desc`}
                initial={prefersReducedMotion ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="mt-1.5 flex flex-wrap items-center gap-2 pl-1 text-xs"
              >
                {error ? (
                  <span className={isWarning ? "font-medium text-amber-300" : "font-medium text-rose-300"}>
                    {error}
                    {isWarning && studentName ? ` (${studentName})` : ""}
                  </span>
                ) : displayName ? (
                  <span className="inline-flex items-center gap-2 text-emerald-300">
                    <span className="font-medium text-white/90">{displayName}</span>
                    {gender && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${
                          gender === "M"
                            ? "border-sky-400/35 bg-sky-500/15 text-sky-300"
                            : "border-pink-400/35 bg-pink-500/15 text-pink-300"
                        }`}
                      >
                        {gender === "M" ? "Boy • M" : "Girl • F"}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-white/50">{helperText}</span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }
);

GlassInput.displayName = "GlassInput";

export default GlassInput;
