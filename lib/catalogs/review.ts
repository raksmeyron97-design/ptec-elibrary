/**
 * The Physical Library's librarian review — pure rules (docs/CATALOG-REVIEW.md).
 *
 * Everything that decides WHICH records a librarian sees, in WHAT order, and
 * WHAT a press of a button may do to a record's review state lives here, with
 * no database and no request, so the page, the server actions and the tests
 * read one definition.
 *
 * Three rules carry the design:
 *
 *   • The language queue is the record's STORED language, never a guess from
 *     its title, and it is the same split Koha lends by (lib/koha/item-types.ts):
 *     `km` is the Khmer queue (BK); every other stated language is the
 *     "English & other languages" queue (BKEN). A record with no language is in
 *     neither — it is counted on its own so it cannot vanish from both.
 *   • A record with no review row needs review. Every derived fact (a stale
 *     claim, "changed since verified") is computed here from stored ones.
 *   • Next / previous are computed over the ONE ordered list the page holds,
 *     inside one queue, relative to the current record's position — so a record
 *     that just left the filter (it was verified) still has a next, and no
 *     navigation can step into the other language.
 */

import { CATALOG_LANGUAGES } from "@/lib/catalog-import";

// ── Queues ────────────────────────────────────────────────────────────────────

export const REVIEW_QUEUES = ["km", "en"] as const;
export type ReviewQueue = (typeof REVIEW_QUEUES)[number];

/**
 * `km` → Khmer queue; any other catalogue language code (en, fr, zh, other) →
 * English & other languages; anything else → no queue.
 *
 * "Anything else" includes a value that is not a code at all ("Khmer",
 * "English" — present in hand-made local rows, absent from production on
 * 2026-10-05). It is not translated here: guessing would put "Khmer" in the
 * English queue by the BK/BKEN rule, or silently decide a language for the
 * librarian. It is counted as unrecognised, so someone fixes the record.
 */
export function reviewQueueOf(language: string | null | undefined): ReviewQueue | null {
  const code = (language ?? "").trim();
  if (!(CATALOG_LANGUAGES as readonly string[]).includes(code)) return null;
  return code === "km" ? "km" : "en";
}

export const isReviewQueue = (v: unknown): v is ReviewQueue =>
  typeof v === "string" && (REVIEW_QUEUES as readonly string[]).includes(v);

// ── Stored state ──────────────────────────────────────────────────────────────

export const REVIEW_STATUSES = ["needs_review", "in_review", "verified", "blocked"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const BLOCK_REASONS = ["book_not_found", "needs_koha", "needs_decision", "other"] as const;
export type BlockReason = (typeof BLOCK_REASONS)[number];
export const BLOCK_NOTE_MAX = 500;

/** A claim older than this is stale: anyone may take the record without taking it over. */
export const CLAIM_LEASE_MS = 4 * 60 * 60 * 1000;

/** One catalog_review_state row, as the app reads it. */
export type ReviewRow = {
  status: ReviewStatus;
  assignedTo: string | null;
  claimedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  verifiedFingerprint: string | null;
  blockedReason: BlockReason | null;
  blockedNote: string | null;
  version: number;
};

export type DbReviewRow = {
  book_id: string;
  status: string;
  assigned_to: string | null;
  claimed_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  verified_fingerprint: string | null;
  blocked_reason: string | null;
  blocked_note: string | null;
  version: number;
};

export const REVIEW_ROW_COLUMNS =
  "book_id, status, assigned_to, claimed_at, reviewed_by, reviewed_at, verified_fingerprint, blocked_reason, blocked_note, version";

export function reviewRowFromDb(r: DbReviewRow): ReviewRow {
  return {
    status: (REVIEW_STATUSES as readonly string[]).includes(r.status) ? (r.status as ReviewStatus) : "needs_review",
    assignedTo: r.assigned_to,
    claimedAt: r.claimed_at,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    verifiedFingerprint: r.verified_fingerprint,
    blockedReason: (BLOCK_REASONS as readonly string[]).includes(r.blocked_reason ?? "") ? (r.blocked_reason as BlockReason) : null,
    blockedNote: r.blocked_note,
    version: r.version,
  };
}

export const statusOf = (row: ReviewRow | null): ReviewStatus => row?.status ?? "needs_review";

export type ClaimState = "none" | "mine" | "other" | "stale";

/** Who holds the record, as the viewer should be told. */
export function claimState(row: ReviewRow | null, viewerId: string, now: Date): ClaimState {
  if (!row || row.status !== "in_review" || !row.assignedTo) return "none";
  if (row.assignedTo === viewerId) return "mine";
  const at = row.claimedAt ? Date.parse(row.claimedAt) : NaN;
  if (!Number.isFinite(at) || now.getTime() - at > CLAIM_LEASE_MS) return "stale";
  return "other";
}

// ── URL state ─────────────────────────────────────────────────────────────────

export const STATUS_FILTERS = ["open", "needs_review", "in_review", "verified", "blocked", "all"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const ASSIGNEE_FILTERS = ["any", "me", "unassigned"] as const;
export type AssigneeFilter = (typeof ASSIGNEE_FILTERS)[number];
/** Shelf order (call number) is the default so a librarian can work along a shelf. */
export const REVIEW_SORTS = ["shelf"] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

export type ReviewQuery = {
  language: ReviewQueue | null;
  status: StatusFilter;
  assignee: AssigneeFilter;
  sort: ReviewSort;
};

export const DEFAULT_REVIEW_QUERY: Omit<ReviewQuery, "language"> = { status: "open", assignee: "any", sort: "shelf" };

type SearchParamsLike = Record<string, string | string[] | undefined> | URLSearchParams;

function param(sp: SearchParamsLike, key: string): string | undefined {
  if (sp instanceof URLSearchParams) return sp.get(key) ?? undefined;
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function oneOf<T extends string>(values: readonly T[], raw: string | undefined, fallback: T): T {
  return raw && (values as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/** Read the review context from a URL. Anything unrecognised falls back to the default, never to "everything". */
export function parseReviewQuery(sp: SearchParamsLike): ReviewQuery {
  const lang = param(sp, "language");
  return {
    language: isReviewQueue(lang) ? lang : null,
    status: oneOf(STATUS_FILTERS, param(sp, "status"), DEFAULT_REVIEW_QUERY.status),
    assignee: oneOf(ASSIGNEE_FILTERS, param(sp, "assignee"), DEFAULT_REVIEW_QUERY.assignee),
    sort: oneOf(REVIEW_SORTS, param(sp, "sort"), DEFAULT_REVIEW_QUERY.sort),
  };
}

/** The query string for a review URL: the language always, the rest only when not the default. */
export function reviewQueryString(q: ReviewQuery): string {
  const out = new URLSearchParams();
  if (q.language) out.set("language", q.language);
  if (q.status !== DEFAULT_REVIEW_QUERY.status) out.set("status", q.status);
  if (q.assignee !== DEFAULT_REVIEW_QUERY.assignee) out.set("assignee", q.assignee);
  if (q.sort !== DEFAULT_REVIEW_QUERY.sort) out.set("sort", q.sort);
  return out.toString();
}

export const REVIEW_BASE_PATH = "/admin/catalogs/review";

export function reviewListHref(q: ReviewQuery): string {
  const qs = reviewQueryString(q);
  return qs ? `${REVIEW_BASE_PATH}?${qs}` : REVIEW_BASE_PATH;
}

export function reviewRecordHref(id: string, q: ReviewQuery): string {
  const qs = reviewQueryString(q);
  return `${REVIEW_BASE_PATH}/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`;
}

// ── The queue ─────────────────────────────────────────────────────────────────

export type QueueItem = {
  id: string;
  title: string;
  author: string | null;
  language: string | null;
  /** catalog_books.ddc — for a Koha record, the best copy's call number (lib/koha/projection.ts). */
  callNumber: string | null;
  isActive: boolean;
  review: ReviewRow | null;
};

/*
  Shelf order. A call number is "370.1 SOK" or "ប.ល គីម": the collator compares
  digit runs as numbers, so "85" sorts before "370", and a record with no call
  number goes last rather than first. The record id breaks every tie, so the
  order — and therefore next/previous — is total and stable between requests.
*/
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function compareShelf(a: Pick<QueueItem, "id" | "callNumber">, b: Pick<QueueItem, "id" | "callNumber">): number {
  const ac = (a.callNumber ?? "").trim();
  const bc = (b.callNumber ?? "").trim();
  if (ac && !bc) return -1;
  if (!ac && bc) return 1;
  const byCall = ac && bc ? collator.compare(ac, bc) : 0;
  if (byCall !== 0) return byCall;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortQueue<T extends Pick<QueueItem, "id" | "callNumber">>(items: readonly T[], sort: ReviewSort): T[] {
  // One sort today; the switch is where "urgent tasks first" lands (Slice 2).
  switch (sort) {
    case "shelf":
    default:
      return [...items].sort(compareShelf);
  }
}

/** Does this record belong in the list the URL describes? The language is always part of the answer. */
export function matchesReviewQuery(
  item: Pick<QueueItem, "language" | "review">,
  q: ReviewQuery,
  viewerId: string,
  now: Date,
): boolean {
  if (!q.language || reviewQueueOf(item.language) !== q.language) return false;
  const status = statusOf(item.review);
  switch (q.status) {
    case "open":
      if (status !== "needs_review" && status !== "in_review") return false;
      break;
    case "all":
      break;
    default:
      if (status !== q.status) return false;
  }
  const claim = claimState(item.review, viewerId, now);
  if (q.assignee === "me" && claim !== "mine") return false;
  if (q.assignee === "unassigned" && (claim === "mine" || claim === "other")) return false;
  return true;
}

export type QueuePosition = {
  prevId: string | null;
  nextId: string | null;
  /** 1-based place of the current record in the filtered list, or null when it is not in it (e.g. just verified). */
  position: number | null;
  total: number;
};

/**
 * Previous and next inside the filtered queue, relative to where the current
 * record sits in shelf order — whether or not it still matches the filter.
 * `sorted` must already be in the query's order; `current` is placed by the
 * same comparator, so a record from the other language (or one whose call
 * number just changed) still has a well-defined neighbour in THIS queue.
 */
export function queuePosition(
  sorted: readonly QueueItem[],
  current: Pick<QueueItem, "id" | "callNumber">,
  matches: (item: QueueItem) => boolean,
): QueuePosition {
  let prevId: string | null = null;
  let nextId: string | null = null;
  let position: number | null = null;
  let total = 0;
  for (const item of sorted) {
    if (!matches(item)) continue;
    total += 1;
    if (item.id === current.id) {
      position = total;
      continue;
    }
    const cmp = compareShelf(item, current);
    if (cmp < 0) prevId = item.id;
    else if (cmp > 0 && nextId === null) nextId = item.id;
  }
  return { prevId, nextId, position, total };
}

// ── Counts ────────────────────────────────────────────────────────────────────

export type QueueCounts = { total: number; needsReview: number; inReview: number; verified: number; blocked: number };
export type ReviewCounts = Record<ReviewQueue, QueueCounts> & { noLanguage: number };

const emptyCounts = (): QueueCounts => ({ total: 0, needsReview: 0, inReview: 0, verified: 0, blocked: 0 });

/** Per-queue counts from the records' languages and the review rows. A record with no row needs review. */
export function reviewCounts(
  books: readonly { id: string; language: string | null }[],
  rows: ReadonlyMap<string, ReviewRow>,
): ReviewCounts {
  const out: ReviewCounts = { km: emptyCounts(), en: emptyCounts(), noLanguage: 0 };
  for (const b of books) {
    const queue = reviewQueueOf(b.language);
    if (!queue) {
      out.noLanguage += 1;
      continue;
    }
    const c = out[queue];
    c.total += 1;
    const status = statusOf(rows.get(b.id) ?? null);
    if (status === "needs_review") c.needsReview += 1;
    else if (status === "in_review") c.inReview += 1;
    else if (status === "verified") c.verified += 1;
    else c.blocked += 1;
  }
  return out;
}

// ── Transitions ───────────────────────────────────────────────────────────────

export const REVIEW_ACTIONS = ["claim", "release", "takeover", "verify", "block", "unblock", "reopen"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

/** The columns a transition may set. `version` and `updated_at` are the server's. */
export type ReviewPatch = {
  status: ReviewStatus;
  assigned_to: string | null;
  claimed_at: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  verified_fingerprint?: string | null;
  blocked_reason?: BlockReason | null;
  blocked_note?: string | null;
};

export type TransitionRefusal = "held_by_other" | "not_held" | "illegal" | "already" | "bad_reason" | "missing_fingerprint";

export type TransitionPlan =
  | { ok: true; from: ReviewStatus; to: ReviewStatus; patch: ReviewPatch; previousHolder: string | null }
  | { ok: false; reason: TransitionRefusal };

const FINGERPRINT = /^[0-9a-f]{64}$/;

/**
 * What `action` by `actorId` does to a record whose review row is `row`.
 * Refuses rather than guesses: a fresh claim held by someone else is never
 * overridden except by the explicit, audited `takeover`.
 */
export function planReviewTransition(input: {
  action: ReviewAction;
  row: ReviewRow | null;
  actorId: string;
  now: Date;
  fingerprint?: string | null;
  block?: { reason: string; note?: string | null };
}): TransitionPlan {
  const { action, row, actorId, now } = input;
  const from = statusOf(row);
  const claim = claimState(row, actorId, now);
  const at = now.toISOString();
  const holder = row?.status === "in_review" ? row.assignedTo : null;
  const free = { assigned_to: null, claimed_at: null };
  const ok = (to: ReviewStatus, patch: Omit<ReviewPatch, "status">): TransitionPlan => ({
    ok: true,
    from,
    to,
    patch: { status: to, ...patch },
    previousHolder: holder && holder !== actorId ? holder : null,
  });

  switch (action) {
    case "claim":
      if (from === "verified" || from === "blocked") return { ok: false, reason: "illegal" };
      if (claim === "other") return { ok: false, reason: "held_by_other" };
      // Claiming your own record again renews the lease.
      return ok("in_review", { assigned_to: actorId, claimed_at: at });

    case "takeover":
      if (claim === "mine") return { ok: false, reason: "already" };
      if (claim !== "other" && claim !== "stale") return { ok: false, reason: "illegal" };
      return ok("in_review", { assigned_to: actorId, claimed_at: at });

    case "release":
      if (claim !== "mine") return { ok: false, reason: "not_held" };
      return ok("needs_review", free);

    case "verify": {
      if (from === "verified") return { ok: false, reason: "already" };
      if (from === "blocked") return { ok: false, reason: "illegal" };
      if (claim === "other") return { ok: false, reason: "held_by_other" };
      const fp = input.fingerprint ?? "";
      if (!FINGERPRINT.test(fp)) return { ok: false, reason: "missing_fingerprint" };
      return ok("verified", { ...free, reviewed_by: actorId, reviewed_at: at, verified_fingerprint: fp });
    }

    case "block": {
      if (from === "verified" || from === "blocked") return { ok: false, reason: "illegal" };
      if (claim === "other") return { ok: false, reason: "held_by_other" };
      const reason = input.block?.reason ?? "";
      if (!(BLOCK_REASONS as readonly string[]).includes(reason)) return { ok: false, reason: "bad_reason" };
      const note = (input.block?.note ?? "").trim().slice(0, BLOCK_NOTE_MAX) || null;
      if (reason === "other" && !note) return { ok: false, reason: "bad_reason" };
      return ok("blocked", { ...free, blocked_reason: reason as BlockReason, blocked_note: note });
    }

    case "unblock":
      if (from !== "blocked") return { ok: false, reason: "illegal" };
      return ok("needs_review", { ...free, blocked_reason: null, blocked_note: null });

    case "reopen":
      // reviewed_by/at stay: they now mean "last reviewed", and the audit log keeps the rest.
      if (from !== "verified") return { ok: false, reason: "illegal" };
      return ok("needs_review", { ...free, verified_fingerprint: null });
  }
}

// ── "Changed since verified" ──────────────────────────────────────────────────

/** The fields a verification attests to: the bibliographic record, not its slug, cover or SEO. */
export type FingerprintFields = {
  title: string | null;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  year: number | string | null;
  language: string | null;
  category: string | null;
  ddc: string | null;
  description: string | null;
  keywords: readonly string[] | null;
};

const tidy = (v: unknown) => (v == null ? "" : String(v)).normalize("NFC").replace(/\s+/g, " ").trim();

/**
 * The canonical text a verification fingerprint is the sha256 of. Whitespace
 * and Unicode composition are normalised so a re-save that changes nothing a
 * reader could see does not read as a change; the order of keywords is kept,
 * because the record shows them in that order.
 */
export function fingerprintInput(book: FingerprintFields): string {
  return JSON.stringify([
    tidy(book.title),
    tidy(book.author),
    tidy(book.isbn),
    tidy(book.publisher),
    tidy(book.year),
    tidy(book.language),
    tidy(book.category),
    tidy(book.ddc),
    tidy(book.description),
    (book.keywords ?? []).map(tidy).filter(Boolean),
  ]);
}

/** Verified, and the record no longer says what the librarian verified (e.g. it was edited in Koha). */
export function changedSinceVerified(row: ReviewRow | null, liveFingerprint: string): boolean {
  return !!row && row.status === "verified" && !!row.verifiedFingerprint && row.verifiedFingerprint !== liveFingerprint;
}
