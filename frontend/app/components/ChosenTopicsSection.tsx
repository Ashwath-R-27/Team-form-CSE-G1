"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BookOpen, ChevronDown, ChevronUp, Search } from "lucide-react";
import { ChosenTopicItem } from "@/lib/api";

interface ChosenTopicsSectionProps {
  topics: ChosenTopicItem[];
  allowTopicRepeat: boolean;
  loading?: boolean;
  onSelectTopic?: (topic: string) => void;
}

const INITIAL_VISIBLE_COUNT = 8;

function formatTeamsLabel(item: ChosenTopicItem): string {
  if (item.teamNos.length > 1 || item.count > 1) {
    return `Teams ${item.teamNos.join(", ")} · ${item.count} teams`;
  }
  return `Team ${item.teamNos[0] ?? 1}`;
}

export default function ChosenTopicsSection({
  topics,
  allowTopicRepeat,
  loading = false,
  onSelectTopic,
}: ChosenTopicsSectionProps) {
  const prefersReducedMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedKeys, setHighlightedKeys] = useState<Set<string>>(() => new Set());
  const seenTopicsRef = useRef<Map<string, number> | null>(null);

  useEffect(() => {
    if (loading) return;

    if (seenTopicsRef.current === null) {
      const initialMap = new Map<string, number>();
      for (const item of topics) {
        initialMap.set(item.topic.toLowerCase(), item.count);
      }
      seenTopicsRef.current = initialMap;
      return;
    }

    const prevMap = seenTopicsRef.current;
    const newlyChanged: string[] = [];
    const nextMap = new Map<string, number>();

    for (const item of topics) {
      const key = item.topic.toLowerCase();
      const prevCount = prevMap.get(key);
      if (prevCount === undefined || item.count > prevCount) {
        newlyChanged.push(key);
      }
      nextMap.set(key, item.count);
    }

    seenTopicsRef.current = nextMap;

    if (newlyChanged.length > 0) {
      setHighlightedKeys((prev) => {
        const next = new Set(prev);
        for (const k of newlyChanged) next.add(k);
        return next;
      });

      const timer = setTimeout(() => {
        setHighlightedKeys((prev) => {
          const next = new Set(prev);
          for (const k of newlyChanged) next.delete(k);
          return next;
        });
      }, 2800);

      return () => clearTimeout(timer);
    }
  }, [topics, loading]);

  const hasLongList = topics.length > INITIAL_VISIBLE_COUNT;

  const filteredTopics = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter(
      (item) =>
        item.topic.toLowerCase().includes(q) ||
        formatTeamsLabel(item).toLowerCase().includes(q)
    );
  }, [topics, query]);

  const visibleTopics = useMemo(() => {
    if (query.trim().length > 0 || expanded) {
      return filteredTopics;
    }
    return filteredTopics.slice(0, INITIAL_VISIBLE_COUNT);
  }, [filteredTopics, expanded, query]);

  const isScrollable = expanded || (hasLongList && query.trim().length > 0);

  return (
    <section
      aria-label="Topics chosen so far"
      className="flex w-full flex-col gap-3.5"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-[#B15CFF]/35 bg-[#5227FF]/20 text-[#FF9FFC]">
            <BookOpen className="h-3.5 w-3.5" />
          </div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-white/80">
            Topics chosen so far
          </h2>
        </div>

        <div aria-live="polite" className="flex items-center gap-2">
          {loading ? (
            <div className="h-5 w-28 animate-pulse rounded-full bg-white/10" />
          ) : (
            <span className="inline-flex items-center rounded-full border border-[#B15CFF]/30 bg-[#5227FF]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#FF9FFC]">
              {topics.length} {topics.length === 1 ? "topic" : "topics"} chosen
            </span>
          )}
        </div>
      </div>

      {/* Search Box when > 8 topics */}
      {!loading && hasLongList && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chosen topics…"
            aria-label="Search chosen topics"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pr-3 pl-9 text-xs text-white placeholder-white/40 outline-none transition focus:border-[#FF9FFC]/50 focus:bg-white/10"
          />
        </div>
      )}

      {/* Body: Skeleton / Empty / List */}
      <div aria-live="polite">
        {loading ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="flex h-11 items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3.5"
              >
                <div className="h-3.5 w-32 animate-pulse rounded bg-white/15" />
                <div className="h-4 w-16 animate-pulse rounded-full bg-white/10" />
              </div>
            ))}
          </div>
        ) : topics.length === 0 ? (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center">
            <p className="text-xs font-medium text-white/55">No topics chosen yet</p>
          </div>
        ) : filteredTopics.length === 0 ? (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-center">
            <p className="text-xs font-medium text-white/55">
              No chosen topics match &ldquo;{query}&rdquo;
            </p>
          </div>
        ) : (
          <ul
            className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${
              isScrollable ? "max-h-72 overflow-y-auto pr-1" : ""
            }`}
          >
            <AnimatePresence initial={false}>
              {visibleTopics.map((item) => {
                const key = item.topic.toLowerCase();
                const isHighlighted = highlightedKeys.has(key);
                const teamLabel = formatTeamsLabel(item);

                const baseClasses = `group relative flex w-full items-center justify-between gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-all duration-300 ${
                  isHighlighted
                    ? "border-[#FF9FFC]/65 bg-[#5227FF]/25 shadow-[0_0_20px_-5px_rgba(255,159,252,0.55)]"
                    : allowTopicRepeat
                    ? "cursor-pointer border-white/10 bg-white/[0.04] hover:border-[#FF9FFC]/40 hover:bg-white/[0.08]"
                    : "cursor-default border-white/10 bg-white/[0.04]"
                }`;

                const innerContent = (
                  <>
                    <span className="min-w-0 flex-1 break-words text-xs font-semibold text-white/95 sm:text-[13px]">
                      {item.topic}
                    </span>

                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-full border border-[#B15CFF]/35 bg-[#5227FF]/20 px-2.5 py-0.5 text-[10px] font-semibold text-[#FF9FFC]">
                        {teamLabel}
                      </span>

                      {!allowTopicRepeat && (
                        <span className="rounded-full border border-amber-400/35 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                          Taken
                        </span>
                      )}
                    </span>
                  </>
                );

                return (
                  <motion.li
                    key={key}
                    layout={!prefersReducedMotion}
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={prefersReducedMotion ? {} : { opacity: 0, y: -6 }}
                    transition={{ duration: 0.22 }}
                  >
                    {allowTopicRepeat ? (
                      <button
                        type="button"
                        onClick={() => onSelectTopic?.(item.topic)}
                        title="Click to fill this topic"
                        className={baseClasses}
                      >
                        {innerContent}
                      </button>
                    ) : (
                      <div className={baseClasses}>{innerContent}</div>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {/* Show all / Show less toggle */}
      {!loading && hasLongList && query.trim().length === 0 && (
        <div className="flex justify-center pt-0.5">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-white/75 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            {expanded ? (
              <>
                Show less
                <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                Show all ({topics.length})
                <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      )}
    </section>
  );
}

