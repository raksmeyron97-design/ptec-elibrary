import { describe, it, expect } from "vitest";
import {
  dropRestrictedRows,
  restrictedIdList,
  type RestrictedBooks,
} from "./restricted";

const known = (...ids: string[]): RestrictedBooks => ({ ok: true, ids: new Set(ids) });
const unknown: RestrictedBooks = { ok: false, ids: null };

const rows = [
  { record_type: "book", record_id: "book-open", page_no: 1 },
  { record_type: "book", record_id: "book-withdrawn", page_no: 2 },
  { record_type: "research", record_id: "thesis-1", page_no: 3 },
  { record_type: "publication", record_id: "pub-1", page_no: 4 },
];

describe("dropRestrictedRows", () => {
  it("drops only the withdrawn book's rows", () => {
    const kept = dropRestrictedRows(rows, known("book-withdrawn"));
    expect(kept.map((r) => r.record_id)).toEqual(["book-open", "thesis-1", "pub-1"]);
  });

  it("keeps everything when nothing is restricted", () => {
    expect(dropRestrictedRows(rows, known())).toHaveLength(4);
  });

  // The fail-closed half. An unreadable set is not "nothing is restricted":
  // admitting text the library has withdrawn is the thing the setting exists
  // to prevent, so the unknown case refuses rather than admits.
  it("drops EVERY book row when the set could not be read", () => {
    const kept = dropRestrictedRows(rows, unknown);
    expect(kept.map((r) => r.record_id)).toEqual(["thesis-1", "pub-1"]);
  });

  // 0151 is a policy on `books`. Applying it to resources it does not
  // describe would be a different bug, and would silently disable thesis
  // retrieval on any database hiccup.
  it("never touches theses or publications, even when the set is unknown", () => {
    const others = rows.filter((r) => r.record_type !== "book");
    expect(dropRestrictedRows(others, unknown)).toEqual(others);
  });

  it("does not mutate its input", () => {
    const before = [...rows];
    dropRestrictedRows(rows, known("book-withdrawn"));
    expect(rows).toEqual(before);
  });
});

describe("restrictedIdList", () => {
  it("passes the ids an RPC needs", () => {
    expect(restrictedIdList(known("a", "b")).sort()).toEqual(["a", "b"]);
  });

  // The RPC parameter is an OPTIMISATION — it keeps withdrawn books out of
  // the candidate set. Correctness is dropRestrictedRows' job, so an unknown
  // set must not be sent as "exclude nothing" AND then trusted; it sends an
  // empty list and the row filter refuses everything afterwards.
  it("sends nothing when the set is unknown, leaving the row filter to refuse", () => {
    expect(restrictedIdList(unknown)).toEqual([]);
    expect(dropRestrictedRows(rows, unknown).every((r) => r.record_type !== "book")).toBe(true);
  });
});
