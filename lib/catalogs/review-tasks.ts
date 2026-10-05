/**
 * Review TASKS for one Physical Library record (docs/CATALOG-REVIEW.md, Slice 2).
 * Pure — the queue, the workspace, the server's verify gate and the tests read
 * one definition.
 *
 * "Needs 3 tasks", never "72% complete": every PMB record is thin in the same
 * ways, so a percentage would rank nothing (see record-health.ts). A task names
 * one thing a librarian can do, and says whether it blocks verification.
 *
 * Built ON assessCatalogRecordHealth() — its six checks keep their meaning and
 * their wording on the edit page — plus four the review needs:
 *
 *   • language    — the record's language is a catalogue code, so it sits in a
 *                   queue and Koha types it BK/BKEN correctly;
 *   • description — there is one, and it says more than the record already
 *                   does (lib/catalogs/derived-description.ts);
 *   • shelf       — every copy has a shelving location IN KOHA (copy-level;
 *                   never the book-level field, which Koha does not sync);
 *   • duplicate   — another record has the same ISBN, or the same title and
 *                   author after normalisation. A signal, not a verdict.
 *
 * Two tiers:
 *   • `blocking` — verification is refused while it is open. Only things a
 *     reader feels today and that the record itself can carry: copies, a call
 *     number, a subject, a recognised language.
 *   • `info`     — worth doing; never blocks.
 *
 * Some `info` tasks can be WAIVED: the book genuinely has no ISBN printed, no
 * publisher or year stated, no cover worth photographing, nothing to describe —
 * or the "duplicate" is a separate edition. A waived task is neither open nor
 * done; it is shown as waived. Blocking tasks and the shelf (set in Koha) can
 * never be waived.
 */
import { assessCatalogRecordHealth, type RecordHealthCheckId } from "./record-health";
import { isDerivedDescription } from "./derived-description";
import { findDuplicateGroups, type DuplicateConfidence, type DuplicateGroup } from "@/lib/admin/duplicates";
import { CATALOG_LANGUAGES } from "@/lib/catalog-import";

export const REVIEW_TASK_IDS = [
  "language",
  "subject",
  "call-number",
  "copies",
  "isbn",
  "publication",
  "description",
  "cover",
  "shelf",
  "duplicate",
] as const;
export type ReviewTaskId = (typeof REVIEW_TASK_IDS)[number];

export const BLOCKING_TASKS: readonly ReviewTaskId[] = ["language", "subject", "call-number", "copies"];
export const WAIVABLE_TASKS: readonly ReviewTaskId[] = ["isbn", "publication", "description", "cover", "duplicate"];

export const isReviewTaskId = (v: unknown): v is ReviewTaskId =>
  typeof v === "string" && (REVIEW_TASK_IDS as readonly string[]).includes(v);
export const isWaivable = (id: ReviewTaskId) => WAIVABLE_TASKS.includes(id);

export type TaskState = "done" | "open" | "waived";

export type ReviewTask = {
  id: ReviewTaskId;
  tier: "blocking" | "info";
  state: TaskState;
  waivable: boolean;
};

/** The fields of a record the tasks read — all from the SAVED row. */
export type TaskInput = {
  title: string | null;
  author: string | null;
  language: string | null;
  category: string | null;
  department: string | null;
  ddc: string | null;
  shelf_location: string | null;
  isbn: string | null;
  publisher: string | null;
  year: number | null;
  cover_url: string | null;
  description: string | null;
};

export type CopySummary = {
  /** Copies that are not withdrawn. */
  total: number;
  /** Of those, how many have a shelving location (Koha's `location`). */
  shelved: number;
};

const present = (v: string | null | undefined) => !!v && v.trim() !== "";

const HEALTH_TO_TASK: Record<RecordHealthCheckId, ReviewTaskId> = {
  copies: "copies",
  "call-number": "call-number",
  subject: "subject",
  isbn: "isbn",
  publication: "publication",
  cover: "cover",
};

/** Is each task done? Before waivers. */
export function taskFacts(book: TaskInput, copies: CopySummary, isDuplicate: boolean): Record<ReviewTaskId, boolean> {
  const health = assessCatalogRecordHealth(
    {
      title: book.title ?? "",
      author: book.author ?? "",
      description: book.description,
      category: book.category,
      department: book.department,
      ddc: book.ddc,
      publisher: book.publisher,
      shelf_location: book.shelf_location,
      isbn: book.isbn,
      year: book.year,
      cover_url: book.cover_url,
    },
    { total: copies.total },
  );
  const out = {} as Record<ReviewTaskId, boolean>;
  for (const check of health) out[HEALTH_TO_TASK[check.id]] = check.ok;
  out.language = (CATALOG_LANGUAGES as readonly string[]).includes((book.language ?? "").trim());
  out.description =
    present(book.description) &&
    !isDerivedDescription({
      description: book.description,
      title: book.title,
      author: book.author,
      category: book.category,
      department: book.department,
      ddc: book.ddc,
      publisher: book.publisher,
      shelfLocation: book.shelf_location,
    });
  // No copies is the "copies" task's business, not this one's.
  out.shelf = copies.total === 0 || copies.shelved >= copies.total;
  out.duplicate = !isDuplicate;
  return out;
}

export function reviewTasks(
  book: TaskInput,
  copies: CopySummary,
  isDuplicate: boolean,
  waived: readonly string[] = [],
): ReviewTask[] {
  const facts = taskFacts(book, copies, isDuplicate);
  return REVIEW_TASK_IDS.map((id) => {
    const waivable = isWaivable(id);
    const state: TaskState = facts[id] ? "done" : waivable && waived.includes(id) ? "waived" : "open";
    return { id, tier: BLOCKING_TASKS.includes(id) ? "blocking" : "info", state, waivable };
  });
}

export const openTasks = (tasks: readonly ReviewTask[]) => tasks.filter((t) => t.state === "open");
export const openBlockingTasks = (tasks: readonly ReviewTask[]) => tasks.filter((t) => t.state === "open" && t.tier === "blocking");

/** "Urgent first": more open blocking tasks first, then more open tasks. Ties are left to shelf order. */
export function compareUrgency(a: readonly ReviewTask[], b: readonly ReviewTask[]): number {
  return openBlockingTasks(b).length - openBlockingTasks(a).length || openTasks(b).length - openTasks(a).length;
}

// ── Duplicates ────────────────────────────────────────────────────────────────

export type DuplicateCandidate = {
  id: string;
  isbn: string | null;
  title: string | null;
  author: string | null;
  year?: number | null;
  created_at?: string | null;
};

/** Confidence a group must reach to put a "possible duplicate" task on its records. */
export const TASK_CONFIDENCES: readonly DuplicateConfidence[] = ["high", "medium"];

/**
 * Possible-duplicate groups over the catalogue, by the library's ONE grouping
 * (lib/admin/duplicates.ts, the digital collection's review queue): a shared
 * canonical ISBN is high confidence; the same normalized title is low, raised
 * to medium when every record agrees on the author or on the year; a title that
 * is a word-boundary prefix of another by the same author is low. Never a
 * merge — a signal for a person to look at.
 */
export function duplicateClusters(records: readonly DuplicateCandidate[]): DuplicateGroup[] {
  return findDuplicateGroups(
    records.map((r) => ({
      id: r.id,
      slug: r.id,
      title: r.title ?? "",
      isbn: r.isbn,
      year: r.year ?? null,
      author: r.author,
      pages: null,
      fileSizeKb: null,
      contentHash: null,
      createdAt: r.created_at ?? null,
    })),
  );
}

/**
 * Which records carry the "possible duplicate" TASK: those in a high- or
 * medium-confidence group. A title alone (PMB holds many unauthored series
 * volumes) or a prefix is low — shown in the duplicates view, never a task.
 */
export function duplicateGroups(records: readonly DuplicateCandidate[], groups = duplicateClusters(records)): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const g of groups) {
    if (!TASK_CONFIDENCES.includes(g.confidence)) continue;
    for (const b of g.books) out.set(b.id, g.books.filter((o) => o.id !== b.id).map((o) => o.id));
  }
  return out;
}
