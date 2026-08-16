"use client";

// components/ui/home/GoalPathProgress.tsx
// Per-learner progress bar for the homepage goal cards.
//
// A client island on purpose. The homepage is prerendered (revalidate = 60) and
// NOTHING in that tree may read cookies()/headers() — resolving the viewer
// server-side is exactly what used to make the whole route render per request.
// So the card ships from the server with its static meta (modules, duration),
// and this fills in the learner's own progress after hydration. Signed-out
// visitors get [] from the action and render nothing at all.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getMyPathProgress, type PathProgressRecord } from "@/app/actions/learning-paths";
import { progressPercent } from "@/lib/learning-paths/format";

// One request per page, shared by every card that mounts. Six goal cards each
// calling the action independently would be six identical round-trips for a
// payload that is already "all of my progress in one call". The short TTL keeps
// the bar honest across client-side navigations (finish a step, come back) at
// the cost of one refetch.
const TTL_MS = 30_000;
let cached: { at: number; request: Promise<PathProgressRecord[]> } | null = null;

function loadProgress(): Promise<PathProgressRecord[]> {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    cached = { at: Date.now(), request: getMyPathProgress().catch(() => []) };
  }
  return cached.request;
}

export default function GoalPathProgress({ slug }: { slug: string }) {
  const t = useTranslations("paths");
  const [record, setRecord] = useState<PathProgressRecord | null>(null);

  useEffect(() => {
    let alive = true;
    loadProgress().then((records) => {
      if (alive) setRecord(records.find((r) => r.slug === slug) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [slug]);

  // Not loaded, signed out, or not enrolled — the card is complete without this,
  // so there is no skeleton to reserve space for.
  if (!record || record.totalSteps === 0) return null;

  const pct = progressPercent(record.completedSteps, record.totalSteps);
  const label = t("progressComplete", {
    completed: record.completedSteps,
    total: record.totalSteps,
  });

  return (
    <span className="mt-2.5 block">
      {/* role="progressbar" carries the value for assistive tech; the same
          numbers are visible as text below, so the bar itself is aria-hidden
          decoration rather than a second announcement. */}
      <span
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${t("yourProgress")}: ${label}`}
        className="block h-1.5 w-full overflow-hidden rounded-full bg-divider"
      >
        <span
          aria-hidden
          className="block h-full rounded-full bg-brand transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span aria-hidden className="mt-1 block text-[11.5px] font-semibold text-brand">
        {label}
      </span>
    </span>
  );
}
