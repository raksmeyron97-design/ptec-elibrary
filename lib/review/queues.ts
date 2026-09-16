// lib/review/queues.ts
//
// Which queue a review item belongs to — pure, so the page that slices and the
// client that draws the tab bar read one definition rather than two.
//
// These are VIEWS over the two queues app/actions/review.ts already fetches,
// not new queries and not new state. "My queue" is not a status a book can be
// in; it is a question asked of the same rows. Making it a fetch would give the
// reviewer a second source of truth about their backlog, and the two would
// disagree the moment an assignment changed between requests.

import type { CanonicalStatus } from "@/lib/content-status";

export const REVIEW_QUEUE_TABS = [
  "pending",
  "mine",
  "unassigned",
  "changes",
  "unverifiedLive",
] as const;

export type QueueTab = (typeof REVIEW_QUEUE_TABS)[number];

/** The fields a queue membership question actually reads. */
export type QueueCandidate = {
  status: CanonicalStatus;
  assignedReviewer: { id: string } | null;
  verifiedAt: string | null;
};

/**
 * Statuses where somebody is waiting on a reviewer.
 *
 * `changes_requested` is deliberately NOT here: the ball is in the editor's
 * court, which is why it gets a tab of its own rather than inflating the
 * backlog number the sidebar badge shows.
 */
export const ACTIONABLE_STATUSES: readonly CanonicalStatus[] = [
  "imported",
  "needs_review",
  "in_review",
];

export function isActionable(item: QueueCandidate): boolean {
  return ACTIONABLE_STATUSES.includes(item.status);
}

/**
 * URL param ⇄ tab. `pending` is the default and carries no param, so the
 * queue's own URL stays `/admin/review`.
 *
 * `unverified` keeps its historical spelling: it is the param the sidebar, the
 * KPI tiles and every existing bookmark already point at, and renaming it to
 * match the internal key would break links for no reader-visible gain.
 */
const PARAM_BY_TAB: Record<QueueTab, string | undefined> = {
  pending: undefined,
  mine: "mine",
  unassigned: "unassigned",
  changes: "changes",
  unverifiedLive: "unverified",
};

const TAB_BY_PARAM = new Map<string, QueueTab>(
  (Object.entries(PARAM_BY_TAB) as [QueueTab, string | undefined][])
    .filter(([, param]) => param !== undefined)
    .map(([tab, param]) => [param as string, tab]),
);

export function queueTabParam(tab: QueueTab): string | undefined {
  return PARAM_BY_TAB[tab];
}

export function parseQueueTab(raw: string | undefined | null): QueueTab | null {
  if (!raw) return null;
  if (raw === "pending") return "pending";
  return TAB_BY_PARAM.get(raw) ?? null;
}

/** Every tab except `unverifiedLive` is a view over the pending queue. */
export function isPendingView(tab: QueueTab): boolean {
  return tab !== "unverifiedLive";
}

/**
 * The membership rule for each tab, over the pending queue.
 *
 * `unverifiedLive` is absent on purpose — it is a different FETCH (published
 * rows with no verification stamp), not a filter over this one, and folding it
 * in here would invite someone to compute it from the wrong set.
 */
export function selectPendingView<T extends QueueCandidate>(
  tab: QueueTab,
  pending: readonly T[],
  viewerId: string,
): T[] {
  switch (tab) {
    case "mine":
      return pending.filter((i) => i.assignedReviewer?.id === viewerId);
    case "unassigned":
      // Only the ones somebody is actually waiting on. An unassigned record
      // sitting at `changes_requested` is not unclaimed work — its editor has
      // it — and listing it here is how "Unassigned" stops meaning anything.
      return pending.filter((i) => !i.assignedReviewer && isActionable(i));
    case "changes":
      return pending.filter((i) => i.status === "changes_requested");
    default:
      return [...pending];
  }
}

/**
 * Does this item still belong in the view the reviewer is looking at?
 *
 * The optimistic list uses it after a transition: requesting changes on a
 * record moves it out of "Unassigned" (the ball is now with the editor) but
 * leaves it in "All". Asking the same selector that built the list is what
 * stops the two from drifting into different ideas of the same tab.
 */
export function belongsToPendingView<T extends QueueCandidate>(
  tab: QueueTab,
  item: T,
  viewerId: string,
): boolean {
  return selectPendingView(tab, [item], viewerId).length === 1;
}

/** Counts for the tab bar, computed over the whole queues — never a page slice. */
export function queueCounts<T extends QueueCandidate>(
  pending: readonly T[],
  unverifiedLive: readonly T[],
  viewerId: string,
): Record<QueueTab, number> {
  return {
    pending: pending.length,
    mine: selectPendingView("mine", pending, viewerId).length,
    unassigned: selectPendingView("unassigned", pending, viewerId).length,
    changes: selectPendingView("changes", pending, viewerId).length,
    unverifiedLive: unverifiedLive.length,
  };
}

/**
 * Which tab to open when the URL names none.
 *
 * The reviewer's own work first — that is what they came for — then whatever
 * is waiting, and only then the queue nobody knows about. A reviewer with an
 * empty personal queue should not land on an empty page while ten records sit
 * unassigned.
 */
export function defaultQueueTab(counts: Record<QueueTab, number>): QueueTab {
  if (counts.mine > 0) return "mine";
  if (counts.pending > 0) return "pending";
  if (counts.unverifiedLive > 0) return "unverifiedLive";
  return "pending";
}

/**
 * Is somebody else already working on this?
 *
 * Derived, not stored. `in_review` means a reviewer pressed "Start review",
 * and `assigned_reviewer` says who — so the pair is already an honest claim
 * signal, and it needs no lock table, no heartbeat and no migration. It is
 * advisory by design: the answer is a banner and a "Take over" button (which
 * is an ordinary, audited reassignment), never a refusal. A hard lock on a
 * two-librarian team strands records behind whoever forgot to release one.
 */
export function claimedByAnother<T extends QueueCandidate>(
  item: T,
  viewerId: string,
): NonNullable<T["assignedReviewer"]> | null {
  if (item.status !== "in_review") return null;
  const reviewer = item.assignedReviewer;
  if (!reviewer || reviewer.id === viewerId) return null;
  return reviewer as NonNullable<T["assignedReviewer"]>;
}
