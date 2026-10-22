"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface SelectOption {
  id: string;
  name: string;
  taken?: boolean;
  teamNo?: number;
}

interface GlassSelectProps {
  label: string;
  options: SelectOption[];
  value: string | null;
  onChange: (name: string) => void;
  loading?: boolean;
  error?: string;
  placeholder?: string;
}

export default function GlassSelect({
  label,
  options,
  value,
  onChange,
  loading = false,
  error,
  placeholder = "Select a topic",
}: GlassSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const selected =
    options.find((o) => o.name === value || o.id === value) ?? null;
  const filtered = query
    ? options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase()))
    : options;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  return (
    <div className="w-full" ref={rootRef}>
      <label
        id={`${id}-label`}
        className="mb-1.5 block pl-1 text-[11px] font-medium text-white/70"
      >
        {label}
      </label>

      <div className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${id}-label`}
          onClick={() => setOpen((o) => !o)}
          disabled={loading}
          className={`flex w-full items-center justify-between rounded-2xl p-[1.5px] transition-all duration-300 disabled:cursor-wait ${
            error
              ? "bg-gradient-to-r from-rose-500 via-red-400 to-orange-400"
              : open
              ? "bg-gradient-to-r from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] shadow-[0_0_28px_-6px_rgba(255,159,252,0.55)]"
              : selected
              ? "bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 shadow-[0_0_20px_-6px_rgba(52,211,153,0.45)]"
              : "bg-white/15 hover:bg-white/25"
          }`}
        >
          <span className="flex w-full items-center justify-between rounded-[15px] bg-slate-950/50 px-4 py-3.5 backdrop-blur-xl">
            <span
              className={`truncate text-sm ${
                selected ? "font-medium text-white" : "text-white/45"
              }`}
            >
              {loading
                ? "Loading topics…"
                : selected
                ? selected.name
                : placeholder}
            </span>
            <svg
              className={`h-4 w-4 shrink-0 text-white/50 transition-transform duration-300 ${
                open ? "rotate-180" : ""
              }`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        </button>

        {open && !loading && (
          <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 shadow-2xl backdrop-blur-xl">
            <div className="border-b border-white/10 p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search topics…"
                aria-label="Search topics"
                className="w-full rounded-xl bg-white/5 px-3 py-2 text-sm text-white placeholder-white/35 outline-none focus:bg-white/10"
              />
            </div>

            <ul
              role="listbox"
              aria-labelledby={`${id}-label`}
              className="max-h-60 overflow-y-auto p-1.5"
            >
              {filtered.length === 0 && (
                <li className="px-3 py-4 text-center text-xs text-white/45">
                  {options.length === 0
                    ? "No topics available."
                    : "No topics match your search."}
                </li>
              )}
              {filtered.map((opt) => {
                const isSelected =
                  opt.name === value || opt.id === value;
                const isTaken = Boolean(opt.taken);

                return (
                  <li key={opt.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={isTaken}
                      disabled={isTaken}
                      onClick={() => {
                        if (isTaken) return;
                        onChange(opt.name);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors duration-150 ${
                        isTaken
                          ? "cursor-not-allowed text-white/35 opacity-60"
                          : isSelected
                          ? "bg-gradient-to-r from-[#5227FF]/30 to-[#FF9FFC]/30 font-medium text-white"
                          : "text-white/80 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <span className="truncate">{opt.name}</span>
                      {isTaken ? (
                        <span className="shrink-0 rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-amber-300">
                          Taken by Team {opt.teamNo ?? ""}
                        </span>
                      ) : isSelected ? (
                        <svg
                          className="h-4 w-4 shrink-0 text-emerald-400"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.704 5.29a1 1 0 010 1.415l-7.004 7a1 1 0 01-1.414 0l-3.004-3a1 1 0 111.414-1.414l2.297 2.296 6.297-6.296a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div aria-live="polite" className="min-h-[18px]">
        {error && (
          <p className="mt-1.5 pl-1 text-xs font-medium text-rose-300">{error}</p>
        )}
      </div>
    </div>
  );
}
