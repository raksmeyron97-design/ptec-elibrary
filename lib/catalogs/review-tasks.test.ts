import { describe, expect, it } from "vitest";
import {
  BLOCKING_TASKS,
  REVIEW_TASK_IDS,
  WAIVABLE_TASKS,
  compareUrgency,
  duplicateGroups,
  openBlockingTasks,
  openTasks,
  reviewTasks,
  type TaskInput,
} from "./review-tasks";
import { matchesReviewQuery, parseReviewQuery, planTaskWaiver, reviewQueryString, sortQueue, type QueueItem, type ReviewQuery, type ReviewRow } from "./review";

const NOW = new Date("2026-10-05T08:00:00Z");
const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

// A typical PMB record: title, author, language, category, call number, copies — nothing else.
const pmb = (over: Partial<TaskInput> = {}): TaskInput => ({
  title: "គណិតវិទ្យា ថ្នាក់ទី៧",
  author: "ក្រសួងអប់រំ",
  language: "km",
  category: "500 វិទ្យាសាស្ត្រធម្មជាតិ និងគណិតវិទ្យា",
  department: null,
  ddc: "510 ក្រ",
  shelf_location: null,
  isbn: null,
  publisher: null,
  year: null,
  cover_url: null,
  description: null,
  ...over,
});
const state = (tasks: ReturnType<typeof reviewTasks>) => Object.fromEntries(tasks.map((t) => [t.id, t.state]));

describe("tasks", () => {
  it("a typical PMB record: nothing blocks, five things to do — said as tasks, not a percentage", () => {
    const tasks = reviewTasks(pmb(), { total: 5, shelved: 0 }, false);
    expect(openBlockingTasks(tasks)).toEqual([]);
    expect(openTasks(tasks).map((t) => t.id).sort()).toEqual(["cover", "description", "isbn", "publication", "shelf"]);
  });

  it("the four blocking tasks are what a reader feels and the record can carry", () => {
    expect([...BLOCKING_TASKS].sort()).toEqual(["call-number", "copies", "language", "subject"]);
    const tasks = reviewTasks(pmb({ language: "Khmer", category: null, ddc: null }), { total: 0, shelved: 0 }, false);
    expect(openBlockingTasks(tasks).map((t) => t.id).sort()).toEqual(["call-number", "copies", "language", "subject"]);
  });

  it("an unrecognised language value is a blocking task, not a guess", () => {
    expect(state(reviewTasks(pmb({ language: "English" }), { total: 1, shelved: 1 }, false)).language).toBe("open");
    expect(state(reviewTasks(pmb({ language: "fr" }), { total: 1, shelved: 1 }, false)).language).toBe("done");
  });

  it("the shelf is copy-level: every copy needs a Koha location, and the book-level field does not count", () => {
    expect(state(reviewTasks(pmb({ shelf_location: "A-12" }), { total: 3, shelved: 2 }, false)).shelf).toBe("open");
    expect(state(reviewTasks(pmb(), { total: 3, shelved: 3 }, false)).shelf).toBe("done");
    // No copies is the copies task's business, not this one's.
    expect(state(reviewTasks(pmb(), { total: 0, shelved: 0 }, false)).shelf).toBe("done");
  });

  it("a description that only restates the record is still a task", () => {
    const derived = "គណិតវិទ្យា ថ្នាក់ទី៧ by ក្រសួងអប់រំ. 500 វិទ្យាសាស្ត្រធម្មជាតិ និងគណិតវិទ្យា. DDC call number: 510 ក្រ.";
    expect(state(reviewTasks(pmb({ description: derived }), { total: 1, shelved: 1 }, false)).description).toBe("open");
    const real = "A textbook for grade 7 covering fractions, ratios, basic geometry and the first steps of algebra, with worked examples.";
    expect(state(reviewTasks(pmb({ description: real }), { total: 1, shelved: 1 }, false)).description).toBe("done");
  });

  it("waivers: only waivable tasks, only while open, and a waived blocking task is impossible", () => {
    const tasks = reviewTasks(pmb({ category: null }), { total: 1, shelved: 0 }, true, ["isbn", "duplicate", "subject", "shelf", "nonsense"]);
    const s = state(tasks);
    expect(s.isbn).toBe("waived");
    expect(s.duplicate).toBe("waived");
    expect(s.subject).toBe("open");
    expect(s.shelf).toBe("open");
    expect(WAIVABLE_TASKS.some((id) => BLOCKING_TASKS.includes(id))).toBe(false);
    expect(WAIVABLE_TASKS).not.toContain("shelf");
  });

  it("a done task stays done even if it was once waived", () => {
    expect(state(reviewTasks(pmb({ isbn: "9789924000000" }), { total: 1, shelved: 1 }, false, ["isbn"])).isbn).toBe("done");
  });

  it("every task id is either blocking or info, and appears once", () => {
    const tasks = reviewTasks(pmb(), { total: 1, shelved: 1 }, false);
    expect(tasks.map((t) => t.id)).toEqual([...REVIEW_TASK_IDS]);
  });
});

describe("duplicates are exact identity keys, never a fuzzy guess", () => {
  it("the same ISBN in its 10- and 13-digit forms is one key", () => {
    const g = duplicateGroups([
      { id: "a", isbn: "0306406152", title: "X", author: null },
      { id: "b", isbn: "978-0-306-40615-7", title: "Y", author: null },
    ]);
    expect(g.get("a")).toEqual(["b"]);
  });

  it("title AND author, after normalisation (case, spacing, punctuation)", () => {
    const g = duplicateGroups([
      { id: "a", isbn: null, title: "Visible Learning", author: "Hattie, John" },
      { id: "b", isbn: null, title: "  visible   learning ", author: "hattie john" },
      { id: "c", isbn: null, title: "Visible Learning", author: "Someone Else" },
    ]);
    expect(g.get("a")).toEqual(["b"]);
    expect(g.has("c")).toBe(false);
  });

  it("a title with no author is not keyed alone — unauthored series volumes are not duplicates", () => {
    const g = duplicateGroups([
      { id: "a", isbn: null, title: "សៀវភៅណែនាំគ្រូ", author: null },
      { id: "b", isbn: null, title: "សៀវភៅណែនាំគ្រូ", author: "" },
    ]);
    expect(g.size).toBe(0);
  });

  it("Khmer titles keep their marks, so different Khmer titles do not collapse", () => {
    const g = duplicateGroups([
      { id: "a", isbn: null, title: "គណិតវិទ្យា ថ្នាក់ទី៧", author: "ក្រសួងអប់រំ" },
      { id: "b", isbn: null, title: "គណិតវិទ្យា ថ្នាក់ទី៨", author: "ក្រសួងអប់រំ" },
    ]);
    expect(g.size).toBe(0);
  });
});

describe("the queue reads tasks", () => {
  const row = (over: Partial<ReviewRow> = {}): ReviewRow => ({
    status: "needs_review", assignedTo: null, claimedAt: null, reviewedBy: null, reviewedAt: null,
    verifiedFingerprint: null, blockedReason: null, blockedNote: null, waivedTasks: [], version: 1, ...over,
  });
  const item = (id: string, callNumber: string, input: Partial<TaskInput>, waived: string[] = []): QueueItem => ({
    id, title: id, author: null, language: "km", callNumber, isActive: true, review: null,
    tasks: reviewTasks(pmb(input), { total: 1, shelved: 1 }, false, waived),
  });
  const q = (over: Partial<ReviewQuery> = {}): ReviewQuery => ({ language: "km", status: "open", assignee: "any", sort: "shelf", task: null, ...over });

  it("a task filter shows only records where that task is OPEN — waived does not count", () => {
    const a = item("a", "100", {});
    const b = item("b", "200", { isbn: "9789924000000" });
    const c = item("c", "300", {}, ["isbn"]);
    const got = [a, b, c].filter((i) => matchesReviewQuery(i, q({ task: "isbn" }), ME, NOW)).map((i) => i.id);
    expect(got).toEqual(["a"]);
  });

  it("urgent order puts blocking tasks first, then shelf order", () => {
    const calm = item("calm", "100", {});
    const noSubject = item("noSubject", "900", { category: null });
    const noCall = item("noCall", "800", { ddc: null, category: null });
    expect(sortQueue([calm, noSubject, noCall], "urgent").map((i) => i.id)).toEqual(["noCall", "noSubject", "calm"]);
    expect(sortQueue([calm, noSubject, noCall], "shelf").map((i) => i.id)).toEqual(["calm", "noCall", "noSubject"]);
    expect(compareUrgency(calm.tasks, calm.tasks)).toBe(0);
  });

  it("task and order survive the URL", () => {
    const query = q({ task: "cover", sort: "urgent" });
    expect(parseReviewQuery(new URLSearchParams(reviewQueryString(query)))).toEqual(query);
    expect(parseReviewQuery({ task: "everything" }).task).toBeNull();
  });

  it("waiving: waivable only, never over another librarian's fresh claim, and no-op twice is refused", () => {
    const held = row({ status: "in_review", assignedTo: OTHER, claimedAt: new Date(NOW.getTime() - 60_000).toISOString() });
    expect(planTaskWaiver({ row: null, actorId: ME, now: NOW, task: "isbn", waive: true })).toEqual({ ok: true, waivedTasks: ["isbn"] });
    expect(planTaskWaiver({ row: null, actorId: ME, now: NOW, task: "subject", waive: true })).toEqual({ ok: false, reason: "not_waivable" });
    expect(planTaskWaiver({ row: null, actorId: ME, now: NOW, task: "shelf", waive: true })).toEqual({ ok: false, reason: "not_waivable" });
    expect(planTaskWaiver({ row: held, actorId: ME, now: NOW, task: "isbn", waive: true })).toEqual({ ok: false, reason: "held_by_other" });
    expect(planTaskWaiver({ row: row({ waivedTasks: ["isbn"] }), actorId: ME, now: NOW, task: "isbn", waive: true })).toEqual({ ok: false, reason: "already" });
    expect(planTaskWaiver({ row: row({ waivedTasks: ["isbn", "cover"] }), actorId: ME, now: NOW, task: "isbn", waive: false })).toEqual({ ok: true, waivedTasks: ["cover"] });
  });
});
