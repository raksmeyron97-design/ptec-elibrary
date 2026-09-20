import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";

/**
 * A source scan, because this defect is invisible at runtime.
 *
 * `book_files.file_url` is a storage URL that `zimaFetch()` retrieves with NO
 * credentials. Anyone holding the string can fetch the PDF forever: no session,
 * no rate limit, no per-book download policy (migration 0131), and no log
 * entry. Putting it on a value that reaches a browser — a JSON route body, a
 * Server Action's return, a prop on a Client Component — therefore publishes
 * the file permanently, whatever the UI does with it afterwards.
 *
 * It had happened in four places at once (`mapRowToBook`, the continue-reading
 * route, the homepage shelf and `getSavedBooks`), which is why this is a rule
 * and not a code review note. The fix in every case is `bookFileHref(id)`.
 *
 * The scan is deliberately narrow: it looks for a `pdfUrl` — the field name
 * every one of those payloads used — being assigned an expression containing
 * `file_url`. That is the exact shape of the bug and is not a pattern any
 * legitimate code needs.
 */
const ROOTS = ["app", "components", "lib"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".claude", "__snapshots__"]);

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* sourceFiles(full);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      yield full;
    }
  }
}

// Everything from `pdfUrl:` to the comma that ends the object entry. It has to
// span lines — the canonical assignment in mapRowToBook is a three-line ternary
// whose call to the proxy helper sits on the SECOND line, so a line-scoped
// pattern reads the raw `file_url` on line one and reports the correct code as
// a leak. Bounded so a missing terminator cannot swallow the rest of the file.
const PDF_URL_ASSIGNMENT = /pdfUrl\s*:\s*[\s\S]{0,400}?(?=,\r?\n)/g;

/**
 * The same span technique, generalised past `pdfUrl` (SEO 5.0 / 0151).
 *
 * A catalogue-record-only book raises the stakes: the whole setting is that
 * the library hands out no file, and `book_files.file_url` is a
 * credential-free permanent address for exactly that file. Leaking it under
 * ANY field name defeats it, so the field name is no longer part of the rule.
 *
 * This found one live leak when it was written: the admin book list
 * serialised the raw URL into its client payload for every row, to satisfy a
 * boolean in the quality scorer. That is now `hasFile`, and
 * `EbookListClientRow` omits the URL so the type system refuses it back.
 */
const URL_FIELD_ASSIGNMENT =
  /\b(pdfUrl|fileUrl|downloadUrl|href|src)\s*:\s*[\s\S]{0,400}?(?=,\r?\n)/g;
// A bare `url` is deliberately NOT in that list: `function f(url: string)` is
// a type annotation, not an object entry, and including it reported
// lib/uploads/reconcile.ts's parameter list as a leak.

/**
 * Server-only holders of the real location, each justified rather than
 * pattern-matched away:
 *
 *   lib/admin/ebooks.ts     EbookListRow.fileUrl — the admin list's own
 *                           file-status filters run on the server over this.
 *                           What reaches the browser is EbookListClientRow,
 *                           which omits it; the type is the guard there.
 *   app/api/ .../route.ts   a route handler fetching the bytes IS the job.
 */
/**
 * Each exemption was traced to its consumers and classified PUBLIC or
 * ADMIN-ONLY on 2026-09-20, rather than dissolved into a looser regex —
 * because the next thing a looser regex hides is a real book leak.
 *
 * | module | surface | why it is exempt |
 * |---|---|---|
 * | `lib/admin/ebooks.ts` | admin-only (`/admin/books`) | the server needs the URL for its file-status filters; what crosses to the browser is `EbookListClientRow`, which omits it |
 * | `app/actions/data-quality.ts` | admin-only | a thesis quality input; the value never leaves the function, which returns only `{ completeness, missing }` |
 * | `lib/publish-readiness.ts` | admin-only | `validateThesisPublish()`, server-side validation only |
 * | `lib/indexing/reconcile.ts` | cron, server-to-server | the indexer must hold real URLs — that IS the job |
 * | `lib/metadata-exports/works.ts` | **PUBLIC** (`/api/export/*`, OAI-PMH) | a false positive of the span regex: the VALUE is a proxy URL (`/api/theses/<id>/download`), and `file_url` appears only in the condition. Verified live — the production OAI feed contains zero `storage-ptec.online` strings. |
 *
 * Four of the five are theses or publications, which hold `file_url` on their
 * own tables behind their own routes. Giving those the book treatment
 * (`hasFile` at the client boundary) is a worthwhile follow-up and is NOT
 * part of the 0151 pass.
 */
const SERVER_ONLY_HOLDERS = [
  "lib/admin/ebooks.ts",
  "app/actions/data-quality.ts",
  "lib/publish-readiness.ts",
  "lib/indexing/reconcile.ts",
  "lib/metadata-exports/works.ts",
];

/**
 * Theses and publications hold `file_url` on their OWN tables, behind their
 * own routes and their own access rules (0125 for publications). 0151 is a
 * policy on `books`, and widening this scan to resources it does not
 * describe would report correct code and invite the exemption that later
 * hides a real book leak.
 *
 * NOT audited here, and worth its own pass: the thesis admin list and
 * validateThesisPublish() both carry research_reports.file_url in the same
 * shape the book list did.
 */
const OTHER_RESOURCE_MODULES = /theses|thesis|publication/i;

describe("no storage URL reaches a client payload under any field name", () => {
  it("assigns a URL field from a proxy route, never from file_url directly", () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        const rel = file.split(sep).join("/");
        if (SERVER_ONLY_HOLDERS.some((p) => rel.endsWith(p))) continue;
        if (OTHER_RESOURCE_MODULES.test(rel)) continue;
        // A route handler must hold the real location to fetch it.
        if (/api[/\\].*route\.tsx?$/.test(file)) continue;
        const source = readFileSync(file, "utf8");
        for (const match of source.match(URL_FIELD_ASSIGNMENT) ?? []) {
          if (!match.includes("file_url")) continue;
          // Already routed through the authenticated proxy — the fix, not
          // the bug, even though the column name appears in the fallback.
          if (match.includes("bookFileHref")) continue;
          offenders.push(`${file}: ${match.replace(/\s+/g, " ").trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe("book storage URLs never reach a client payload", () => {
  it("assigns pdfUrl from bookFileHref(), never from file_url directly", () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        const source = readFileSync(file, "utf8");
        for (const match of source.match(PDF_URL_ASSIGNMENT) ?? []) {
          // Only assignments that actually touch a storage column are in scope;
          // one that already routes through the proxy helper is the fix, not
          // the bug, even though the raw column name appears in the fallback.
          if (!match.includes("file_url")) continue;
          if (match.includes("bookFileHref")) continue;
          offenders.push(`${file}: ${match.replace(/\s+/g, " ").trim()}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
