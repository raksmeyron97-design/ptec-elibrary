import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { chosenValues, classifyLookup, editionGroups, fetchPreview, NO_TRUSTED_FIELDS } from "./fetch-review";
import type { IsbnCandidate, ProviderOutcome } from "./types";
import type { CurrentRecord } from "./enrich";

const cand = (over: Partial<IsbnCandidate>): IsbnCandidate => ({
  provider: "open_library", providerRecordId: "x", title: "Visible Learning", subtitle: null, authors: [], publisher: null,
  year: null, language: null, pageCount: null, edition: null, subjects: [], description: null, coverSource: null,
  isbn13: "9780415476188", isbn10: null, ...over,
});
const empty: CurrentRecord = { description: "", publisher: "", year: "", language: "en", keywords: [], coverIsGenerated: true };
const found = (n = 1): ProviderOutcome[] => [
  { provider: "open_library", status: "found", count: n, cached: false },
  { provider: "google_books", status: "not_found", cached: false },
];

describe("editions", () => {
  it("one ISBN, two publishers or years → two choices", () => {
    const g = editionGroups([cand({ publisher: "Routledge", year: 2009 }), cand({ provider: "google_books", publisher: "Routledge", year: 2012 })]);
    expect(g).toHaveLength(2);
  });
  it("the same edition from both providers is one choice (case and spacing ignored)", () => {
    expect(editionGroups([cand({ publisher: "Routledge", year: 2009 }), cand({ provider: "google_books", publisher: " routledge ", year: 2009 })])).toHaveLength(1);
  });
  it("a candidate that states no edition never makes a lookup ambiguous — it joins every group", () => {
    const g = editionGroups([cand({ publisher: "Routledge", year: 2009 }), cand({ provider: "google_books", description: "About feedback." })]);
    expect(g).toHaveLength(1);
    expect(g[0].candidates).toHaveLength(2);
  });
});

describe("what the lookup came to", () => {
  it("found / ambiguous / mismatch / not found / incomplete", () => {
    expect(classifyLookup("Visible learning", [cand({})], found())).toEqual({ kind: "found", partial: false });
    expect(classifyLookup("Visible learning", [cand({ year: 2009, publisher: "A" }), cand({ year: 2012, publisher: "A" })], found(2)).kind).toBe("ambiguous");
    expect(classifyLookup("Strategic management for school development", [cand({ title: "Educational management today" })], found()).kind).toBe("mismatch");
    expect(classifyLookup("x", [], [{ provider: "open_library", status: "not_found", cached: false }])).toEqual({ kind: "not_found" });
    expect(classifyLookup("x", [], [{ provider: "open_library", status: "error", kind: "timeout", message: "" }])).toEqual({ kind: "incomplete" });
  });
  it("found with a failed provider is partial, not complete", () => {
    expect(classifyLookup("Visible learning", [cand({})], [{ provider: "open_library", status: "found", count: 1, cached: true }, { provider: "google_books", status: "error", kind: "quota", message: "" }])).toEqual({ kind: "found", partial: true });
  });
});

describe("the preview", () => {
  it("empty fields are safe and ticked; differing values need review and are not ticked", () => {
    const p = fetchPreview({ ...empty, publisher: "Other" }, [cand({ publisher: "Routledge", year: 2009, description: "Synthesis of 800 meta-analyses relating to achievement." })])!;
    expect(p.safe.map((i) => [i.field, i.preselected])).toEqual([["description", true], ["year", true]]);
    expect(p.review.map((i) => [i.field, i.current, i.found, i.preselected])).toEqual([["publisher", "Other", "Routledge", false]]);
    expect(p.noTrusted).toEqual(NO_TRUSTED_FIELDS);
  });
  it("only what is ticked is applied, with its provider", () => {
    const p = fetchPreview(empty, [cand({ publisher: "Routledge", year: 2009 })])!;
    const { values, sources } = chosenValues(p, new Set(["year"]));
    expect(values).toEqual({ year: "2009" });
    expect(sources).toEqual({ year: "open_library" });
  });
});

describe("the two lookup steps are guarded server actions that write nothing", () => {
  const src = readFileSync(path.resolve(__dirname, "../../app/(admin)/admin/(protected)/catalogs/isbn-actions.ts"), "utf8");
  for (const fn of ["checkIsbnIdentity", "lookupIsbnProviders"]) {
    it(`${fn}: permission, then rate limit, then work`, () => {
      const body = src.slice(src.indexOf(`export async function ${fn}`));
      const guard = body.indexOf('requirePermission("catalog", "write")');
      const limit = body.indexOf("rateLimit(");
      const work = body.search(/\.from\(|lookupIsbnMetadata\(/);
      expect(guard).toBeGreaterThan(-1);
      expect(limit).toBeGreaterThan(guard);
      expect(work).toBeGreaterThan(limit);
    });
  }
  it("no lookup step writes a catalogue record", () => {
    expect(src).not.toMatch(/from\("catalog_books"\)\s*\.(insert|update|upsert|delete)/);
  });
});
