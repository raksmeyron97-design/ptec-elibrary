import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  matchingText,
  parseQueueTab,
  parseTarget,
  redirectReason,
  isGoneReason,
  suggestSuccessors,
  targetFromInput,
  type Candidate,
} from "@/lib/url-redirects/queue";
import { chunkByEncodedLength } from "@/lib/url-redirects/resolved";

const LIVE: Candidate[] = [
  { path: "/books/effective-school-management-4th-edition", title: "Effective School Management (4th Edition)" },
  { path: "/books/interviewing-as-qualitative-research-3rd-edition", title: "Interviewing as Qualitative Research, 3rd Edition" },
  { path: "/books/ថ្នាក់ទី៩-សិក្សាសង្គម", title: "ថ្នាក់ទី៩ សិក្សាសង្គម" },
  { path: "/books/research-methods-in-education", title: "Research Methods in Education" },
  { path: "/theses/reading-fluency-grade-3", title: "Reading Fluency in Grade 3" },
];

describe("suggestSuccessors", () => {
  it("suggests an exact title match first, at 100", () => {
    const row = { path: "/books/old-slug", title: "Research Methods in Education" };
    const [best] = suggestSuccessors(row, LIVE);
    expect(best).toMatchObject({ path: "/books/research-methods-in-education", score: 100, basis: "same_title" });
  });

  it("matches a seeded row (no title) on the words of its own slug — the re-created next edition", () => {
    const row = { path: "/books/effective-school-management", title: null };
    expect(matchingText(row)).toBe("effective school management");
    expect(suggestSuccessors(row, LIVE)[0]).toMatchObject({
      path: "/books/effective-school-management-4th-edition",
      basis: "other_edition",
    });
  });

  it("reads an edition that kept extra words as the same work (three words or more)", () => {
    const row = { path: "/books/doing-data-analysis-with-spss", title: null };
    const live = [{ path: "/books/spss-18", title: "Doing Data Analysis with SPSS Version 18, 5th Edition" }];
    expect(suggestSuccessors(row, live)[0]).toMatchObject({ path: "/books/spss-18", basis: "other_edition" });
  });

  it("does not read a two-word title as the start of every longer one", () => {
    const row = { path: "/books/qualitative-research", title: null };
    const live = [{ path: "/books/qrm", title: "Qualitative Research Methods for the Social Sciences" }];
    expect(suggestSuccessors(row, live)).toEqual([]);
  });

  it("does not take another volume for the same book", () => {
    const row = { path: "/books/research-methods-in-education-2", title: null };
    expect(suggestSuccessors(row, LIVE)).toEqual([]);
  });

  it("matches a Khmer seeded row whose slug carries a typo", () => {
    const row = { path: "/books/ថ្នាក់ទី៩-សិក្ាសង្គម", title: null };
    const suggestions = suggestSuccessors(row, LIVE);
    expect(suggestions[0]).toMatchObject({ path: "/books/ថ្នាក់ទី៩-សិក្សាសង្គម", basis: "similar_title" });
  });

  it("does not suggest an unrelated title", () => {
    const row = { path: "/books/x", title: "Operations Research: An Introduction" };
    expect(suggestSuccessors(row, LIVE)).toEqual([]);
  });

  it("never suggests the row's own path", () => {
    const row = { path: "/books/research-methods-in-education", title: "Research Methods in Education" };
    expect(suggestSuccessors(row, LIVE).map((s) => s.path)).not.toContain(row.path);
  });

  it("returns at most three", () => {
    const many: Candidate[] = Array.from({ length: 6 }, (_, i) => ({ path: `/books/same-${i}`, title: "Same Title" }));
    expect(suggestSuccessors({ path: "/books/old", title: "Same Title" }, many)).toHaveLength(3);
  });
});

describe("parseTarget / targetFromInput", () => {
  it("accepts a book, thesis or subject path", () => {
    expect(parseTarget("/books/a")).toEqual({ collection: "books", slug: "a" });
    expect(parseTarget("/theses/b")).toEqual({ collection: "theses", slug: "b" });
    expect(parseTarget("/subjects/វិទ្យាសាស្ត្រ")).toEqual({ collection: "subjects", slug: "វិទ្យាសាស្ត្រ" });
  });

  it("refuses everything else", () => {
    for (const bad of ["/posts/a", "/books", "/books/a/b", "books/a", "https://x/books/a", "/books/a?x=1"]) {
      expect(parseTarget(bad), bad).toBeNull();
    }
  });

  it("turns a pasted URL — /km, encoded, trailing slash — into the stored path", () => {
    const encoded = encodeURIComponent("ថ្នាក់ទី៩-សិក្សាសង្គម");
    expect(targetFromInput(`https://library.ptec.edu.kh/km/books/${encoded}/`)).toBe("/books/ថ្នាក់ទី៩-សិក្សាសង្គម");
    expect(targetFromInput("/theses/reading-fluency-grade-3")).toBe("/theses/reading-fluency-grade-3");
  });

  it("refuses free text, other collections and malformed escapes", () => {
    expect(targetFromInput("research methods")).toBeNull();
    expect(targetFromInput("https://library.ptec.edu.kh/posts/x")).toBeNull();
    expect(targetFromInput("/books/%E0%A4")).toBeNull();
  });
});

describe("reasons", () => {
  it("infers a collection move and otherwise keeps an allowed choice", () => {
    expect(redirectReason("/books/a", "/theses/b", "typo_fix")).toBe("collection_move");
    expect(redirectReason("/books/a", "/books/b", "typo_fix")).toBe("typo_fix");
    expect(redirectReason("/books/a", "/books/b", "rights_removal")).toBe("manual");
    expect(redirectReason("/books/a", "/books/b")).toBe("manual");
  });

  it("only two removal reasons exist", () => {
    expect(isGoneReason("withdrawn")).toBe(true);
    expect(isGoneReason("rights_removal")).toBe(true);
    expect(isGoneReason("manual")).toBe(false);
    expect(isGoneReason(undefined)).toBe(false);
  });

  it("the tab parser defaults to pending", () => {
    expect(parseQueueTab(undefined)).toBe("pending");
    expect(parseQueueTab("redirects")).toBe("redirects");
    expect(parseQueueTab("nonsense")).toBe("pending");
  });
});

describe("chunkByEncodedLength", () => {
  it("keeps every value and respects the budget", () => {
    const khmer = Array.from({ length: 60 }, (_, i) => `ថ្នាក់ទី${i}-សិក្សាសង្គម-កម្មវិធីសិក្សាលម្អិត`);
    const chunks = chunkByEncodedLength(khmer, 3000);
    expect(chunks.flat()).toEqual(khmer);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const cost = chunk.reduce((n, v) => n + encodeURIComponent(v).length + 3, 0);
      expect(cost).toBeLessThanOrEqual(3000);
    }
  });

  it("never drops a single value larger than the budget", () => {
    expect(chunkByEncodedLength(["x".repeat(5000)], 100)).toEqual([["x".repeat(5000)]]);
  });

  it("an empty list is no chunks", () => {
    expect(chunkByEncodedLength([])).toEqual([]);
  });
});

import { pathFromInput } from "@/lib/url-redirects/queue";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("pathFromInput — the old URL of a hand-added redirect", () => {
  it("accepts any stored-shape path, from a URL, a /km path or an encoded path", () => {
    expect(pathFromInput("https://library.ptec.edu.kh/km/subjects/%E1%9E%80%E1%9E%89")).toBe("/subjects/កញ");
    expect(pathFromInput("/journals/articles/old-slug/")).toBe("/journals/articles/old-slug");
  });

  it("refuses what is not a path we store", () => {
    for (const bad of ["", "subjects/x", "/", "/Subjects/x", "https://x/%E0%A4"]) expect(pathFromInput(bad), bad).toBeNull();
  });
});

describe("addUrlRedirect — the counterpart of delete", () => {
  const src = readFileSync(path.resolve(__dirname, "../../app/actions/retired-urls.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function addUrlRedirect("), src.indexOf("export type RedirectTargetOption"));

  it("is gated admin-only before it reads or writes, and writes only through the RPC", () => {
    const gate = body.indexOf('open("books.retiredUrls.addRedirect")');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(body.indexOf("isLive("));
    expect(gate).toBeLessThan(body.indexOf('rpc("upsert_url_redirect"'));
    expect(body).not.toMatch(/from\("url_redirects"\)\s*\.(insert|upsert|update)/);
  });

  it("re-checks both ends on the server and audits the path and target only", () => {
    expect(body).toContain('code: "path_is_live"');
    expect(body).toContain('code: "target_not_live"');
    expect(body).toMatch(/logAdminAction\(user\.id, "url\.redirect_add", "url_redirects", undefined, \{ path, target \}\)/);
  });
});
