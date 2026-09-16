/**
 * The queue views, and the promise that they are views.
 *
 * "My queue" answers a question about rows the page has already fetched. If it
 * ever became a second query, a reviewer's personal backlog and the shared one
 * could disagree about the same record — which is the whole reason these
 * predicates are pure and live here.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ACTIONABLE_STATUSES,
  REVIEW_QUEUE_TABS,
  belongsToPendingView,
  claimedByAnother,
  defaultQueueTab,
  isActionable,
  isPendingView,
  parseQueueTab,
  queueCounts,
  queueTabParam,
  selectPendingView,
  type QueueCandidate,
} from "./queues";

const ME = "11111111-1111-1111-1111-111111111111";
const DARA = "22222222-2222-2222-2222-222222222222";

type Item = QueueCandidate & { id: string };

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id,
  status: "needs_review",
  assignedReviewer: null,
  verifiedAt: null,
  ...over,
});

const pending: Item[] = [
  item("mine-in-review", { status: "in_review", assignedReviewer: { id: ME } }),
  item("mine-needs-review", { assignedReviewer: { id: ME } }),
  item("daras", { status: "in_review", assignedReviewer: { id: DARA } }),
  item("unclaimed"),
  item("unclaimed-imported", { status: "imported" }),
  item("sent-back", { status: "changes_requested" }),
  item("sent-back-unassigned", { status: "changes_requested" }),
  item("verified-waiting", { status: "verified" }),
];

describe("tab ⇄ URL param", () => {
  it("the default tab carries no param, so the queue's own URL stays clean", () => {
    expect(queueTabParam("pending")).toBeUndefined();
  });

  it("round-trips every tab that has a param", () => {
    for (const tab of REVIEW_QUEUE_TABS) {
      const param = queueTabParam(tab);
      if (param === undefined) continue;
      expect(parseQueueTab(param), param).toBe(tab);
    }
  });

  it("keeps the historical `unverified` spelling that existing links point at", () => {
    expect(queueTabParam("unverifiedLive")).toBe("unverified");
    expect(parseQueueTab("unverified")).toBe("unverifiedLive");
  });

  it("still accepts an explicit ?tab=pending", () => {
    expect(parseQueueTab("pending")).toBe("pending");
  });

  it("answers null for an unknown or absent param rather than guessing", () => {
    expect(parseQueueTab("nonsense")).toBeNull();
    expect(parseQueueTab(undefined)).toBeNull();
    expect(parseQueueTab("")).toBeNull();
  });

  it("every tab except the unverified-live queue is a view over the pending rows", () => {
    for (const tab of REVIEW_QUEUE_TABS) {
      expect(isPendingView(tab)).toBe(tab !== "unverifiedLive");
    }
  });
});

describe("what each view contains", () => {
  it("`pending` is everything, unchanged from before the views existed", () => {
    expect(selectPendingView("pending", pending, ME)).toHaveLength(pending.length);
  });

  it("`mine` is exactly what is assigned to the viewer", () => {
    expect(selectPendingView("mine", pending, ME).map((i) => i.id)).toEqual([
      "mine-in-review",
      "mine-needs-review",
    ]);
  });

  it("`mine` is per viewer — Dara sees Dara's", () => {
    expect(selectPendingView("mine", pending, DARA).map((i) => i.id)).toEqual(["daras"]);
  });

  it("`unassigned` is unclaimed work somebody is waiting on, not every unassigned row", () => {
    const ids = selectPendingView("unassigned", pending, ME).map((i) => i.id);
    expect(ids).toEqual(["unclaimed", "unclaimed-imported"]);
    // The ball is with the editor on these two, so they are not unclaimed work.
    expect(ids).not.toContain("sent-back-unassigned");
    // And `verified` is waiting on a publish decision, not on a reviewer.
    expect(ids).not.toContain("verified-waiting");
  });

  it("`changes` is everything sent back, whoever it is assigned to", () => {
    expect(selectPendingView("changes", pending, ME).map((i) => i.id)).toEqual([
      "sent-back",
      "sent-back-unassigned",
    ]);
  });

  it("changes_requested is deliberately not 'actionable' — the editor has it", () => {
    expect(ACTIONABLE_STATUSES).not.toContain("changes_requested");
    expect(isActionable(item("x", { status: "changes_requested" }))).toBe(false);
    expect(isActionable(item("x", { status: "in_review" }))).toBe(true);
  });

  it("never mutates the array it was given", () => {
    const before = [...pending];
    selectPendingView("mine", pending, ME);
    selectPendingView("pending", pending, ME);
    expect(pending).toEqual(before);
  });
});

describe("counts", () => {
  const counts = queueCounts(pending, [item("live-unverified", { status: "published" })], ME);

  it("counts every tab over the whole queue, never a page slice", () => {
    expect(counts.pending).toBe(8);
    expect(counts.mine).toBe(2);
    expect(counts.unassigned).toBe(2);
    expect(counts.changes).toBe(2);
    expect(counts.unverifiedLive).toBe(1);
  });

  it("covers every tab the bar renders", () => {
    for (const tab of REVIEW_QUEUE_TABS) expect(counts[tab]).toBeTypeOf("number");
  });
});

describe("which tab opens when the URL names none", () => {
  const empty = { pending: 0, mine: 0, unassigned: 0, changes: 0, unverifiedLive: 0 };

  it("the reviewer's own work first — that is what they came for", () => {
    expect(defaultQueueTab({ ...empty, pending: 5, mine: 2 })).toBe("mine");
  });

  it("then the shared backlog, so an empty personal queue is not an empty page", () => {
    expect(defaultQueueTab({ ...empty, pending: 5 })).toBe("pending");
  });

  it("then the queue nobody knows about", () => {
    expect(defaultQueueTab({ ...empty, unverifiedLive: 3 })).toBe("unverifiedLive");
  });

  it("and `pending` when there is no work at all", () => {
    expect(defaultQueueTab(empty)).toBe("pending");
  });
});

describe("the concurrency signal is advisory and derived", () => {
  it("names the other reviewer when they have started", () => {
    expect(claimedByAnother(item("x", { status: "in_review", assignedReviewer: { id: DARA } }), ME)).toEqual({
      id: DARA,
    });
  });

  it("says nothing about your own record", () => {
    expect(claimedByAnother(item("x", { status: "in_review", assignedReviewer: { id: ME } }), ME)).toBeNull();
  });

  it("says nothing about an assignment nobody has started", () => {
    expect(claimedByAnother(item("x", { status: "needs_review", assignedReviewer: { id: DARA } }), ME)).toBeNull();
  });

  it("says nothing when there is no reviewer at all", () => {
    expect(claimedByAnother(item("x", { status: "in_review" }), ME)).toBeNull();
  });

  it("is derived from existing columns — the module is pure, so it cannot read a lock table", () => {
    const source = readFileSync(join(process.cwd(), "lib/review/queues.ts"), "utf8");
    // A type import and nothing else: no client, no `server-only`, no fetch.
    const imports = [...source.matchAll(/^import .*$/gm)].map((m) => m[0]);
    expect(imports).toEqual(['import type { CanonicalStatus } from "@/lib/content-status";']);
  });

  it("adds no schema of its own — the signal comes from 0086's columns", () => {
    const migrations = readFileSync(
      join(process.cwd(), "supabase/migrations/0086_metadata_verification.sql"),
      "utf8",
    );
    expect(migrations).toContain("assigned_reviewer");
  });

  it("take-over reuses the audited assignment action rather than a new mutation", () => {
    const actions = readFileSync(join(process.cwd(), "app/actions/review.ts"), "utf8");
    const claim = actions.slice(actions.indexOf("export async function claimReviewItem"));
    expect(claim).toContain("review.assign");
    expect(claim).toContain("assignReviewer(");
    // No second write path to assigned_reviewer.
    expect(claim).not.toContain('.from("books")');
  });
});

describe("optimistic removal asks the same selector that built the list", () => {
  it("a record sent back leaves Unassigned but stays in All", () => {
    const sentBack = item("x", { status: "changes_requested" });
    expect(belongsToPendingView("unassigned", sentBack, ME)).toBe(false);
    expect(belongsToPendingView("pending", sentBack, ME)).toBe(true);
  });

  it("a record assigned to you stays in My queue through a status change", () => {
    const mine = item("x", { status: "in_review", assignedReviewer: { id: ME } });
    expect(belongsToPendingView("mine", mine, ME)).toBe(true);
  });
});

describe("the page and the client read one definition", () => {
  const page = readFileSync(join(process.cwd(), "app/(admin)/admin/(protected)/review/page.tsx"), "utf8");
  const client = readFileSync(
    join(process.cwd(), "app/(admin)/admin/(protected)/review/_components/ReviewQueueClient.tsx"),
    "utf8",
  );

  it("the page slices through selectPendingView, not a private predicate", () => {
    expect(page).toContain("selectPendingView");
    expect(page).toContain("queueCounts");
  });

  it("the queue state stays in the URL — tab, status, page and size", () => {
    for (const param of ["tab", "status", "page", "size"]) {
      expect(page, param).toContain(`sp.${param}`);
    }
  });

  it("the client builds its links from queueTabParam rather than hard-coded strings", () => {
    expect(client).toContain("queueTabParam");
    expect(client).not.toMatch(/params\.set\("tab", "unverified"\)/);
  });

  it("neither side runs a query for a view", () => {
    expect(client).not.toContain('.from("');
  });
});
