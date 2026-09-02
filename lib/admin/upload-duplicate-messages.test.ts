// Formats every parameterised message the ingestion gate renders, in BOTH
// catalogues.
//
// lib/i18n-parity.test.ts proves the Khmer key EXISTS; it cannot prove the
// string parses. A malformed ICU argument — a stray brace, a plural clause
// that forgets `other` — is valid JSON and only throws when the component
// renders it, on the Khmer admin panel, which nothing else in the suite
// exercises. A duplicate warning that crashes the form instead of appearing
// is worse than no warning at all.

import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import km from "@/messages/km.json";
import {
  type DuplicateConfidence,
  type DuplicateReason,
  type DuplicateSignal,
} from "@/lib/books/duplicate-detection/signals";
import { buildPreflight, type PreflightInput } from "@/lib/books/upload-preflight";

/** Every reason code the detector can emit. Listed literally so a new one
 *  added to the union without a translation fails the type check here. */
const REASONS: Record<DuplicateReason, true> = {
  sameFile: true,
  sameIsbn: true,
  sameTitle: true,
  similarTitle: true,
  titleContained: true,
  sameAuthor: true,
  sameYear: true,
  samePublisher: true,
  differentIsbn: true,
  differentEdition: true,
  differentYear: true,
};

/** Signals are not rendered directly today, but the exhaustive map is what
 *  makes adding one impossible to do silently. */
const SIGNALS: Record<DuplicateSignal, true> = {
  content_hash: true,
  isbn: true,
  exact_title: true,
  normalized_title: true,
  title_author: true,
  title_author_year: true,
  fuzzy_title: true,
  title_prefix: true,
};

const CONFIDENCES: Record<DuplicateConfidence, true> = {
  exact: true,
  high: true,
  medium: true,
  low: true,
};

const BASE: PreflightInput = {
  pdf: { chosen: true, sizeBytes: 1, overSize: false, overRecommended: false },
  pages: { detecting: false, detected: 12 },
  title: "T",
  author: { name: "A", canonicalId: "x" },
  category: "C",
  department: "D",
  isbn: { raw: "", status: "valid" },
  duplicates: { state: "ready", blocked: false, count: 0, confidence: null },
};

/** Every branch buildPreflight can take, so every message key it can name is
 *  actually formatted below rather than merely existing. */
const PREFLIGHT_CASES: PreflightInput[] = [
  BASE,
  { ...BASE, pdf: { ...BASE.pdf, chosen: false } },
  { ...BASE, pdf: { ...BASE.pdf, overSize: true } },
  { ...BASE, pdf: { ...BASE.pdf, overRecommended: true } },
  { ...BASE, pages: { detecting: true, detected: null } },
  { ...BASE, pages: { detecting: false, detected: null } },
  { ...BASE, title: "" },
  { ...BASE, author: { name: "", canonicalId: null } },
  { ...BASE, author: { name: "New", canonicalId: null } },
  { ...BASE, category: "" },
  { ...BASE, isbn: { raw: "x", status: "invalid" } },
  { ...BASE, isbn: { raw: "", status: "empty" } },
  { ...BASE, duplicates: { state: "idle" } },
  { ...BASE, duplicates: { state: "checking" } },
  { ...BASE, duplicates: { state: "error" } },
  { ...BASE, duplicates: { state: "ready", blocked: true, count: 1, confidence: "exact" } },
  { ...BASE, duplicates: { state: "ready", blocked: false, count: 2, confidence: "high" } },
  { ...BASE, duplicates: { state: "ready", blocked: false, count: 3, confidence: "medium" } },
];

for (const [locale, messages] of [
  ["en", en],
  ["km", km],
] as const) {
  describe(`adminUpload ingestion messages (${locale})`, () => {

    it("names every duplicate reason code", () => {
      const t = createTranslator({ locale, messages, namespace: "adminUpload.duplicates" });
      for (const reason of Object.keys(REASONS)) {
        expect(t(`reason.${reason}` as "reason.sameIsbn"), reason).toBeTruthy();
      }
    });

    it("has a signal vocabulary that stays in step with the detector", () => {
      // The union is the source of truth; this asserts the map above was updated
      // with it, which is what keeps the reason list honest too.
      expect(Object.keys(SIGNALS)).toHaveLength(8);
    });

    it("names every publication state a match can be in", () => {
      const t = createTranslator({ locale, messages, namespace: "adminUpload.duplicates" });
      for (const status of ["published", "pending", "draft", "archived"]) {
        expect(t(`status.${status}` as "status.published"), status).toBeTruthy();
      }
      expect(Object.keys(CONFIDENCES)).toHaveLength(4);
    });

    it("formats every parameterised duplicate message", () => {
      const t = createTranslator({ locale, messages, namespace: "adminUpload.duplicates" });
      for (const count of [0, 1, 2, 11]) {
        expect(t("matchCount", { count })).toBeTruthy();
        expect(t("expand", { count })).toBeTruthy();
      }
      expect(t("similarity", { score: 97 })).toContain("97");
      for (const key of [
        "checking",
        "clean",
        "collapse",
        "reviewQueue",
        "openRecord",
        "viewPublic",
        "noMetadata",
        "editionNote",
        "blocked.title",
        "blocked.file",
        "blocked.isbn",
        "strong.title",
        "strong.lead",
        "possible.title",
        "possible.lead",
        "unavailable.title",
        "unavailable.body",
        "override.label",
        "override.hint",
        "override.active",
      ] as const) {
        expect(t(key), key).toBeTruthy();
      }
    });

    it("formats every author-picker message", () => {
      const t = createTranslator({ locale, messages, namespace: "adminUpload.author" });
      expect(t("createNew", { name: "Sok Dara" })).toContain("Sok Dara");
      for (const count of [0, 1, 42]) {
        expect(t("bookCount", { count })).toBeTruthy();
      }
      for (const key of ["suggestions", "hint", "selected", "clear", "noMatches", "fuzzyNote"] as const) {
        expect(t(key), key).toBeTruthy();
      }
    });

    it("formats every message the quality gate can produce, on every branch", () => {
      const t = createTranslator({ locale, messages, namespace: "adminUpload.preflight" });
      for (const heading of ["ready", "pending", "blocked"]) {
        expect(t(`heading.${heading}` as "heading.ready")).toBeTruthy();
      }
      expect(t("sub")).toBeTruthy();
      for (const count of [1, 3]) expect(t("subWithWarnings", { count })).toBeTruthy();

      for (const input of PREFLIGHT_CASES) {
        for (const check of buildPreflight(input).checks) {
          expect(
            t(`check.${check.messageKey}` as "check.pdf.ready", check.values),
            check.messageKey,
          ).toBeTruthy();
        }
      }
    });

    it("formats the bulk importer's row-level duplicate report", () => {
      const t = createTranslator({ locale, messages, namespace: "adminUpload.bulk.duplicate" });
      for (const count of [1, 5]) {
        expect(t("blockedCount", { count })).toBeTruthy();
        expect(t("strongCount", { count })).toBeTruthy();
        expect(t("possibleCount", { count })).toBeTruthy();
      }
      expect(t("rowBlocked", { title: "Educational Research" })).toContain("Educational Research");
      expect(t("rowStrong", { title: "Educational Research", score: 88 })).toContain("88");
      expect(t("rowPossible", { title: "Educational Research", score: 72 })).toContain("72");
      expect(t("rowBatch", { row: 12 })).toContain("12");
    });

    it("formats the upload form's own duplicate errors", () => {
      const t = createTranslator({ locale, messages, namespace: "adminUpload.single" });
      expect(t("err.duplicateFile", { title: "Educational Research" })).toContain(
        "Educational Research",
      );
      expect(t("err.duplicateIsbn", { title: "Educational Research" })).toContain(
        "Educational Research",
      );
      for (const key of ["statusBlocked", "statusOverride", "field.authorHint", "field.isbnValid", "field.isbnInvalid"] as const) {
        expect(t(key), key).toBeTruthy();
      }
    });
  });
}
