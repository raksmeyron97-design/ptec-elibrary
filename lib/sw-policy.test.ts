import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CACHES,
  MAX_AUTO_CACHE_BYTES,
  PUBLIC_REST_RE,
  USER_OWNED_CACHES,
  isBookFileRequest,
  isCacheableResponse,
  isObsoleteCache,
  isPrivateRequest,
} from "./sw-policy";

const priv = (pathname: string, opts: Partial<{ sameOrigin: boolean; auth: boolean }> = {}) =>
  isPrivateRequest({
    pathname,
    sameOrigin: opts.sameOrigin ?? true,
    hasAuthorizationHeader: opts.auth ?? false,
  });

const res = (status: number, headers: Record<string, string> = {}) => ({
  status,
  headers: {
    get: (n: string) => headers[n.toLowerCase()] ?? null,
  },
});

describe("service worker caching policy", () => {
  // ── The regression that caused ~240 MB of Cache Storage ────────────────────
  describe("book files are never cached automatically", () => {
    it("recognises the PDF-streaming routes that leaked", () => {
      // @serwist/next's defaultCache had a NetworkFirst rule for every
      // same-origin /api GET. /api/books/<id>/file streams a whole book, so
      // simply READING one online stored it — 16 entries x ~15 MB ≈ 240 MB.
      expect(isBookFileRequest({ pathname: "/api/books/abc/file", sameOrigin: true })).toBe(true);
      expect(isBookFileRequest({ pathname: "/api/publications/abc/file", sameOrigin: true })).toBe(true);
      expect(isBookFileRequest({ pathname: "/api/theses/abc/file.pdf", sameOrigin: true })).toBe(true);
    });

    it("recognises large documents on any host", () => {
      for (const ext of ["pdf", "epub", "docx", "pptx", "zip"]) {
        expect(
          isBookFileRequest({ pathname: `/books/whatever.${ext}`, sameOrigin: false }),
          ext,
        ).toBe(true);
      }
    });

    it("the book-file rule is matched BEFORE the private /api rule", () => {
      // Book files live under /api, so the NetworkOnly private rule would claim
      // them first and a downloaded book could never be read back offline —
      // verified: it silently broke offline reading. The book-file rule is safe
      // in front precisely because it cannot write (see the next test).
      const sw = fs.readFileSync(path.join(__dirname, "..", "app/sw.ts"), "utf8");
      const rules = sw.slice(sw.indexOf("const runtimeCaching"));
      expect(rules.indexOf("isBookFileRequest")).toBeLessThan(
        rules.indexOf("isPrivateRequest"),
      );
    });

    it("the worker's book-file rule is READ-ONLY", () => {
      // The one property that actually stops the leak: the handler may serve a
      // previously downloaded book, but may never write one. Downloads happen
      // only via cache.add() from lib/offline.ts, on a button press.
      const sw = fs.readFileSync(path.join(__dirname, "..", "app/sw.ts"), "utf8");
      const rule = sw.slice(
        sw.indexOf("isBookFileRequest({"),
        sw.indexOf("isPrivateRequest({"),
      );
      expect(rule).toContain("cacheWillUpdate: async () => null");
      expect(rule).toContain("RangeRequestsPlugin"); // pdf.js byte-range reads
      expect(rule).toContain("ignoreSearch");        // stored as ?offline=1
    });

    it("the worker no longer spreads serwist's defaultCache", () => {
      // defaultCache ends in catch-alls ("apis", "others", "cross-origin") that
      // cache anything successful. Re-adding it reintroduces the bug.
      const sw = fs
        .readFileSync(path.join(__dirname, "..", "app/sw.ts"), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, ""); // the comments *explain* defaultCache
      expect(sw).not.toContain("defaultCache");
      expect(sw).not.toContain("@serwist/next/worker");
      // …and the final rule must be NetworkOnly, so nothing unlisted is stored.
      const rules = sw.slice(sw.indexOf("const runtimeCaching"), sw.indexOf("const serwist"));
      const last = rules.lastIndexOf("handler:");
      expect(rules.slice(last)).toContain("NetworkOnly");
    });
  });

  // ── Private data must never enter Cache Storage ────────────────────────────
  describe("private routes are NetworkOnly", () => {
    it.each([
      "/api/me",
      "/api/me/continue-reading",
      "/api/push/status",
      "/api/push/subscribe",
      "/api/admin/dashboard",
      "/api/ask",
      "/api/search",
      "/admin",
      "/admin/login",
      "/admin/users",
      "/auth/login",
      "/auth/callback",
      "/dashboard",
      "/dashboard/settings",
      "/profile",
      "/lists/abc",
    ])("%s is private", (p) => {
      expect(priv(p)).toBe(true);
    });

    it("ALL of /api is private by default — an allowlist that starts closed", () => {
      // A new endpoint added tomorrow is private until someone deliberately
      // opens it, rather than cached until someone notices.
      expect(priv("/api/something-invented-later")).toBe(true);
    });

    it("any request carrying an Authorization header is private", () => {
      // RLS-filtered Supabase reads. Caching one and replaying it to the next
      // user on a shared device would be a privacy breach.
      expect(priv("/rest/v1/books", { sameOrigin: false, auth: true })).toBe(true);
    });

    it("public pages are not private", () => {
      for (const p of ["/home", "/books", "/books/x", "/theses", "/publications", "/paths", "/about/team", "/contact", "/search"]) {
        expect(priv(p), p).toBe(false);
      }
    });

    it("does not let a prefix match bleed into a sibling public route", () => {
      expect(priv("/administration")).toBe(false);
      expect(priv("/listsomething")).toBe(false);
      expect(priv("/authors/jane")).toBe(false); // /authors is public, /auth is not
    });
  });

  // ── The response-level backstop ────────────────────────────────────────────
  describe("isCacheableResponse", () => {
    it("rejects 401/403/404/5xx", () => {
      for (const s of [401, 403, 404, 500, 503]) {
        expect(isCacheableResponse(res(s)), String(s)).toBe(false);
      }
    });

    it("rejects responses that carry a session cookie", () => {
      expect(isCacheableResponse(res(200, { "set-cookie": "sb-auth=x" }))).toBe(false);
    });

    it("honours Cache-Control: private / no-store", () => {
      // A service worker ignores Cache-Control unless you make it care. This is
      // what makes /api/me's `private, no-store` mean something at this layer.
      expect(isCacheableResponse(res(200, { "cache-control": "private, no-store, max-age=0" }))).toBe(false);
      expect(isCacheableResponse(res(200, { "cache-control": "private" }))).toBe(false);
    });

    it("rejects opaque cross-origin responses", () => {
      // Status 0. Chrome pads these to megabytes each in quota accounting, so
      // maxEntries would not actually bound storage.
      expect(isCacheableResponse(res(0))).toBe(false);
    });

    it("rejects anything larger than the auto-cache ceiling", () => {
      expect(isCacheableResponse(res(200, { "content-length": String(MAX_AUTO_CACHE_BYTES + 1) }))).toBe(false);
      // A 2.27 MB book PDF — the exact body measured in the leaking "apis" cache.
      expect(isCacheableResponse(res(200, { "content-length": "2383084" }))).toBe(false);
    });

    it("accepts a normal public asset", () => {
      expect(
        isCacheableResponse(res(200, { "content-length": "48000", "cache-control": "public, max-age=60" })),
      ).toBe(true);
    });
  });

  // ── Reclaiming the leaked storage, without eating user downloads ───────────
  describe("obsolete cache cleanup", () => {
    it("deletes every cache the leaking defaultCache created", () => {
      for (const name of [
        "apis",            // ← the ~240 MB of PDFs
        "others",
        "cross-origin",
        "pages-cache",
        "pages-rsc",
        "pages-rsc-prefetch",
        "next-data",
        "static-data-assets",
        "static-js-assets",
        "static-style-assets",
        "static-image-assets",
        "static-audio-assets",
        "static-video-assets",
        "next-image",
        "supabase-public-cache",
        "pdfjs-assets",
      ]) {
        expect(isObsoleteCache(name), name).toBe(true);
      }
    });

    it("PRESERVES books the user chose to download", () => {
      // Non-negotiable: an upgrade must not destroy content someone saved for
      // offline reading. These names are unversioned for exactly this reason.
      for (const name of USER_OWNED_CACHES) {
        expect(isObsoleteCache(name), name).toBe(false);
      }
      expect(USER_OWNED_CACHES).toContain("offline-books");
      expect(USER_OWNED_CACHES).toContain("book-covers");
    });

    it("preserves the caches this worker owns, and serwist's precache", () => {
      for (const name of Object.values(CACHES)) {
        expect(isObsoleteCache(name), name).toBe(false);
      }
      expect(isObsoleteCache("serwist-precache-v2-https://library.ptec.edu.kh/")).toBe(false);
    });
  });

  // ── Supabase table allowlist ───────────────────────────────────────────────
  describe("public Supabase REST allowlist", () => {
    it("allows published, non-personalised tables", () => {
      for (const t of ["books", "posts", "authors", "categories", "departments", "catalog_books"]) {
        expect(PUBLIC_REST_RE.test(`/rest/v1/${t}?select=*`), t).toBe(true);
      }
    });

    it("excludes every RLS-filtered, per-user table", () => {
      for (const t of ["profiles", "saved_books", "reading_progress", "notifications", "push_subscriptions", "download_logs", "book_notes"]) {
        expect(PUBLIC_REST_RE.test(`/rest/v1/${t}?select=*`), t).toBe(false);
      }
    });
  });
});
