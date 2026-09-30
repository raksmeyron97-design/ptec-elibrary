import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fulltextValidators, isNotModified } from "./validators";

const ROOT = path.resolve(__dirname, "../..");

describe("fulltextValidators", () => {
  it("a stored content hash is a strong ETag", () => {
    expect(fulltextValidators({ contentHash: "abc123", fileUrl: "u" }).etag).toBe('"abc123"');
  });
  it("without a hash the ETag is weak and changes with the file or the record", () => {
    const a = fulltextValidators({ fileUrl: "https://s/a.pdf", updatedAt: "2026-09-30T00:00:00Z" }).etag!;
    expect(a.startsWith('W/"')).toBe(true);
    expect(fulltextValidators({ fileUrl: "https://s/b.pdf", updatedAt: "2026-09-30T00:00:00Z" }).etag).not.toBe(a);
    expect(fulltextValidators({ fileUrl: "https://s/a.pdf", updatedAt: "2026-10-01T00:00:00Z" }).etag).not.toBe(a);
  });
  it("Last-Modified is the record's update time, or absent", () => {
    expect(fulltextValidators({ fileUrl: "u", updatedAt: "2026-09-30T12:00:00Z" }).lastModified).toBe(
      "Wed, 30 Sep 2026 12:00:00 GMT",
    );
    expect(fulltextValidators({ fileUrl: "u", updatedAt: "not a date" }).lastModified).toBeNull();
  });
});

describe("isNotModified", () => {
  const v = fulltextValidators({ contentHash: "abc", fileUrl: "u", updatedAt: "2026-09-30T12:00:00Z" });
  it("matches an If-None-Match, weak or strong, among several", () => {
    expect(isNotModified(new Headers({ "if-none-match": '"x", W/"abc"' }), v)).toBe(true);
    expect(isNotModified(new Headers({ "if-none-match": '"other"' }), v)).toBe(false);
  });
  it("uses If-Modified-Since only when no If-None-Match was sent", () => {
    expect(isNotModified(new Headers({ "if-modified-since": "Wed, 30 Sep 2026 12:00:00 GMT" }), v)).toBe(true);
    expect(isNotModified(new Headers({ "if-modified-since": "Tue, 29 Sep 2026 12:00:00 GMT" }), v)).toBe(false);
    expect(
      isNotModified(new Headers({ "if-none-match": '"other"', "if-modified-since": "Thu, 01 Oct 2026 00:00:00 GMT" }), v),
    ).toBe(false);
  });
  it("an unconditional request is never a 304", () => {
    expect(isNotModified(new Headers(), v)).toBe(false);
  });
});

describe("the thesis full-text route", () => {
  const route = readFileSync(path.join(ROOT, "app/[locale]/(public)/theses/[slug]/fulltext.pdf/route.ts"), "utf8");
  it("lives in the abstract page's directory, outside /api/", () => {
    expect(route).toBeTruthy();
  });
  it("decides openness with the one rule before any byte is served", () => {
    const gate = route.indexOf("thesisIsOpenAccess(row)");
    const serve = route.indexOf("servePublicPdf(");
    expect(gate).toBeGreaterThan(-1);
    expect(serve).toBeGreaterThan(gate);
  });
  it("has no crawler-only exception (D12)", () => {
    expect(route).not.toMatch(/isVerifiedGoogleCrawler|user-agent|googlebot/i);
  });
  it("middleware routes it through the locale rewrite instead of the static-file bypass", () => {
    const mw = readFileSync(path.join(ROOT, "middleware.ts"), "utf8");
    expect(mw).toMatch(/FULLTEXT_PATH_RE/);
    const re = /^(?:\/km)?\/(?:theses|journals\/articles)\/[^/]+\/fulltext\.pdf$/;
    expect(re.test("/theses/a-thesis/fulltext.pdf")).toBe(true);
    expect(re.test("/km/journals/articles/an-article/fulltext.pdf")).toBe(true);
    expect(re.test("/pdf/pdf.worker.min.mjs")).toBe(false);
  });
});
