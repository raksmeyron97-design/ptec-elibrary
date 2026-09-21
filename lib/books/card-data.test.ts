// lib/books/card-data.test.ts
//
// SEO 5.0 / SEO5-09. What a book card is ALLOWED to be handed.
//
// The defect: `BookCard` is a client component and took a whole `Book`, so
// every field it never renders was serialised into the flight payload once
// per card — on a listing page, dozens of times.
//
// The first fix narrowed the prop type and did nothing, and that is the
// reason this file exists. TypeScript's excess-property check fires only on
// object LITERALS; every call site passes a variable, and a `Book` variable
// is structurally assignable to a plain field list. The narrowed interface
// compiled and shipped the same bytes.
//
// So there are now three layers, and each one covers a hole in the others:
//
//   1. the BRAND — a phantom `unique symbol` only lib/books/card-data.ts can
//      mint, which makes a `Book` variable a type error;
//   2. this SCAN — for the two escapes a brand cannot close: a cast, and a
//      call site that never comes through the mapper at all;
//   3. a runtime assertion that the brand is type-only, because a brand that
//      reached the payload would be adding bytes to fix a byte problem.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { toBookCardData, toBookCardList } from "@/lib/books/card-data";

const ROOT = process.cwd();
const CARD_DATA = join(ROOT, "lib/books/card-data.ts");

/**
 * Source with comments and import statements removed.
 *
 * Both halves are load-bearing and both were learned the hard way in this
 * programme: a scan for `toBookCardData` matched the IMPORT line in a file
 * that never called it, and a scan for a forbidden string matched the
 * paragraph explaining why it is forbidden.
 */
function body(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const sourceFiles = ["app", "components", "lib"].flatMap((d) => walk(join(ROOT, d)));
const rel = (f: string) => f.slice(ROOT.length + 1);

/** Files that render the shared book card. */
const cardCallSites = sourceFiles.filter((f) => {
  if (/\.test\.tsx?$/.test(f)) return false;
  const src = readFileSync(f, "utf8");
  // The skeleton is a different component whose name shares the prefix.
  return (
    src.includes('from "@/components/ui/books/BookCard"') &&
    /<BookCard[\s/>]/.test(src)
  );
});

describe("the card's prop type is produced, never asserted", () => {
  it("finds the call sites at all", () => {
    // A scan that matches nothing passes forever. If the import path or the
    // component name changes, this is the assertion that says so.
    expect(cardCallSites.length).toBeGreaterThanOrEqual(8);
  });

  it("every call site goes through the mapper, or inherits the card's own prop type", () => {
    // Two legitimate shapes:
    //   - a SERVER boundary maps its rows with toBookCardData/toBookCardList;
    //   - a pass-through client component declares its prop as
    //     ComponentProps<typeof BookCard>["book"] (or imports BookCardData),
    //     which pushes the obligation up to whoever renders IT.
    const offenders = cardCallSites.filter((f) => {
      const src = body(f);
      const maps = /\btoBookCard(Data|List)\s*\(/.test(src);
      const inherits =
        /ComponentProps<typeof BookCard>\["book"\]/.test(src) ||
        /React\.ComponentProps<typeof BookCard>\["book"\]/.test(src) ||
        /\bBookCardData\b/.test(src);
      return !maps && !inherits;
    });
    expect(offenders.map(rel)).toEqual([]);
  });

  it("nothing outside card-data.ts casts its way to a BookCardData", () => {
    // The brand stops assignment, not assertion. `as BookCardData` and
    // `as unknown as BookCardData` are the way around it, and the way around
    // it is the thing to watch.
    const offenders = sourceFiles.filter(
      (f) => f !== CARD_DATA && /\bas\s+(unknown\s+as\s+)?BookCardData\b/.test(body(f)),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("card-data.ts mints the brand exactly once", () => {
    const src = body(CARD_DATA);
    const casts = src.match(/\bas\s+BookCardData\b/g) ?? [];
    expect(casts.length).toBe(1);
  });
});

describe("the brand is type-only", () => {
  const row = {
    slug: "a-book",
    title: "A Book",
    author: "Someone",
    coverUrl: "https://example.test/c.jpg",
    rating: 4,
    // Fields a Book carries and a card does not render.
    isbn: "9789924000000",
    publisher: "A Publisher",
    pdfUrl: "https://storage.example.test/secret.pdf",
    pages: 240,
    summary: "…",
    tags: ["a", "b"],
  };

  it("adds no own property — enumerable or otherwise", () => {
    const data = toBookCardData(row);
    // Symbol keys survive object spreads and Object.assign, so "no string
    // key" is not the same statement as "nothing was added".
    expect(Object.getOwnPropertySymbols(data)).toEqual([]);
    expect(Reflect.ownKeys(data).every((k) => typeof k === "string")).toBe(true);
  });

  it("serialises to exactly the card's fields, and to no brand", () => {
    const json = JSON.parse(JSON.stringify(toBookCardData(row)));
    expect(Object.keys(json).sort()).toEqual(
      [
        "author",
        "category",
        "cover",
        "coverUrl",
        "createdAt",
        "dbId",
        "department",
        "downloadCount",
        "lastReadAt",
        "progressPct",
        "rating",
        "reviewCount",
        "slug",
        "title",
        "viewCount",
      ].filter((k) => k in json),
    );
    expect(JSON.stringify(json)).not.toMatch(/brand/i);
    expect(JSON.stringify(json)).not.toContain("Symbol(");
  });

  it("is declared, never defined", () => {
    // `declare const` emits nothing. A `const … = Symbol()` would be a real
    // runtime value, and a real value is one refactor away from a real key.
    const src = body(CARD_DATA);
    expect(src).toMatch(/declare const CARD_DATA_BRAND: unique symbol;/);
    expect(src).not.toMatch(/CARD_DATA_BRAND\s*=/);
  });
});

describe("the fields a card may carry", () => {
  const row = {
    slug: "s",
    title: "t",
    author: "a",
    pdfUrl: "https://storage.example.test/secret.pdf",
    fileUrl: "https://storage.example.test/secret.pdf",
    file_url: "https://storage.example.test/secret.pdf",
  };

  it("drops every file address (0131, 0151)", () => {
    // A storage URL in a client payload is a permanent, credential-free,
    // policy-free, unlogged download link. The card has never needed one —
    // and after 0151 a book's file may be catalogue-only, so publishing the
    // address would also be publishing past the gate.
    const json = JSON.stringify(toBookCardData(row));
    expect(json).not.toContain("secret.pdf");
    expect(json).not.toContain("storage.example.test");
  });

  it("declares no file field to drop in the first place", () => {
    const src = body(CARD_DATA);
    expect(src).not.toMatch(/^\s*(pdfUrl|fileUrl|file_url)\??:/m);
  });

  it("maps a list the same way it maps one row", () => {
    expect(toBookCardList([row])).toEqual([toBookCardData(row)]);
  });
});
