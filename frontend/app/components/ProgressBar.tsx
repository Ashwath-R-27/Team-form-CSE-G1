interface ProgressBarProps {
  current: number;
  total: number;
  label?: string;
}

/**
 * ProgressBar
 * Shows e.g. "12/87 (14%)" with a gradient fill matching the GradientWaves
 * palette. The fill animates in on mount/update via a CSS transition, kept
 * as the single motion moment rather than a continuous shimmer.
 */
export default function ProgressBar({ current, total, label = "Students who've joined a team" }: ProgressBarProps) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-white/80">{label}</span>
        <span className="text-sm font-bold text-white">
          {current}/{total} <span className="font-normal text-white/40">({pct}%)</span>
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#5227FF] via-[#B15CFF] to-[#FF9FFC] shadow-[0_0_12px_rgba(255,159,252,0.6)] transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}