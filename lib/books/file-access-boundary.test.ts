// Source scans for the 0151 file-access boundary.
//
// These read the SOURCE, not the behaviour, because every defect they guard
// against is an ABSENCE: a route that forgets to ask, a writer that goes
// round the trigger, a cache that outlives the write. None of those throws.
//
// What they can and cannot see, stated so nobody trusts them too far: they
// catch a gate that is MISSING or MISORDERED. They cannot catch one that is
// present and neutered — `if (false && !access.canServeBytes)` keeps the
// string and passes every scan here. (Found while negative-controlling
// them: the first attempt disabled the condition and nothing went red.)
// Behaviour is covered by lib/books/access.test.ts.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/** Comments quote the very strings these rules forbid, so strip them first. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * For the ORDERING scans only: an `import { zimaFetch }` line sits at offset
 * ~400 and would make every gate look too late. What is being checked is the
 * order of CALLS, so the import block is removed first. (Found by writing
 * the scan and watching it fail against correct code.)
 */
function bodyOnly(src: string): string {
  return stripComments(src).replace(/^\s*import\s[\s\S]*?;\s*$/gm, "");
}

// Untracked files are invisible to `git grep`, and a NEW route is exactly the
// thing these scans exist to catch (lib/invariant-scan-coverage.test.ts).
function gitFiles(...globs: string[]): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...globs],
    { cwd: ROOT, encoding: "utf8" },
  );
  return out.split("\n").filter(Boolean);
}

describe("every route that can emit book bytes resolves through the one gate", () => {
  // The public routes that read a book's file. Each must ask
  // resolveBookDownloadAccess() rather than reading a column itself: a
  // hand-rolled `allow_download !== false` cannot see catalogue_only.
  const BYTE_ROUTES = [
    "app/api/books/[slug]/file/route.ts",
    "app/api/books/[slug]/download/route.ts",
  ];

  it.each(BYTE_ROUTES)("%s calls resolveBookDownloadAccess", (route) => {
    const src = stripComments(read(route));
    expect(src).toContain("resolveBookDownloadAccess");
  });

  it.each(BYTE_ROUTES)("%s refuses BEFORE it fetches from storage", (route) => {
    const src = bodyOnly(read(route));
    const gate = src.indexOf("canServeBytes");
    expect(gate).toBeGreaterThan(-1);
    // Every way this codebase reaches the object store.
    for (const fetcher of ["zimaFetch", "getSignedUrl"]) {
      const at = src.indexOf(fetcher);
      if (at === -1) continue;
      expect(
        gate,
        `${route}: the canServeBytes check must precede ${fetcher}(), or a withdrawn book still costs a storage request and has its URL constructed`,
      ).toBeLessThan(at);
    }
  });

  it("the public file route decides the policy before it reads the session", () => {
    // The policy is a property of the BOOK, not of who is asking, so the
    // answer must not depend on session state — a signed-in reader, an
    // anonymous visitor and the verified crawler all get the same 403.
    const src = bodyOnly(read("app/api/books/[slug]/file/route.ts"));
    expect(src.indexOf("canServeBytes")).toBeLessThan(src.indexOf("auth.getUser"));
    expect(src.indexOf("canServeBytes")).toBeLessThan(src.indexOf("isVerifiedGoogleCrawler"));
  });

  it("the public download route grants NO override past catalogue_only", () => {
    // read_online keeps its librarian override (0131); catalogue_only must
    // not, so that the public route has one answer and no "unless".
    const src = bodyOnly(read("app/api/books/[slug]/download/route.ts"));
    const refusal = src.indexOf("canServeBytes");
    const override = src.indexOf("canOverrideBookDownloadPolicy");
    expect(refusal).toBeGreaterThan(-1);
    expect(override).toBeGreaterThan(-1);
    expect(
      refusal,
      "the catalogue_only refusal must return before the override is even consulted",
    ).toBeLessThan(override);
  });

  it("staff access exists, and lives behind the admin guard", () => {
    const path = "app/api/admin/books/[id]/file/route.ts";
    expect(existsSync(join(ROOT, path))).toBe(true);
    const src = stripComments(read(path));
    expect(src).toContain('requirePermission("books", "write")');
    // Guarded BEFORE the service client is opened.
    const body = bodyOnly(read(path));
    expect(body.indexOf("requirePermission")).toBeLessThan(body.indexOf("createServiceClient"));
    // A review surface, never a distribution one.
    expect(src).not.toContain("attachment");
  });
});

describe("file_access is the only column any writer sets", () => {
  /**
   * `allow_download:` appears in two completely different roles, and only one
   * is a defect:
   *
   *   resolveBookDownloadAccess({ allow_download: row.allow_download })   READ
   *   supabase.from("books").update({ allow_download: false })            WRITE
   *
   * A line-level regex cannot tell them apart — the first draft of this scan
   * reported all four legitimate reader call sites. So the nearest enclosing
   * call before the key decides, which is the same question a reviewer asks.
   */
  const OPENERS = [".insert(", ".update(", ".upsert(", "resolveBookDownloadAccess(", "bookDownloadAllowed("];

  function nearestOpener(src: string, at: number): string | null {
    let best: string | null = null;
    let bestAt = -1;
    for (const opener of OPENERS) {
      const i = src.lastIndexOf(opener, at);
      if (i > bestAt) {
        bestAt = i;
        best = opener;
      }
    }
    return best;
  }

  it("no book write path assigns allow_download", () => {
    // The trigger derives it. A writer that sets it directly is asserting the
    // same fact twice in a payload where the two can disagree — and on a
    // catalogue_only row the database raises rather than accepting it.
    const offenders: string[] = [];
    for (const file of gitFiles("app/**/*.ts", "app/**/*.tsx", "lib/**/*.ts", "scripts/**/*.ts")) {
      if (file.includes(".test.")) continue;
      // publications carry their OWN allow_download (0125) — a different
      // table, with no file_access column. 0151 is books-only.
      if (/publication/i.test(file)) continue;
      const src = stripComments(read(file));
      for (const m of src.matchAll(/\ballow_download\s*:/g)) {
        const opener = nearestOpener(src, m.index ?? 0);
        if (opener && (opener.startsWith(".insert") || opener.startsWith(".update") || opener.startsWith(".upsert"))) {
          offenders.push(`${file}@${m.index}: written inside ${opener}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("no surface offers a reader the file route will refuse", () => {
  // The byte routes above were gated, and the /read route too, while the book
  // page still drew an embedded reader, a "Sign in to read" prompt and a Read
  // jump-link for catalogue-only books, and search labelled them "Read online
  // only" with a Read button — all keyed on "a file exists". Found against
  // production 2026-09-24: 4 of 4 sampled "read online" results were
  // catalogue-only. A file existing is not permission to read it.
  const page = stripComments(read("app/[locale]/(public)/books/[slug]/page.tsx"));
  const search = stripComments(read("app/api/search/native/route.ts"));

  it("the book page derives `readable` from canReadOnline", () => {
    expect(page).toMatch(/const readable\s*=[\s\S]{0,300}?\.canReadOnline;/);
  });

  it("the embedded reader, the quick-nav Read link and the resume banner are all gated on it", () => {
    expect(page).toMatch(/\{readable && \(\s*<div id="reader"/);
    expect(page).toMatch(/hasPdf=\{readable\}/);
    expect(page).toMatch(/\{readable && book\.dbId && \(\s*<Suspense fallback=\{null\}>\s*<ResumeBanner/);
  });

  it("search derives a book's Read action and availability from canReadOnline, not from the file", () => {
    expect(search).toMatch(/const readable = Boolean\(pdf\?\.file_url\) && access\.canReadOnline;/);
    expect(search).toMatch(/digitalAvailability\(\{ hasFile: readable, canDownload \}\)/);
    expect(search).toMatch(/read: readable \? `\/books\/\$\{r\.slug\}\/read` : undefined/);
    expect(search).not.toMatch(/read: pdf\?\.file_url \?/);
    expect(search).not.toMatch(/hasFile: Boolean\(pdf\?\.file_url\)/);
  });
});
