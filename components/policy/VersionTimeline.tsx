// components/policy/VersionTimeline.tsx
//
// Version history as a vertical timeline: a dot on a rail, a version badge, an
// effective date, and one line on what changed.
//
// Newest first, and the newest entry is the only one tinted — "which version
// am I reading" is the question this answers, and every row carrying brand
// colour answers nothing.
//
// Dates are `<time datetime>` with the ISO value, formatted for the viewer's
// locale. Version numbers and ISO dates come from lib/privacy/policy.ts; the
// summary line for each version is a message key, so a translated history
// never falls back to English.
//
// Server component.

import { getFormatter } from "next-intl/server";

export type VersionEntry = {
  version: string;
  /** ISO date. */
  date: string;
  /** One line on what changed in this version. */
  summary: string;
};

export default async function VersionTimeline({
  entries,
  labels,
  km,
}: {
  entries: readonly VersionEntry[];
  labels: { version: string; effective: string; current: string };
  km: boolean;
}) {
  const format = await getFormatter();
  const font = km ? "font-khmer-serif" : "";

  return (
    <ol className="mt-6 space-y-0">
      {entries.map(({ version, date, summary }, i) => {
        const current = i === 0;
        const last = i === entries.length - 1;
        return (
          <li key={version} className="relative flex gap-4 pb-6 last:pb-0">
            {/* The rail. Stops at the last dot rather than running past it —
                a line trailing below the oldest entry reads as "and more",
                which is the opposite of what a complete history means. */}
            {!last && (
              <span
                aria-hidden="true"
                className="absolute left-[7px] top-4 h-[calc(100%-0.5rem)] w-px bg-divider"
              />
            )}
            <span
              aria-hidden="true"
              className={`relative z-[1] mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2 ${
                current
                  ? "border-brand bg-brand"
                  : "border-divider bg-bg-surface"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${
                    current ? "bg-brand/10 text-brand" : "bg-bg-app text-text-muted"
                  }`}
                >
                  {labels.version} {version}
                </span>
                {current && (
                  <span className="text-[11.5px] font-semibold uppercase tracking-wide text-success">
                    {labels.current}
                  </span>
                )}
                <span className="text-[13px] text-text-muted">
                  {labels.effective}:{" "}
                  <time dateTime={date}>
                    {format.dateTime(new Date(date), {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                </span>
              </div>
              <p className={`policy-copy mt-1.5 text-[14px] text-text-body ${font}`}>
                {summary}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
