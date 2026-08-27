// Formats every parameterised message the duplicate workspace renders, in
// both catalogues.
//
// lib/i18n-parity.test.ts proves the Khmer key EXISTS; it cannot prove the
// string parses. A malformed ICU argument (a stray brace, a plural clause that
// forgets `other`) is valid JSON and only throws when the component renders it
// — on the Khmer admin panel, which nothing else in the suite exercises.

import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import km from "@/messages/km.json";

describe("adminDuplicates messages", () => {
  for (const [locale, messages] of [
    ["en", en],
    ["km", km],
  ] as const) {
    it(`formats every parameterised message in ${locale}`, () => {
      const t = createTranslator({ locale, messages, namespace: "adminDuplicates" });

      expect(t("records", { count: 1 })).toBeTruthy();
      expect(t("records", { count: 3 })).toBeTruthy();
      expect(t("noResults.description", { total: 1 })).toBeTruthy();
      expect(t("noResults.description", { total: 7 })).toBeTruthy();
      expect(t("filters.showing", { shown: 2, total: 9 })).toBeTruthy();
      expect(t("canonical.keepThis", { title: "Educational Research" })).toContain(
        "Educational Research",
      );
      expect(t("meta.isbn", { value: "9780132689637" })).toContain("9780132689637");
      expect(t("meta.pages", { count: 320 })).toBeTruthy();
      expect(t("meta.size", { size: 8205 })).toBeTruthy();
      expect(t("meta.added", { date: "4 Jan 2024" })).toBeTruthy();
      expect(t("retireDialog.lead", { title: "Educational Research" })).toContain(
        "Educational Research",
      );
      expect(t("toasts.retired", { from: "old-slug", to: "kept-slug" })).toContain("kept-slug");
    });

    it(`names all seven detector signals and all three tiers in ${locale}`, () => {
      const t = createTranslator({ locale, messages, namespace: "adminDuplicates" });
      for (const signal of [
        "isbn",
        "content-hash",
        "file-size",
        "title",
        "author",
        "year",
        "title-prefix",
      ]) {
        expect(t(`signals.${signal}` as never), signal).toBeTruthy();
      }
      for (const tier of ["high", "medium", "low"]) {
        expect(t(`confidence.${tier}` as never), tier).toBeTruthy();
        expect(t(`confidenceShort.${tier}` as never), tier).toBeTruthy();
      }
    });
  }
});
