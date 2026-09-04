/* lib/indexing/cleanup.test.ts
 *
 * A deleted resource must leave nothing searchable behind.
 *
 * `book_pages`, `book_chunks` and `resource_index_state` are all polymorphic
 * (`record_type` + `record_id`) with NO foreign key to the resource tables —
 * books, theses and publications live in three separate tables, so there is
 * nothing to cascade from. That makes cleanup the *caller's* job, and a caller
 * that forgets one of the three leaves a deleted book's text in the search
 * index and its passages quotable by the AI.
 *
 * This is a source scan rather than a behavioural test for the same reason the
 * other invariant tests in this repo are: the failure is an OMISSION at a call
 * site, and only reading the call sites can catch it. A mocked delete proves a
 * function does what it already does.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

/** Every admin path that deletes a resource, and the record_type it owns. */
const DELETE_SITES: Array<{ file: string; recordType: string; label: string }> = [
  {
    file: "app/(admin)/admin/(protected)/books/actions.ts",
    recordType: "book",
    label: "deleteBook",
  },
  { file: "app/actions/theses.ts", recordType: "research", label: "thesis delete" },
  { file: "app/actions/publications.ts", recordType: "publication", label: "publication delete" },
];

/** The three tables that make a resource's text retrievable. */
const RETRIEVAL_TABLES = ["book_pages", "book_chunks", "resource_index_state"] as const;

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("deleting a resource clears everything that makes it searchable", () => {
  for (const site of DELETE_SITES) {
    for (const table of RETRIEVAL_TABLES) {
      it(`${site.label} deletes from ${table}`, () => {
        const source = read(site.file);
        // The delete must be present AND scoped to this resource's own
        // record_type — an unscoped delete would wipe another type's index.
        expect(source).toContain(`from("${table}").delete()`);
        const scoped = new RegExp(
          `from\\("${table}"\\)\\s*\\.delete\\(\\)[\\s\\S]{0,120}?"${site.recordType}"`,
        );
        expect(source).toMatch(scoped);
      });
    }
  }

  it("a replaced PDF does not need a delete — staleness is derived", () => {
    // Deliberately NOT asserting a delete on the file-replacement paths. A
    // replaced PDF is handled by source_digest comparison in migration 0134's
    // health view: the record reads as stale and the reconciler re-indexes it,
    // which REPLACES the pages (indexPdfPages deletes-then-inserts for the
    // record). Deleting eagerly on replace would leave the book with no
    // searchable text at all in the window before re-extraction succeeds —
    // strictly worse than briefly stale text.
    const reconcile = read("lib/indexing/reconcile.ts");
    expect(reconcile).toContain("sourceDigest");
    expect(reconcile).toMatch(/reason:\s*"stale"/);

    const indexer = read("lib/pdf-page-index.ts");
    // The delete-then-insert that makes re-extraction idempotent.
    expect(indexer).toMatch(/from\("book_pages"\)[\s\S]{0,80}\.delete\(\)/);
  });
});
