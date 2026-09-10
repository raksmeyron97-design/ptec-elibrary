import { test, expect } from "@playwright/test";
import {
  SUBJECT_SLUG_REDIRECTS,
  LEGACY_SUBJECT_SLUG,
} from "../lib/seo/subject-slug-redirects";

/**
 * The nine retired `book-<epoch>` subject URLs.
 *
 * Migration 0142 replaced those generated slugs with the Khmer slug the app
 * mints today. They hold ~200 of the library's 270 published books and were
 * indexed and sitemap-advertised, so the old URLs must 301 rather than 404.
 *
 * These redirects come from next.config.ts, which runs BEFORE middleware — so
 * they are a property of the deployment, not of the database. That is exactly
 * why they can be asserted here against a seeded stack that has never held
 * those categories: the 301 and its Location header are correct regardless of
 * what the target resolves to.
 */

const localeCases = SUBJECT_SLUG_REDIRECTS.flatMap((r) =>
  ["", "/km"].map((prefix) => ({ prefix, ...r })),
);

test.describe("retired subject slugs 301 to their Khmer slug", () => {
  for (const { prefix, from, to, name } of localeCases) {
    test(`${prefix || "/"}…/subjects/${from} → ${to}`, async ({ request }) => {
      const res = await request.get(`${prefix}/subjects/${from}`, { maxRedirects: 0 });

      // 301, not Next's default 308 for `permanent: true` — every other retired
      // URL in this app (legacy /theses/<uuid>, the /en strip, retired catalog
      // slugs) answers 301.
      expect(res.status()).toBe(301);

      const location = res.headers()["location"];
      expect(location, `no Location header for ${from}`).toBeTruthy();

      // Compare decoded: the target is Khmer and the header is percent-encoded.
      const pathname = new URL(location, "https://library.ptec.edu.kh").pathname;
      expect(decodeURIComponent(pathname)).toBe(`${prefix}/subjects/${to}`);

      // A redirect must not cross locales.
      expect(pathname.startsWith("/km/")).toBe(prefix === "/km");

      // …and must never land on another retired slug (no chains).
      expect(LEGACY_SUBJECT_SLUG.test(to), `${name} redirects to another generated slug`).toBe(
        false,
      );
    });
  }
});

test.describe("the redirect is a single hop", () => {
  // A chain burns crawl budget and dilutes the signal the 301 exists to carry.
  for (const { from } of SUBJECT_SLUG_REDIRECTS.slice(0, 3)) {
    test(`/subjects/${from} resolves in exactly one redirect`, async ({ request }) => {
      const first = await request.get(`/subjects/${from}`, { maxRedirects: 0 });
      expect(first.status()).toBe(301);

      const next = await request.get(first.headers()["location"], { maxRedirects: 0 });
      expect(
        next.status(),
        "the redirect target itself redirects — that is a chain, not a hop",
      ).not.toBe(301);
      expect(next.status()).not.toBe(308);
    });
  }
});

test.describe("only the retired slugs are redirected", () => {
  test("a live Khmer subject slug is served, not redirected", async ({ request }) => {
    const res = await request.get(`/subjects/${SUBJECT_SLUG_REDIRECTS[0].to}`, {
      maxRedirects: 0,
    });
    expect([200, 404]).toContain(res.status());
  });

  test("an unrelated book-prefixed slug is not caught by a stray wildcard", async ({ request }) => {
    // The rules are nine exact paths, not a `/subjects/book-:id` pattern — a
    // pattern would capture any future category that legitimately starts with
    // "book-" and redirect it to a slug that does not exist.
    const res = await request.get("/subjects/book-9999999999999", { maxRedirects: 0 });
    expect(res.status()).not.toBe(301);
  });
});
