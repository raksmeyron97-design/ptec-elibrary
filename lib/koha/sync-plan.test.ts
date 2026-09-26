/**
 * The Koha → e-Library sync plan. Every case here is one production will hit:
 * the first build over an almost empty catalogue, the six hand-made records
 * whose barcodes Koha also holds, a record Koha grouped differently, a book
 * checked out, a book deleted in Koha — and, above all, that planning again
 * after applying plans NOTHING.
 */
import { describe, it, expect } from "vitest";
import { isNoop, planSync, type PtecBook, type PtecCopy, type SyncPlan } from "./sync-plan";
import type { ProjectedBook, ProjectedCopy } from "./projection";

const kb = (id: number, over: Partial<ProjectedBook> = {}): ProjectedBook => ({
  kohaBiblioId: id, title: `Book ${id}`, author: `Author ${id}`, isbn: null, publisher: null, year: null,
  language: "en", category: "370 Education", ddcClass: null, ...over,
});
const ki = (itemId: number, biblioId: number, barcode: string | null, over: Partial<ProjectedCopy> = {}): ProjectedCopy => ({
  kohaItemId: itemId, kohaBiblioId: biblioId, barcode, callNumber: `37${biblioId} ABC`, shelfLocation: null,
  holdingLibrary: "PTEC Library", collection: null, accessionNumber: null, status: "available", timestamp: null, ...over,
});
const pb = (id: string, over: Partial<PtecBook> = {}): PtecBook => ({
  id, slug: id, koha_biblio_id: null, title: `Old ${id}`, author: null, isbn: null, publisher: null, year: null,
  language: "en", category: null, department: null, ddc: null, is_active: true, ...over,
});
const pc = (id: string, book: string, barcode: string | null, over: Partial<PtecCopy> = {}): PtecCopy => ({
  id, catalog_book_id: book, koha_item_id: null, barcode, status: "available", call_number: null,
  shelf_location: null, holding_library: "PTEC Library", accession_number: null, copy_number: null, ...over,
});

/** Apply a plan to an in-memory snapshot, the way sync-run.ts applies it to the database. */
function apply(plan: SyncPlan, books: PtecBook[], copies: PtecCopy[]) {
  const B = books.map((b) => ({ ...b }));
  const C = copies.map((c) => ({ ...c }));
  const created = new Map<number, string>();
  for (const c of plan.createBooks) {
    const id = `new-${c.kohaBiblioId}`;
    created.set(c.kohaBiblioId, id);
    B.push({ id, slug: id, koha_biblio_id: c.kohaBiblioId, is_active: true, ...c.fields });
  }
  for (const u of plan.updateBooks) Object.assign(B.find((b) => b.id === u.id)!, u.patch);
  for (const u of plan.unlistBooks) B.find((b) => b.id === u.id)!.is_active = false;
  const resolve = (r: { existing: string } | { created: number }) => ("existing" in r ? r.existing : created.get(r.created)!);
  for (const c of plan.createCopies) {
    C.push({ id: `copy-${c.kohaItemId}`, catalog_book_id: resolve(c.book), koha_item_id: c.kohaItemId, copy_number: c.copyNumber, ...c.fields });
  }
  for (const u of plan.updateCopies) {
    const row = C.find((c) => c.id === u.id)!;
    Object.assign(row, u.patch);
    if (u.moveTo) row.catalog_book_id = resolve(u.moveTo);
  }
  for (const r of plan.retireCopies) C.find((c) => c.id === r.id)!.status = "withdrawn";
  return { books: B, copies: C };
}

describe("first build", () => {
  it("creates one record per Koha record with a live item, and one copy per live item", () => {
    const plan = planSync({
      mode: "full",
      kohaBooks: [kb(1), kb(2), kb(3)],
      kohaCopies: [ki(10, 1, "0803"), ki(11, 1, "0804"), ki(20, 2, "3V81"), ki(30, 3, "999", { status: "withdrawn" })],
      ptecBooks: [], ptecCopies: [],
    });
    expect(plan.createBooks.map((b) => b.kohaBiblioId)).toEqual([1, 2]);   // 3 holds only a withdrawn item
    expect(plan.createCopies.map((c) => [c.fields.barcode, c.copyNumber])).toEqual([["0803", 1], ["0804", 2], ["3V81", 1]]);
    expect(plan.createBooks[0].fields).toMatchObject({ title: "Book 1", ddc: "371 ABC", language: "en" });
    expect(plan.exceptions).toEqual([]);
  });

  it("plans nothing on a second run over an unchanged Koha", () => {
    const input = { mode: "full" as const, kohaBooks: [kb(1), kb(2)], kohaCopies: [ki(10, 1, "0803"), ki(20, 2, "3V81", { status: "on_loan" })] };
    const first = planSync({ ...input, ptecBooks: [], ptecCopies: [] });
    const after = apply(first, [], []);
    expect(isNoop(planSync({ ...input, ptecBooks: after.books, ptecCopies: after.copies }))).toBe(true);
  });
});

describe("linking the e-Library's existing records", () => {
  const ptecBooks = [pb("hand-1", { title: "Teaching Practice Handbook", author: "Sok Dara", category: "Education", department: "Department of Pedagogy" })];
  const ptecCopies = [
    pc("c1", "hand-1", "0803", { copy_number: 1, shelf_location: "Shelf A-1" }),
    pc("c2", "hand-1", "0804", { copy_number: 2, shelf_location: "Shelf A-1" }),
  ];
  const plan = planSync({
    mode: "full",
    kohaBooks: [kb(1, { title: "Teaching Practice Handbook", author: "Sok Dara", category: "370 Education" })],
    kohaCopies: [ki(10, 1, "0803"), ki(11, 1, "0804", { status: "on_loan" })],
    ptecBooks, ptecCopies,
  });

  it("links by barcode instead of duplicating the record", () => {
    expect(plan.createBooks).toEqual([]);
    expect(plan.createCopies).toEqual([]);
    expect(plan.updateBooks).toEqual([{ id: "hand-1", patch: { koha_biblio_id: 1, category: "370 Education", ddc: "371 ABC" } }]);
    expect(plan.updateCopies.map((u) => [u.id, u.patch.koha_item_id])).toEqual([["c1", 10], ["c2", 11]]);
  });

  it("takes Koha's status, and keeps what the e-Library has where Koha has nothing", () => {
    const c2 = plan.updateCopies.find((u) => u.id === "c2")!;
    expect(c2.patch.status).toBe("on_loan");
    expect(c2.patch).not.toHaveProperty("shelf_location");          // Koha has none: "Shelf A-1" stays
    expect(plan.updateBooks[0].patch).not.toHaveProperty("department"); // Koha has no collection: kept
    expect(plan.updateBooks[0].patch).not.toHaveProperty("title");      // unchanged
  });

  it("never touches e-Library-owned fields", () => {
    for (const u of plan.updateBooks) {
      for (const k of ["slug", "description", "cover_url", "seo_title", "keywords", "is_active"]) expect(u.patch).not.toHaveProperty(k);
    }
  });
});

describe("when Koha groups copies differently", () => {
  it("links the pair sharing most barcodes, creates the rest, and moves copies to follow Koha", () => {
    const plan = planSync({
      mode: "full",
      kohaBooks: [kb(1), kb(2)],
      kohaCopies: [ki(10, 1, "A"), ki(11, 1, "B"), ki(20, 2, "C")],
      ptecBooks: [pb("x")],
      ptecCopies: [pc("ca", "x", "A", { copy_number: 1 }), pc("cb", "x", "B", { copy_number: 2 }), pc("cc", "x", "C", { copy_number: 3 })],
    });
    expect(plan.updateBooks.find((u) => u.id === "x")?.patch.koha_biblio_id).toBe(1);
    expect(plan.createBooks.map((b) => b.kohaBiblioId)).toEqual([2]);
    const moved = plan.updateCopies.find((u) => u.id === "cc")!;
    expect(moved.moveTo).toEqual({ created: 2 });
    expect(moved.patch.copy_number).toBe(1);
    expect(plan.exceptions.map((e) => e.kind)).toEqual(["regrouped"]);
  });

  it("reports, rather than takes, a barcode held by a copy linked to another Koha item", () => {
    const plan = planSync({
      mode: "incremental",
      kohaBooks: [kb(1)],
      kohaCopies: [ki(10, 1, "A")],
      ptecBooks: [pb("x", { koha_biblio_id: 1 })],
      ptecCopies: [pc("c", "x", "A", { koha_item_id: 99 })],
    });
    expect(plan.exceptions).toMatchObject([{ kind: "barcode_conflict", barcode: "A", kohaItemId: 10 }]);
    expect(plan.createCopies).toEqual([]);
  });
});

describe("deletions and gaps — full runs only", () => {
  const ptecBooks = [pb("linked", { koha_biblio_id: 1 }), pb("gone", { koha_biblio_id: 2 }), pb("hand", {})];
  const ptecCopies = [
    pc("keep", "linked", "A", { koha_item_id: 10 }),
    pc("deleted-item", "linked", "B", { koha_item_id: 11 }),
    pc("gone-copy", "gone", "C", { koha_item_id: 20 }),
    pc("seed", "hand", "BC-000000101"),
  ];
  const koha = { kohaBooks: [kb(1)], kohaCopies: [ki(10, 1, "A")] };

  it("full: retires a copy and unlists a record Koha no longer holds, and reports what Koha never held", () => {
    const plan = planSync({ mode: "full", ...koha, ptecBooks, ptecCopies });
    expect(plan.retireCopies.map((r) => r.id).sort()).toEqual(["deleted-item", "gone-copy"]);
    expect(plan.unlistBooks).toEqual([{ id: "gone", kohaBiblioId: 2 }]);
    expect(plan.exceptions.map((e) => e.kind).sort()).toEqual(["copy_not_in_koha", "record_not_in_koha"]);
  });

  it("incremental: absence proves nothing, so nothing is retired or reported", () => {
    const plan = planSync({ mode: "incremental", ...koha, ptecBooks, ptecCopies });
    expect(plan.retireCopies).toEqual([]);
    expect(plan.unlistBooks).toEqual([]);
    expect(plan.exceptions).toEqual([]);
  });

  it("never re-lists a record someone unlisted", () => {
    const plan = planSync({ mode: "full", kohaBooks: [kb(1)], kohaCopies: [ki(10, 1, "A")],
      ptecBooks: [pb("x", { koha_biblio_id: 1, is_active: false, title: "Book 1", author: "Author 1", category: "370 Education", ddc: "371 ABC" })],
      ptecCopies: [pc("c", "x", "A", { koha_item_id: 10, call_number: "371 ABC" })] });
    expect(isNoop(plan)).toBe(true);
  });
});

describe("an item checked out in Koha", () => {
  it("becomes one status change and nothing else", () => {
    const base = { kohaBooks: [kb(1)], kohaCopies: [ki(10, 1, "A")] };
    const built = apply(planSync({ mode: "full", ...base, ptecBooks: [], ptecCopies: [] }), [], []);
    const plan = planSync({ mode: "incremental", kohaBooks: [kb(1)], kohaCopies: [ki(10, 1, "A", { status: "on_loan" })], ptecBooks: built.books, ptecCopies: built.copies });
    expect(plan.updateCopies).toEqual([{ id: "copy-10", patch: { status: "on_loan" }, moveTo: undefined }]);
    expect(plan.updateBooks).toEqual([]);
  });
});
