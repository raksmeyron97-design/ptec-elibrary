/* lib/indexing/cleanup.test.ts
 *
 * A deleted resource must leave nothing searchable behind.
 *
 * `book_pages`, `book_chunks`, `resource_index_state` and
 * `resource_semantic_insights` are all polymorphic (`record_type` +
 * `record_id`) with NO foreign key to the resource tables — books, theses and
 * publications live in three separate tables, so there is nothing to cascade
 * from. That makes cleanup the *caller's* job, and a caller that forgets one
 * of them leaves a deleted book's text in the search index and its passages
 * quotable by the AI.
 *
 * 0137 arrived claiming in its own header that "deletes cascade through the
 * same server code that already clears those". They did not: none of the four
 * call sites touched the new table, and this list is what would have said so.
 * A derived table added without a line here is a leak nothing else can find,
 * because a polymorphic orphan has no parent to be noticed from.
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

/** Every table derived from a resource's extracted text. */
const RETRIEVAL_TABLES = [
  "book_pages",
  "book_chunks",
  "resource_index_state",
  "resource_semantic_insights",
] as const;

/**
 * Polymorphic tables that are NOT derived text but carry the same obligation.
 *
 * Two of them now, and both were cleared by nobody for the same reason: the
 * RETRIEVAL_TABLES list above is scoped to "things that make a resource
 * searchable", and neither of these is that.
 *
 * The retrieval list above was scoped to "things that make a resource
 * searchable", and `reading_list_items` (0136) fell outside it and so was
 * cleared by nobody — even though its own migration writes the obligation
 * down: "No foreign key, deliberately … the same cleanup obligation on the
 * application, as resource_index_state (0133)."
 *
 * The consequence is not a leaked passage but a reader's collection that
 * cannot be made right: `getMyReadingLists` counts every row, while the list
 * page renders only items whose resource still resolves, so a deleted book
 * left "12 saved" above 11 visible items permanently.
 *
 * Kept as a SEPARATE list rather than appended to RETRIEVAL_TABLES because the
 * rule for the two groups differs. Unpublishing must NOT clear a saved item —
 * hydrateItems keeps it so it returns when the resource does — whereas an
 * unpublished resource is legitimately dropped from the search index. Only
 * deletion is common to both.
 */
const READER_STATE_TABLES: Array<{ table: string; recordTypes: string[] }> = [
  // Every resource type can be saved to a collection.
  { table: "reading_list_items", recordTypes: ["book", "research", "publication"] },
  // file_health (0065) predates publications and its CHECK constraint still
  // reads `record_type in ('book','research')`, so the publication delete site
  // must NOT be asked for one — an assertion that demanded it would be
  // demanding a row that cannot exist. Applicability is declared per table
  // rather than assumed uniform across DELETE_SITES.
  { table: "file_health", recordTypes: ["book", "research"] },
];

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

  for (const site of DELETE_SITES) {
    for (const { table, recordTypes } of READER_STATE_TABLES) {
      if (!recordTypes.includes(site.recordType)) continue;
      it(`${site.label} deletes from ${table}`, () => {
        const source = read(site.file);
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
