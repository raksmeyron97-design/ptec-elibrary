/**
 * The Physical Library's public pages — source rules the Phase 3 redesign
 * depends on and a render test would not catch.
 *
 *   • Search is a real GET form, so it works before the app bundle arrives
 *     (or if it never does). The old bar was a client component whose input
 *     had no `name`: until hydration it submitted nothing, and its only label
 *     was the placeholder.
 *   • A facet count and the result it links to use ONE predicate. The search
 *     path filters in memory with `matchesSelection()`; the browse path filters
 *     in SQL, and must ask the same exact-match question (`.eq`, never the old
 *     substring `ilike` on category, which counted "370" as a category).
 *   • The holdings table does not show barcodes — a desk identifier, not a
 *     reader's. (Presentation only: the column stays API-readable.)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const LIST = "app/[locale]/(public)/catalogs/page.tsx";
const DETAIL = "app/[locale]/(public)/catalogs/[slug]/page.tsx";
const FORM = "components/ui/search/CatalogSearchForm.tsx";

describe("the search form", () => {
  const src = read(FORM);

  it("is next/form with a string action (a GET form the browser can submit on its own)", () => {
    expect(src).toMatch(/import Form from "next\/form"/);
    expect(src).toMatch(/<Form action=\{action\}/);
    expect(src).not.toMatch(/"use client"/);
    expect(src).not.toMatch(/preventDefault|router\.push/);
  });

  it("submits named fields, each with a real label", () => {
    expect(src).toMatch(/name="q"/);
    expect(src).toMatch(/name="in"/);
    for (const id of ["catalog-search-q", "catalog-search-scope"]) {
      expect(src).toContain(`htmlFor="${id}"`);
      expect(src).toContain(`id="${id}"`);
    }
  });

  it("carries the active filters but never the page number", () => {
    expect(src).toMatch(/type="hidden"/);
    const list = read(LIST);
    const keep = list.slice(list.indexOf("keep={{"), list.indexOf("}}", list.indexOf("keep={{")));
    for (const k of ["category", "language", "availability", "sort", "size"]) expect(keep).toContain(`${k}:`);
    expect(keep).not.toContain("page:");
  });

  it("is the listing's only search control", () => {
    const list = read(LIST);
    expect(list).toMatch(/<CatalogSearchForm\s+action=\{basePath\}/);
    expect(list).not.toMatch(/CatalogSearchBar/);
  });
});

describe("facet counts and results share one predicate", () => {
  const src = read(LIST);

  it("the search path filters with matchesSelection, the function that counts", () => {
    expect(src).toMatch(/\.filter\(\(r\) => matchesSelection\(facetPointOf\(r\), o\.sel\)\)/);
  });

  it("the browse path matches category exactly, and language by the spellings the facet folded", () => {
    expect(src).toMatch(/query\.eq\("category", o\.sel\.category\)/);
    expect(src).not.toMatch(/ilike\("category"/);
    // Known code → its fixed spellings; anything else → exact, never spliced.
    expect(src).toMatch(/const spellings = languageSpellings\(o\.sel\.language\)/);
    expect(src).toMatch(/: query\.eq\("language", o\.sel\.language\)/);
    // The selection is canonicalised the same way the facet points are.
    expect(src).toMatch(/language: canonicalLanguage\(params\.language\)/);
  });

  it("a failed read is thrown, not cached as an empty catalogue", () => {
    expect(src).toMatch(/throw new Error\(`\[catalogs\] listing read failed/);
    expect(src).toMatch(/throw new Error\(`\[catalogs\] search failed/);
    expect(src).toMatch(/throw new Error\(`\[catalogs\] facet read failed/);
  });

  it("every browse sort ends in the record id, so pages never overlap", () => {
    expect(src).toMatch(/\.order\(column, \{ ascending: asc \}\)\s*\.order\("id", \{ ascending: true \}\)/);
  });
});

describe("the public record page", () => {
  const src = read(DETAIL);

  it("shows no barcode", () => {
    expect(src).not.toMatch(/copy\.barcode/);
    expect(src).not.toMatch(/detail\.barcode/);
  });

  it("names the listing the same way the listing names itself", () => {
    expect(src).toMatch(/\{ name: t\("title"\), path: "\/catalogs" \}/);
    expect(src).not.toMatch(/Books In Library/);
  });
});

describe("status colour comes from tokens", () => {
  it.each([LIST, DETAIL])("%s has no hand-written emerald", (file) => {
    expect(read(file)).not.toMatch(/emerald-/);
  });
});
