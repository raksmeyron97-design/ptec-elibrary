// lib/books/language.test.ts
//
// The fixtures are the FIVE spellings production actually held on 2026-09-13,
// not a plausible set. `kh` is the one that mattered: it is not the ISO code
// for Khmer, nothing in the code recognised it, and it silently stripped
// `inLanguage` from 35 published books.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BOOK_LANGUAGES,
  bookLanguageCode,
  isCanonicalBookLanguage,
  normalizeBookLanguage,
} from "@/lib/books/language";
import { languageCode } from "@/lib/seo/book-seo";

/** Every value in production, with its count, on the day this was written. */
const PRODUCTION_VALUES: Array<[value: string, books: number]> = [
  ["Khmer", 157],
  ["English", 102],
  ["kh", 35],
  ["en", 1],
  ["khmer", 1],
];

describe("every spelling production holds resolves", () => {
  it.each(PRODUCTION_VALUES)("%s (%i books) gets a BCP-47 code", (value) => {
    expect(bookLanguageCode(value)).toBeDefined();
  });

  it.each(PRODUCTION_VALUES)("%s (%i books) gets a canonical spelling", (value) => {
    expect(BOOK_LANGUAGES).toContain(normalizeBookLanguage(value) as never);
  });

  it("collapses five stored spellings to two languages", () => {
    const canonical = new Set(PRODUCTION_VALUES.map(([v]) => normalizeBookLanguage(v)));
    expect([...canonical].sort()).toEqual(["English", "Khmer"]);
  });

  it("REGRESSION: `kh` is not ISO for Khmer, and must still resolve", () => {
    // The 35-book defect. `km` is the real code; `kh` is what the import wrote.
    expect(normalizeBookLanguage("kh")).toBe("Khmer");
    expect(bookLanguageCode("kh")).toBe("km");
  });
});

describe("the SEO builder and the vocabulary cannot drift", () => {
  it("languageCode() delegates rather than keeping its own table", () => {
    for (const [value] of PRODUCTION_VALUES) {
      expect(languageCode(value)).toBe(bookLanguageCode(value));
    }
    expect(languageCode("French")).toBe(bookLanguageCode("French"));
  });

  it("lib/seo/book-seo.ts holds no private language map", () => {
    const src = readFileSync(join(process.cwd(), "lib/seo/book-seo.ts"), "utf8");
    expect(
      /khmer:\s*["']km["']/.test(src),
      "book-seo.ts has re-grown its own language table — that is the defect",
    ).toBe(false);
  });
});

describe("an unrecognised language survives", () => {
  it("keeps the original spelling rather than defaulting", () => {
    // Folding the unknown into a default is how a book comes to claim a
    // language nobody recorded.
    expect(normalizeBookLanguage("Tagalog")).toBe("Tagalog");
    expect(normalizeBookLanguage("  Tagalog  ")).toBe("Tagalog");
  });

  it("omits the code rather than guessing one", () => {
    expect(bookLanguageCode("Tagalog")).toBeUndefined();
  });

  it("still codes a language the catalogue importer knows", () => {
    expect(bookLanguageCode("French")).toBe("fr");
    expect(bookLanguageCode("ចិន")).toBe("zh");
  });

  it("treats empty as absent, never as a default", () => {
    for (const empty of [null, undefined, "", "   "]) {
      expect(normalizeBookLanguage(empty)).toBeNull();
      expect(bookLanguageCode(empty)).toBeUndefined();
    }
  });
});

describe("the migration and the application agree", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/0145_books_language_normalization.sql"),
    "utf8",
  );

  /** The lowercase aliases each UPDATE statement rewrites. */
  function aliasesFor(target: "Khmer" | "English"): string[] {
    const stmt = sql.slice(sql.indexOf(`set language = '${target}'`));
    const list = stmt.slice(stmt.indexOf("in ("), stmt.indexOf(")", stmt.indexOf("in (")));
    return [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  }

  it("every alias the SQL rewrites, the TypeScript also resolves", () => {
    // If these drift, a row the migration "fixed" is one the app cannot read.
    for (const target of ["Khmer", "English"] as const) {
      for (const alias of aliasesFor(target)) {
        expect(normalizeBookLanguage(alias), `SQL maps "${alias}" to ${target}`).toBe(target);
      }
    }
  });

  it("covers every spelling production actually held", () => {
    const all = [...aliasesFor("Khmer"), ...aliasesFor("English")];
    for (const [value] of PRODUCTION_VALUES) {
      if (isCanonicalBookLanguage(value)) continue; // already canonical, no UPDATE needed
      expect(all, `production holds "${value}"`).toContain(value.toLowerCase());
    }
  });

  it("rewrites nothing outside the vocabulary", () => {
    // The migration must REPORT unknown values, not fold them into a default.
    expect(sql).toMatch(/not in \('Khmer', 'English'\)/);
    expect(sql).toMatch(/reported, not rewritten/i);
  });
});
