import { describe, it, expect } from "vitest";
import { buildRecentActivity } from "./recent-activity";

describe("buildRecentActivity", () => {
  it("merges opened/saved/downloaded events from real rows only", () => {
    const result = buildRecentActivity({
      progress: [
        { last_read_at: "2026-08-20T10:00:00Z", books: { slug: "book-a", title: "Book A" } },
      ],
      savedBooks: [
        { slug: "book-b", title: "Book B", savedAt: "2026-08-21T10:00:00Z" },
      ],
      downloadHistory: [
        { slug: "book-c", title: "Book C", downloadedAt: "2026-08-22T10:00:00Z" },
      ],
    });

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.type)).toEqual(["downloaded", "saved", "opened"]);
  });

  it("sorts strictly descending by occurredAt across all sources", () => {
    const result = buildRecentActivity({
      progress: [
        { last_read_at: "2026-08-01T00:00:00Z", books: { slug: "old", title: "Old" } },
        { last_read_at: "2026-08-25T00:00:00Z", books: { slug: "new", title: "New" } },
      ],
      savedBooks: [
        { slug: "mid", title: "Mid", savedAt: "2026-08-15T00:00:00Z" },
      ],
      downloadHistory: [],
    });

    expect(result.map((r) => r.slug)).toEqual(["new", "mid", "old"]);
  });

  it("caps output to the given limit", () => {
    const progress = Array.from({ length: 10 }, (_, i) => ({
      last_read_at: `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      books: { slug: `book-${i}`, title: `Book ${i}` },
    }));

    const result = buildRecentActivity({ progress, savedBooks: [], downloadHistory: [] }, 3);
    expect(result).toHaveLength(3);
    // Highest dates (day 10, 09, 08) win.
    expect(result.map((r) => r.slug)).toEqual(["book-9", "book-8", "book-7"]);
  });

  it("defaults to a limit of 6 when none is given", () => {
    const progress = Array.from({ length: 10 }, (_, i) => ({
      last_read_at: `2026-08-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      books: { slug: `book-${i}`, title: `Book ${i}` },
    }));

    const result = buildRecentActivity({ progress, savedBooks: [], downloadHistory: [] });
    expect(result).toHaveLength(6);
  });

  it("never fabricates an event: skips rows missing a timestamp or resource", () => {
    const result = buildRecentActivity({
      progress: [
        { last_read_at: null, books: { slug: "no-timestamp", title: "No timestamp" } },
        { last_read_at: "2026-08-20T00:00:00Z", books: null },
      ],
      savedBooks: [
        { slug: "", title: "Empty slug", savedAt: "2026-08-20T00:00:00Z" },
      ],
      downloadHistory: [
        { slug: "dl", title: "Download", downloadedAt: null },
      ],
    });

    expect(result).toHaveLength(0);
  });

  it("keeps two distinct events for a book that was both saved and opened", () => {
    const result = buildRecentActivity({
      progress: [
        { last_read_at: "2026-08-20T00:00:00Z", books: { slug: "book-a", title: "Book A" } },
      ],
      savedBooks: [
        { slug: "book-a", title: "Book A", savedAt: "2026-08-21T00:00:00Z" },
      ],
      downloadHistory: [],
    });

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.slug === "book-a")).toBe(true);
    expect(new Set(result.map((r) => r.type)).size).toBe(2);
  });

  it("returns an empty array when there is no history at all", () => {
    const result = buildRecentActivity({ progress: [], savedBooks: [], downloadHistory: [] });
    expect(result).toEqual([]);
  });
});
