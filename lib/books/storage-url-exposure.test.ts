import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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
