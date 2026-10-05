import { describe, expect, it } from "vitest";
import {
  CLAIM_LEASE_MS,
  changedSinceVerified,
  claimState,
  compareShelf,
  fingerprintInput,
  matchesReviewQuery,
  parseReviewQuery,
  planReviewTransition,
  queuePosition,
  reviewCounts,
  reviewQueueOf,
  reviewQueryString,
  reviewRecordHref,
  sortQueue,
  type QueueItem,
  type ReviewQuery,
  type ReviewRow,
} from "./review";
import { KOHA_ITEM_TYPE_FOREIGN, KOHA_ITEM_TYPE_KHMER, kohaItemTypeFor } from "@/lib/koha/item-types";
import { CATALOG_LANGUAGES } from "@/lib/catalog-import";

const NOW = new Date("2026-10-05T08:00:00Z");
const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const FP = "a".repeat(64);

const row = (over: Partial<ReviewRow> = {}): ReviewRow => ({
  status: "needs_review",
  assignedTo: null,
  claimedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  verifiedFingerprint: null,
  blockedReason: null,
  blockedNote: null,
  waivedTasks: [],
  version: 1,
  ...over,
});
const heldBy = (who: string, minutesAgo = 5) =>
  row({ status: "in_review", assignedTo: who, claimedAt: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString() });

let seq = 0;
const item = (language: string | null, callNumber: string | null, review: ReviewRow | null = null, id?: string): QueueItem => ({
  id: id ?? `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
  title: `Book ${seq}`,
  author: null,
  language,
  callNumber,
  isActive: true,
  review,
  tasks: [],
});

const q = (over: Partial<ReviewQuery> = {}): ReviewQuery => ({ language: "km", status: "open", assignee: "any", sort: "shelf", task: null, ...over });

describe("language queues follow the record's stored language and Koha's BK/BKEN split", () => {
  it("km is the Khmer queue; every other stated language is English & other languages", () => {
    expect(reviewQueueOf("km")).toBe("km");
    for (const lang of ["en", "fr", "zh", "other"]) expect(reviewQueueOf(lang)).toBe("en");
  });

  it("a record with no language is in neither queue (never silently Khmer)", () => {
    expect(reviewQueueOf(null)).toBeNull();
    expect(reviewQueueOf("")).toBeNull();
    expect(reviewQueueOf("   ")).toBeNull();
  });

  it("a value that is not a catalogue language code is in neither queue — never guessed", () => {
    // "Khmer" by the BK/BKEN rule alone would land in the English queue.
    for (const v of ["Khmer", "English", "KM", "khm", "eng", "ខ្មែរ"]) expect(reviewQueueOf(v), v).toBeNull();
  });

  it("for every catalogue language, the Khmer queue is exactly the records Koha types BK", () => {
    for (const lang of CATALOG_LANGUAGES) {
      const queue = reviewQueueOf(lang);
      expect(queue === "km", lang).toBe(kohaItemTypeFor(lang) === KOHA_ITEM_TYPE_KHMER);
      expect(queue === "en", lang).toBe(kohaItemTypeFor(lang) === KOHA_ITEM_TYPE_FOREIGN);
    }
  });

  it("the BK/BKEN mapping itself is unchanged", () => {
    expect(kohaItemTypeFor("km")).toBe("BK");
    expect(kohaItemTypeFor("en")).toBe("BKEN");
  });

  it("the queue is never inferred from the title", () => {
    // A Latin title on a Khmer record stays in the Khmer queue, and the reverse.
    expect(matchesReviewQuery({ language: "km", review: null }, q({ language: "km" }), ME, NOW)).toBe(true);
    expect(matchesReviewQuery({ language: "en", review: null }, q({ language: "km" }), ME, NOW)).toBe(false);
  });
});

describe("the URL carries the whole review context", () => {
  it("round-trips language, status, assignee and order", () => {
    const query = q({ language: "en", status: "verified", assignee: "me" });
    const back = parseReviewQuery(new URLSearchParams(reviewQueryString(query)));
    expect(back).toEqual(query);
  });

  it("keeps the language in every record link, so refresh and back/forward stay in the queue", () => {
    expect(reviewRecordHref("abc", q({ language: "km" }))).toBe("/admin/catalogs/review/abc?language=km");
    expect(reviewRecordHref("abc", q({ language: "en", status: "blocked" }))).toBe("/admin/catalogs/review/abc?language=en&status=blocked");
  });

  it("an unknown value falls back to the default, never to 'everything'", () => {
    const parsed = parseReviewQuery({ language: "fr", status: "bogus", assignee: "x", sort: "y" });
    expect(parsed).toEqual({ language: null, status: "open", assignee: "any", sort: "shelf", task: null });
  });

  it("reads the first value of a repeated parameter", () => {
    expect(parseReviewQuery({ language: ["en", "km"] }).language).toBe("en");
  });
});

describe("filters are always language-scoped", () => {
  const items = [
    item("km", "370 A"),
    item("en", "370 B"),
    item("km", "510 C", heldBy(ME)),
    item("en", "510 D", heldBy(OTHER)),
    item("km", "800 E", row({ status: "verified", reviewedBy: ME, verifiedFingerprint: FP })),
    item(null, "100 F"),
  ];

  it("Khmer queue returns only km records, under every status filter", () => {
    for (const status of ["open", "needs_review", "in_review", "verified", "blocked", "all"] as const) {
      const got = items.filter((i) => matchesReviewQuery(i, q({ language: "km", status }), ME, NOW));
      expect(got.every((i) => i.language === "km"), status).toBe(true);
    }
  });

  it("English queue returns only non-km records", () => {
    const got = items.filter((i) => matchesReviewQuery(i, q({ language: "en", status: "all" }), ME, NOW));
    expect(got.map((i) => i.language)).toEqual(["en", "en"]);
  });

  it("a query with no language matches nothing (no cross-language fallback)", () => {
    expect(items.some((i) => matchesReviewQuery(i, q({ language: null, status: "all" }), ME, NOW))).toBe(false);
  });

  it("assignee filters: mine, and not taken (a stale claim counts as not taken)", () => {
    const stale = item("km", "1", heldBy(OTHER, CLAIM_LEASE_MS / 60_000 + 1));
    const fresh = item("km", "2", heldBy(OTHER));
    const mine = item("km", "3", heldBy(ME));
    const free = item("km", "4");
    const pick = (assignee: ReviewQuery["assignee"]) =>
      [stale, fresh, mine, free].filter((i) => matchesReviewQuery(i, q({ assignee }), ME, NOW));
    expect(pick("me")).toEqual([mine]);
    expect(pick("unassigned")).toEqual([stale, free]);
  });
});

describe("shelf order and previous/next", () => {
  it("orders call numbers numerically, records without one last, and the id breaks ties", () => {
    const a = item("km", "85 X", null, "a");
    const b = item("km", "370 X", null, "b");
    const c = item("km", null, null, "c");
    const d = item("km", "370 X", null, "d");
    expect(sortQueue([c, d, b, a], "shelf").map((i) => i.id)).toEqual(["a", "b", "d", "c"]);
  });

  it("Previous/Next stay inside the language even when the other language interleaves on the shelf", () => {
    const k1 = item("km", "100", null, "k1");
    const e1 = item("en", "150", null, "e1");
    const k2 = item("km", "200", null, "k2");
    const e2 = item("en", "250", null, "e2");
    const k3 = item("km", "300", null, "k3");
    const sorted = sortQueue([k1, e1, k2, e2, k3], "shelf");
    const at = queuePosition(sorted, k2, (i) => matchesReviewQuery(i, q({ language: "km" }), ME, NOW));
    expect(at).toEqual({ prevId: "k1", nextId: "k3", position: 2, total: 3 });
  });

  it("a record that just left the filter (verified) still has the right next record", () => {
    const k1 = item("km", "100", null, "k1");
    const k2 = item("km", "200", row({ status: "verified", verifiedFingerprint: FP }), "k2");
    const k3 = item("km", "300", null, "k3");
    const at = queuePosition([k1, k2, k3], k2, (i) => matchesReviewQuery(i, q(), ME, NOW));
    expect(at).toEqual({ prevId: "k1", nextId: "k3", position: null, total: 2 });
  });

  it("a record whose language just changed is placed by shelf order and never pulls the other queue in", () => {
    const k1 = item("km", "100", null, "k1");
    const k3 = item("km", "300", null, "k3");
    const moved = item("en", "200", null, "moved");
    const at = queuePosition([k1, moved, k3], moved, (i) => matchesReviewQuery(i, q({ language: "km" }), ME, NOW));
    expect(at.prevId).toBe("k1");
    expect(at.nextId).toBe("k3");
  });

  it("the first and last records have no previous/next", () => {
    const k1 = item("km", "100", null, "k1");
    const k2 = item("km", "200", null, "k2");
    const match = (i: QueueItem) => matchesReviewQuery(i, q(), ME, NOW);
    expect(queuePosition([k1, k2], k1, match).prevId).toBeNull();
    expect(queuePosition([k1, k2], k2, match).nextId).toBeNull();
  });

  it("compareShelf is a total order", () => {
    const xs = [item("km", "b"), item("km", "a"), item("km", null), item("km", "a")];
    for (const x of xs) {
      for (const y of xs) {
        // Antisymmetric, and equal only for the same record (the id breaks every tie).
        expect(Math.sign(compareShelf(x, y)) + Math.sign(compareShelf(y, x))).toBe(0);
        expect(compareShelf(x, y) === 0).toBe(x.id === y.id);
      }
    }
  });
});

describe("counts per queue", () => {
  it("counts a record with no row as needing review, and keeps no-language records apart", () => {
    const books = [
      { id: "1", language: "km" },
      { id: "2", language: "km" },
      { id: "3", language: "en" },
      { id: "4", language: "fr" },
      { id: "5", language: null },
    ];
    const rows = new Map<string, ReviewRow>([
      ["2", row({ status: "verified", verifiedFingerprint: FP })],
      ["4", row({ status: "blocked", blockedReason: "needs_koha" })],
    ]);
    expect(reviewCounts(books, rows)).toEqual({
      km: { total: 2, needsReview: 1, inReview: 0, verified: 1, blocked: 0 },
      en: { total: 2, needsReview: 1, inReview: 0, verified: 0, blocked: 1 },
      noLanguage: 1,
    });
  });
});

describe("claims", () => {
  it("names the holder, and lets a claim expire after the lease", () => {
    expect(claimState(null, ME, NOW)).toBe("none");
    expect(claimState(heldBy(ME), ME, NOW)).toBe("mine");
    expect(claimState(heldBy(OTHER), ME, NOW)).toBe("other");
    expect(claimState(heldBy(OTHER, CLAIM_LEASE_MS / 60_000 + 1), ME, NOW)).toBe("stale");
  });
});

describe("review transitions", () => {
  const plan = (action: Parameters<typeof planReviewTransition>[0]["action"], r: ReviewRow | null, extra: object = {}) =>
    planReviewTransition({ action, row: r, actorId: ME, now: NOW, ...extra });

  it("claim: an untouched record becomes mine", () => {
    const p = plan("claim", null);
    expect(p).toMatchObject({ ok: true, from: "needs_review", to: "in_review", patch: { assigned_to: ME } });
  });

  it("claim: refused while someone else holds a fresh claim — only take-over overrides it", () => {
    expect(plan("claim", heldBy(OTHER))).toEqual({ ok: false, reason: "held_by_other" });
    expect(plan("takeover", heldBy(OTHER))).toMatchObject({ ok: true, to: "in_review", previousHolder: OTHER });
  });

  it("claim: a stale claim may be taken, and the previous holder is recorded", () => {
    expect(plan("claim", heldBy(OTHER, 300))).toMatchObject({ ok: true, previousHolder: OTHER });
  });

  it("release: only the holder may give a record back", () => {
    expect(plan("release", heldBy(ME))).toMatchObject({ ok: true, to: "needs_review", patch: { assigned_to: null } });
    expect(plan("release", heldBy(OTHER))).toEqual({ ok: false, reason: "not_held" });
    expect(plan("release", null)).toEqual({ ok: false, reason: "not_held" });
  });

  it("verify: one step, by the librarian who checked it — no READY_TO_VERIFY state", () => {
    const p = plan("verify", heldBy(ME), { fingerprint: FP });
    expect(p).toMatchObject({ ok: true, from: "in_review", to: "verified", patch: { reviewed_by: ME, verified_fingerprint: FP, assigned_to: null } });
    expect(plan("verify", null, { fingerprint: FP })).toMatchObject({ ok: true, to: "verified" });
  });

  it("verify: refused over someone else's fresh claim, without a fingerprint, or twice", () => {
    expect(plan("verify", heldBy(OTHER), { fingerprint: FP })).toEqual({ ok: false, reason: "held_by_other" });
    expect(plan("verify", null, { fingerprint: "nope" })).toEqual({ ok: false, reason: "missing_fingerprint" });
    expect(plan("verify", row({ status: "verified" }), { fingerprint: FP })).toEqual({ ok: false, reason: "already" });
  });

  it("block needs a known reason, and a note for 'other'", () => {
    expect(plan("block", null, { block: { reason: "needs_koha" } })).toMatchObject({ ok: true, to: "blocked", patch: { blocked_reason: "needs_koha" } });
    expect(plan("block", null, { block: { reason: "made_up" } })).toEqual({ ok: false, reason: "bad_reason" });
    expect(plan("block", null, { block: { reason: "other", note: "   " } })).toEqual({ ok: false, reason: "bad_reason" });
    expect(plan("block", null, { block: { reason: "other", note: "x".repeat(900) } })).toMatchObject({ ok: true });
  });

  it("unblock and reopen return a record to the queue; nothing else does", () => {
    expect(plan("unblock", row({ status: "blocked", blockedReason: "other" }))).toMatchObject({ ok: true, to: "needs_review", patch: { blocked_reason: null } });
    expect(plan("reopen", row({ status: "verified", verifiedFingerprint: FP }))).toMatchObject({ ok: true, to: "needs_review", patch: { verified_fingerprint: null } });
    expect(plan("unblock", null)).toEqual({ ok: false, reason: "illegal" });
    expect(plan("reopen", null)).toEqual({ ok: false, reason: "illegal" });
    expect(plan("claim", row({ status: "verified" }))).toEqual({ ok: false, reason: "illegal" });
  });

  it("no transition ever touches publication: the patch has no is_active, and stays within the review columns", () => {
    const allowed = new Set(["status", "assigned_to", "claimed_at", "reviewed_by", "reviewed_at", "verified_fingerprint", "blocked_reason", "blocked_note"]);
    const plans = [
      plan("claim", null),
      plan("takeover", heldBy(OTHER)),
      plan("release", heldBy(ME)),
      plan("verify", null, { fingerprint: FP }),
      plan("block", null, { block: { reason: "needs_decision" } }),
      plan("unblock", row({ status: "blocked", blockedReason: "other" })),
      plan("reopen", row({ status: "verified" })),
    ];
    for (const p of plans) {
      expect(p.ok).toBe(true);
      if (p.ok) for (const k of Object.keys(p.patch)) expect(allowed.has(k), k).toBe(true);
    }
  });
});

describe("changed since verified", () => {
  const book = { title: "T", author: "A", isbn: null, publisher: null, year: 2020, language: "km", category: "C", ddc: "370", description: null, keywords: ["x"] };

  it("ignores whitespace and Unicode composition, and sees a real change", () => {
    const base = fingerprintInput(book);
    expect(fingerprintInput({ ...book, title: "  T  " })).toBe(base);
    expect(fingerprintInput({ ...book, year: "2020" })).toBe(base);
    expect(fingerprintInput({ ...book, publisher: "P" })).not.toBe(base);
    expect(fingerprintInput({ ...book, keywords: ["x", "y"] })).not.toBe(base);
  });

  it("is reported only for a verified record whose fingerprint no longer matches", () => {
    expect(changedSinceVerified(row({ status: "verified", verifiedFingerprint: FP }), FP)).toBe(false);
    expect(changedSinceVerified(row({ status: "verified", verifiedFingerprint: FP }), "b".repeat(64))).toBe(true);
    expect(changedSinceVerified(row({ status: "needs_review", verifiedFingerprint: FP }), "b".repeat(64))).toBe(false);
    expect(changedSinceVerified(null, FP)).toBe(false);
  });
});
