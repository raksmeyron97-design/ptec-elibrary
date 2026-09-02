/**
 * The pre-upload quality gate: everything the form knows about a draft record,
 * resolved into one ordered list of checks.
 *
 * WHY IT IS A PURE MODULE AND NOT JSX. These are business rules — what makes a
 * record ready, what merely warrants a warning, and what refuses the save. A
 * rule expressed as a conditional colour inside a component cannot be tested
 * and cannot be found. The panel renders what this returns and decides
 * nothing.
 *
 * WHY IT RUNS BEFORE THE UPLOAD. A 40 MB PDF takes minutes on the connections
 * this library is catalogued over. Learning "this book is already here" after
 * that transfer is the single most expensive way to find out.
 *
 * Messages are KEYS, not sentences — the panel is bilingual.
 */

import type { IsbnStatus } from "./duplicate-detection/normalize";
import type { DuplicateConfidence } from "./duplicate-detection/signals";

export type PreflightTone = "pass" | "warn" | "fail" | "pending";

export type PreflightCheckId =
  | "pdf"
  | "pages"
  | "title"
  | "author"
  | "taxonomy"
  | "isbn"
  | "duplicates";

export type PreflightCheck = {
  id: PreflightCheckId;
  tone: PreflightTone;
  /** Key under `adminUpload.preflight.check`, e.g. "pdf.ready". */
  messageKey: string;
  /** ICU values for the message, when it takes any. */
  values?: Record<string, string | number>;
};

export type PreflightInput = {
  pdf: { chosen: boolean; sizeBytes: number; overSize: boolean; overRecommended: boolean };
  pages: { detecting: boolean; detected: number | null };
  title: string;
  author: { name: string; canonicalId: string | null };
  category: string;
  department: string;
  isbn: { raw: string; status: IsbnStatus };
  duplicates:
    // One member per state, not `"idle" | "checking"` in one: a union member
    // whose discriminant is itself a union cannot be narrowed away by an
    // equality check, and the branches below stop type-checking.
    | { state: "idle" }
    | { state: "checking" }
    | { state: "error" }
    | { state: "ready"; blocked: boolean; count: number; confidence: DuplicateConfidence | null };
};

export type PreflightReport = {
  checks: PreflightCheck[];
  /** Nothing prevents a save. */
  ready: boolean;
  /** A blocking duplicate or a missing requirement: the save is refused. */
  blocked: boolean;
  /** Advisory findings — a large file, an unverifiable ISBN, a new author. */
  warnings: number;
};

const REQUIRED_TONE = (present: boolean): PreflightTone => (present ? "pass" : "fail");

export function buildPreflight(input: PreflightInput): PreflightReport {
  const checks: PreflightCheck[] = [];

  // ── The file ──────────────────────────────────────────────────────────
  if (!input.pdf.chosen) {
    checks.push({ id: "pdf", tone: "fail", messageKey: "pdf.missing" });
  } else if (input.pdf.overSize) {
    checks.push({ id: "pdf", tone: "fail", messageKey: "pdf.tooLarge" });
  } else if (input.pdf.overRecommended) {
    checks.push({ id: "pdf", tone: "warn", messageKey: "pdf.large" });
  } else {
    checks.push({ id: "pdf", tone: "pass", messageKey: "pdf.ready" });
  }

  if (input.pdf.chosen) {
    if (input.pages.detecting) {
      checks.push({ id: "pages", tone: "pending", messageKey: "pages.detecting" });
    } else if (input.pages.detected && input.pages.detected > 0) {
      checks.push({
        id: "pages",
        tone: "pass",
        messageKey: "pages.detected",
        values: { count: input.pages.detected },
      });
    } else {
      // Not a failure: scanned PDFs without a usable page tree are real, and
      // the librarian can type the number.
      checks.push({ id: "pages", tone: "warn", messageKey: "pages.unknown" });
    }
  }

  // ── Required metadata ─────────────────────────────────────────────────
  checks.push({
    id: "title",
    tone: REQUIRED_TONE(input.title.trim().length > 0),
    messageKey: input.title.trim() ? "title.present" : "title.missing",
  });

  if (!input.author.name.trim()) {
    checks.push({ id: "author", tone: "fail", messageKey: "author.missing" });
  } else if (input.author.canonicalId) {
    checks.push({ id: "author", tone: "pass", messageKey: "author.existing" });
  } else {
    // A new author is normal and must not read as a defect — but it IS the
    // moment a duplicate person is created, so it is said out loud.
    checks.push({ id: "author", tone: "warn", messageKey: "author.new" });
  }

  const taxonomyOk = Boolean(input.category.trim() && input.department.trim());
  checks.push({
    id: "taxonomy",
    tone: REQUIRED_TONE(taxonomyOk),
    messageKey: taxonomyOk ? "taxonomy.present" : "taxonomy.missing",
  });

  // ── Identifier ────────────────────────────────────────────────────────
  if (input.isbn.status === "empty") {
    checks.push({ id: "isbn", tone: "warn", messageKey: "isbn.absent" });
  } else if (input.isbn.status === "invalid") {
    // Advisory, never blocking: a real book can carry a misprinted ISBN, and
    // refusing the record would lose the book to save the number.
    checks.push({ id: "isbn", tone: "warn", messageKey: "isbn.invalid" });
  } else {
    checks.push({ id: "isbn", tone: "pass", messageKey: "isbn.valid" });
  }

  // ── Duplicates ────────────────────────────────────────────────────────
  const dup = input.duplicates;
  if (dup.state === "idle") {
    checks.push({ id: "duplicates", tone: "pending", messageKey: "duplicates.idle" });
  } else if (dup.state === "checking") {
    checks.push({ id: "duplicates", tone: "pending", messageKey: "duplicates.checking" });
  } else if (dup.state === "error") {
    checks.push({ id: "duplicates", tone: "warn", messageKey: "duplicates.unavailable" });
  } else if (dup.blocked) {
    checks.push({ id: "duplicates", tone: "fail", messageKey: "duplicates.blocked" });
  } else if (dup.count > 0) {
    checks.push({
      id: "duplicates",
      tone: "warn",
      messageKey: dup.confidence === "high" ? "duplicates.strong" : "duplicates.possible",
      values: { count: dup.count },
    });
  } else {
    checks.push({ id: "duplicates", tone: "pass", messageKey: "duplicates.clean" });
  }

  const blocked = checks.some((check) => check.tone === "fail");
  return {
    checks,
    blocked,
    ready: !blocked && !checks.some((check) => check.tone === "pending"),
    warnings: checks.filter((check) => check.tone === "warn").length,
  };
}
