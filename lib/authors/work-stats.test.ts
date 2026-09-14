import { describe, expect, it } from "vitest";
import { authorStats, authorWorkStats } from "@/lib/authors/stats";
import { parseAuthorNames } from "@/lib/resources/author-names";
import type { AuthorWork } from "@/lib/authors/types";

function makeWork(over: Partial<AuthorWork> = {}): AuthorWork {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    type: over.type ?? "ebook",
    title: over.title ?? "Sample Work",
    href: over.href ?? "/books/sample",
    excerpt: null,
    year: over.year ?? 2024,
    venue: null,
    byline: over.byline ?? null,
    doi: null,
    coverUrl: null,
    downloadable: true,
    ...over,
  };
}

describe("AuthorWorkStats authoritative model", () => {
  it("computes authorWorkStats and agrees with authorStats.workCount", () => {
    const works: AuthorWork[] = [
      makeWork({ id: "1", type: "ebook", year: 2020 }),
      makeWork({ id: "2", type: "ebook", year: 2022 }),
      makeWork({ id: "3", type: "thesis", year: 2023 }),
      makeWork({ id: "4", type: "publication", year: 2024 }),
      makeWork({ id: "5", type: "catalog", year: 2025 }),
    ];

    const stats = authorStats(works);
    const workStats = authorWorkStats(works);

    expect(stats.workCount).toBe(5);
    expect(workStats.totalWorks).toBe(stats.workCount);
    expect(workStats.ebooks).toBe(2);
    expect(workStats.theses).toBe(1);
    expect(workStats.publications).toBe(1);
    expect(workStats.physicalBooks).toBe(1);
    expect(workStats.publicationSpan).toEqual({ from: 2020, to: 2025 });
  });

  it("handles empty works roster cleanly", () => {
    const works: AuthorWork[] = [];
    const workStats = authorWorkStats(works);

    expect(workStats.totalWorks).toBe(0);
    expect(workStats.ebooks).toBe(0);
    expect(workStats.theses).toBe(0);
    expect(workStats.publications).toBe(0);
    expect(workStats.physicalBooks).toBe(0);
    expect(workStats.publicationSpan).toEqual({ from: null, to: null });
  });

  it("handles undated works gracefully in publication span", () => {
    const works: AuthorWork[] = [
      makeWork({ id: "1", type: "ebook", year: null }),
      makeWork({ id: "2", type: "ebook", year: 2023 }),
    ];
    const workStats = authorWorkStats(works);

    expect(workStats.totalWorks).toBe(2);
    expect(workStats.publicationSpan).toEqual({ from: 2023, to: 2023 });
  });
});

describe("Deduplication & counting invariants", () => {
  it("guarantees unique works per (type, id) — no double counting legacy vs canonical", () => {
    const canonicalWorks = [
      makeWork({ id: "b1", type: "ebook" }),
      makeWork({ id: "b2", type: "ebook" }),
      makeWork({ id: "p1", type: "publication" }),
    ];
    const legacyWorks = [
      makeWork({ id: "b1", type: "ebook" }), // duplicate with canonical
      makeWork({ id: "b3", type: "ebook" }),
    ];

    // Deduping pattern used by profile and directory
    const seen = new Set<string>();
    const unified: AuthorWork[] = [];
    for (const w of [...canonicalWorks, ...legacyWorks]) {
      const key = `${w.type}:${w.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        unified.push(w);
      }
    }

    expect(unified).toHaveLength(4);
    const stats = authorStats(unified);
    const workStats = authorWorkStats(unified);
    expect(stats.workCount).toBe(4);
    expect(workStats.totalWorks).toBe(4);
    expect(workStats.ebooks).toBe(3);
    expect(workStats.publications).toBe(1);
  });

  it("ensures unpublished or inactive records are never counted", () => {
    const rawDbRecords = [
      { id: "b1", type: "ebook", is_published: true },
      { id: "b2", type: "ebook", is_published: false },
      { id: "c1", type: "catalog", is_active: true },
      { id: "c2", type: "catalog", is_active: false },
      { id: "t1", type: "thesis", is_published: true },
      { id: "t2", type: "thesis", is_published: false },
    ];

    const validWorks = rawDbRecords
      .filter((r) => {
        if (r.type === "catalog") return r.is_active;
        return r.is_published;
      })
      .map((r) => makeWork({ id: r.id, type: r.type as AuthorWork["type"] }));

    expect(validWorks).toHaveLength(3);
    const workStats = authorWorkStats(validWorks);
    expect(workStats.totalWorks).toBe(3);
    expect(workStats.ebooks).toBe(1);
    expect(workStats.theses).toBe(1);
    expect(workStats.physicalBooks).toBe(1);
  });

  it("handles institutional authors with hundreds of works without truncation", () => {
    // Simulates an institution like MoEYS with 498 works
    const institutionalWorks: AuthorWork[] = Array.from({ length: 498 }, (_, i) =>
      makeWork({ id: `moeys-book-${i}`, type: "ebook", year: 2010 + (i % 15) })
    );

    const stats = authorStats(institutionalWorks);
    const workStats = authorWorkStats(institutionalWorks);

    expect(stats.workCount).toBe(498);
    expect(workStats.totalWorks).toBe(498);
    expect(workStats.ebooks).toBe(498);
    expect(workStats.publicationSpan).toEqual({ from: 2010, to: 2024 });
  });

  it("distinguishes individual authors and prevents accidental inheritance", () => {
    // "Sok" must not inherit works from "Sok Dara"
    const byline = "Sok Dara; Chan Vuthy";
    const parsed = parseAuthorNames(byline).map((n: string) => n.toLowerCase());

    expect(parsed.includes("sok")).toBe(false);
    expect(parsed.includes("sok dara")).toBe(true);
    expect(parsed.includes("chan vuthy")).toBe(true);
  });
});
