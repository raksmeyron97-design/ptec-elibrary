import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { journalSitemapPaths, type SitemapJournal } from "@/lib/journals/sitemap";

const j = (id: string, slug: string, over: Partial<SitemapJournal> = {}): SitemapJournal => ({
  id, slug, is_published: true, is_indexable: true, updated_at: "2025-01-01T00:00:00Z", ...over,
});

describe("journalSitemapPaths — the pages' own robots rule, stated once", () => {
  const journals = [j("1", "cjte"), j("2", "empty"), j("3", "hidden", { is_indexable: false }), j("4", "draft", { is_published: false })];
  const articles = [
    { journal_id: "1", updated_at: "2025-06-18T00:00:00Z" },
    { journal_id: "3", updated_at: null },
    { journal_id: "4", updated_at: null },
    { journal_id: null, updated_at: null },
  ];
  const issues = [
    { slug: "cjte/vol-7-issue-2", journal_id: "1" },
    { slug: "cjte/vol-6-issue-3", journal_id: "1" },
  ];

  it("advertises a published, indexable journal with articles, its issue list, and its public issues", () => {
    expect(journalSitemapPaths(journals, articles, issues).map((p) => p.path)).toEqual([
      "/journals/cjte",
      "/journals/cjte/issues",
      "/journals/cjte/issues/vol-6-issue-3",
      "/journals/cjte/issues/vol-7-issue-2",
    ]);
  });

  it("never advertises an empty, non-indexable or unpublished journal", () => {
    const paths = journalSitemapPaths(journals, articles, issues).map((p) => p.path).join(" ");
    for (const s of ["empty", "hidden", "draft"]) expect(paths).not.toContain(`/journals/${s}`);
  });

  it("carries the newest article date as the journal lastmod", () => {
    expect(journalSitemapPaths(journals, articles, issues)[0].lastModified).toBe("2025-06-18T00:00:00Z");
  });

  it("an unknown journal read (null) yields no journal URLs — it is not 'no journals'", () => {
    expect(journalSitemapPaths(null, articles, issues)).toEqual([]);
  });

  it("an unknown issue read keeps the journal URL and drops only issue URLs", () => {
    expect(journalSitemapPaths(journals, articles, null).map((p) => p.path)).toEqual(["/journals/cjte"]);
  });

  it("the sitemap keeps article URLs independent of the journal read, and the hub gated on its count", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", "..", "app", "sitemap.ts"), "utf8");
    expect(src).toContain("entry(articlePath(p.slug)");
    expect(src).toContain("journalSitemapPaths(");
    expect(src).toContain("hub('/journals', publications.length");
    expect(src).not.toMatch(/['"`]\/publications/);
  });
});
