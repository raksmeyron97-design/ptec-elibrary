import { Eye, Download } from "lucide-react";

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n || 0);
}

/**
 * Only Views and Downloads are real, tracked metrics (research_reports and
 * publications alike). Citation count / bookmark count / share count aren't
 * recorded anywhere in either schema, so they're intentionally left out
 * rather than shown as fake 0s.
 */
export default function MetricsPanel({
  views,
  downloads,
  labels,
}: {
  views: number;
  downloads: number;
  labels?: { views?: string; downloads?: string };
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center shadow-sm transition-transform duration-150 hover:-translate-y-0.5 dark:border-emerald-800/30 dark:bg-emerald-950/20">
        <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
          <Eye className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
        </div>
        <div className="text-[20px] font-bold tabular-nums text-emerald-800 dark:text-emerald-300">
          {formatCount(views)}
        </div>
        <div className="text-[11px] uppercase tracking-wider text-emerald-600 dark:text-emerald-500">
          {labels?.views ?? "Views"}
        </div>
      </div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center shadow-sm transition-transform duration-150 hover:-translate-y-0.5 dark:border-amber-800/30 dark:bg-amber-950/20">
        <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <Download className="h-4 w-4 text-amber-700 dark:text-amber-400" />
        </div>
        <div className="text-[20px] font-bold tabular-nums text-amber-800 dark:text-amber-300">
          {formatCount(downloads)}
        </div>
        <div className="text-[11px] uppercase tracking-wider text-amber-600 dark:text-amber-500">
          {labels?.downloads ?? "Downloads"}
        </div>
      </div>
    </div>
  );
}
