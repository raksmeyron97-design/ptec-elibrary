import { Eye, Download } from "lucide-react";

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/**
 * Views and downloads for a detail-page sidebar (theses and publications).
 *
 * Only Views and Downloads are real, tracked metrics in either schema.
 * Citation count / bookmark count / share count aren't recorded anywhere, so
 * they're intentionally absent rather than shown as fake 0s.
 *
 * A zero is likewise omitted, not printed: on a scholarly record "0 Views"
 * reads as a broken counter, and it contradicted the masthead strip whenever
 * the two blocks derived their numbers separately. Callers pass values already
 * derived from one source — null means "suppressed", and an all-null panel
 * renders nothing.
 *
 * Each figure is announced once, fully labelled ("79 views"), via an sr-only
 * phrase; the compact digits and the caption are hidden from assistive tech.
 */
export default function MetricsPanel({
  views,
  downloads,
  labels,
}: {
  views: number | null;
  downloads: number | null;
  labels?: { views?: string; downloads?: string; srViews?: string; srDownloads?: string };
}) {
  const cells: {
    key: string;
    icon: typeof Eye;
    value: number;
    caption: string;
    srLabel: string;
    tone: string;
  }[] = [];

  if (views !== null) {
    cells.push({
      key: "views",
      icon: Eye,
      value: views,
      caption: labels?.views ?? "Views",
      srLabel: labels?.srViews ?? `${views} views`,
      tone: "emerald",
    });
  }
  if (downloads !== null) {
    cells.push({
      key: "downloads",
      icon: Download,
      value: downloads,
      caption: labels?.downloads ?? "Downloads",
      srLabel: labels?.srDownloads ?? `${downloads} downloads`,
      tone: "amber",
    });
  }

  if (cells.length === 0) return null;

  const TONES: Record<string, { box: string; chip: string; icon: string; num: string; cap: string }> = {
    emerald: {
      box: "border-emerald-200 bg-emerald-50 dark:border-emerald-800/30 dark:bg-emerald-950/20",
      chip: "bg-emerald-100 dark:bg-emerald-900/30",
      icon: "text-emerald-700 dark:text-emerald-400",
      num: "text-emerald-800 dark:text-emerald-300",
      cap: "text-emerald-700 dark:text-emerald-500",
    },
    amber: {
      box: "border-amber-200 bg-amber-50 dark:border-amber-800/30 dark:bg-amber-950/20",
      chip: "bg-amber-100 dark:bg-amber-900/30",
      icon: "text-amber-700 dark:text-amber-400",
      num: "text-amber-800 dark:text-amber-300",
      cap: "text-amber-700 dark:text-amber-500",
    },
  };

  return (
    <div className={`grid gap-3 ${cells.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
      {cells.map((c) => {
        const tone = TONES[c.tone];
        return (
          <div
            key={c.key}
            className={`rounded-2xl border p-4 text-center shadow-sm transition-transform duration-150 hover:-translate-y-0.5 ${tone.box}`}
          >
            <div
              aria-hidden="true"
              className={`mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full ${tone.chip}`}
            >
              <c.icon className={`h-4 w-4 ${tone.icon}`} />
            </div>
            <div aria-hidden="true" className={`text-[20px] font-bold tabular-nums ${tone.num}`}>
              {compact(c.value)}
            </div>
            <div aria-hidden="true" className={`text-[11px] uppercase tracking-wider ${tone.cap}`}>
              {c.caption}
            </div>
            <span className="sr-only">{c.srLabel}</span>
          </div>
        );
      })}
    </div>
  );
}
