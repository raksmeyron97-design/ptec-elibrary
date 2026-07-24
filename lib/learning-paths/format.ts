// Pure, dependency-free formatters + derivations for Learning Paths, shared by
// the public catalogue, the path detail page, and the admin table. Kept free of
// React and Supabase so the logic is unit-testable — see format.test.ts.

import type { LearningPathStatus, PathProgressRecord } from "@/app/actions/learning-paths";

/**
 * Human duration from a minute total. Returns null for null/0 so callers can
 * hide the field rather than render "0 min". Locale-aware unit words are the
 * caller's job (pass already-translated unit labels); this returns the numeric
 * shape only, e.g. { hours: 1, minutes: 30 }.
 */
export function splitDuration(totalMinutes: number | null | undefined): { hours: number; minutes: number } | null {
  if (!totalMinutes || totalMinutes <= 0 || !Number.isFinite(totalMinutes)) return null;
  const mins = Math.round(totalMinutes);
  return { hours: Math.floor(mins / 60), minutes: mins % 60 };
}

/** Completion state for a card/detail CTA, derived from a progress record. */
export type ProgressState = "not-started" | "in-progress" | "completed";

export function progressState(p: Pick<PathProgressRecord, "completedSteps" | "totalSteps" | "completedAt"> | null | undefined): ProgressState {
  if (!p || p.totalSteps === 0) return "not-started";
  if (p.completedAt || p.completedSteps >= p.totalSteps) return "completed";
  if (p.completedSteps > 0) return "in-progress";
  return "not-started";
}

/** Percent complete (0–100, integer). */
export function progressPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

/** Ordering weight so 'draft'/'scheduled' sort before/around 'published' predictably in admin. */
export const STATUS_ORDER: Record<LearningPathStatus, number> = {
  scheduled: 0,
  draft: 1,
  published: 2,
  archived: 3,
};
