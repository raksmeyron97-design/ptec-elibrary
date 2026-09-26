/**
 * Koha → e-Library sync, the DECISION half: given what Koha says and what the
 * e-Library holds, what must be created, linked, updated, retired — and what
 * a librarian has to look at. Pure: lib/koha/sync-run.ts reads both sides,
 * hands them here, and applies (or, for a preview, only reports) the result.
 *
 * Matching, strongest first:
 *   1. the stored link (catalog_books.koha_biblio_id / catalog_copies.koha_item_id);
 *   2. the barcode, EXACTLY — the key both systems inherited from PMB;
 *   3. nothing: a Koha record with a live item becomes a new e-Library record.
 * Titles are never matched on: two editions share a title, and a guessed link
 * is worse than a reported exception.
 *
 * When the two systems grouped copies differently, the (Koha record, e-Library
 * record) pair sharing the MOST barcodes is linked; the rest is created or
 * reported, never guessed. Copies follow their Koha item: the projection
 * converges on Koha's grouping.
 *
 * Field ownership, the rule that keeps a librarian's work from vanishing:
 *   Koha-owned (Koha's value wins WHEN KOHA HAS ONE):
 *     title, author, isbn, publisher, year, language, category, ddc
 *     (the record's call number), department (Koha collection);
 *     copies: barcode, call number, status, shelf, holding library, accession.
 *     "When Koha has one" means clearing a field in Koha does not clear it
 *     here — the price of never wiping a value Koha simply does not hold.
 *   e-Library-owned (never touched): slug (the URL), description, cover, SEO
 *     overrides, keywords — and is_active, except that a record whose Koha
 *     record was deleted is UNLISTED (never re-listed, never deleted).
 *
 * Only a FULL run can see deletions: an incremental run is handed changed
 * rows, so absence proves nothing. Deletions are therefore full-mode only, and
 * even then they retire (copy status `withdrawn`, record unlisted) — nothing
 * is deleted from the e-Library by the sync.
 */
import type { CopyStatus } from "@/lib/catalog";
import { recordCallNumber, recordDepartment, type ProjectedBook, type ProjectedCopy } from "./projection";

export type SyncMode = "full" | "incremental";

export interface PtecBook {
  id: string;
  slug: string;
  koha_biblio_id: number | null;
  title: string;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  year: number | null;
  language: string | null;
  category: string | null;
  department: string | null;
  ddc: string | null;
  is_active: boolean;
}

export interface PtecCopy {
  id: string;
  catalog_book_id: string | null;
  koha_item_id: number | null;
  barcode: string | null;
  status: string;
  call_number: string | null;
  shelf_location: string | null;
  holding_library: string | null;
  accession_number: string | null;
  copy_number: number | null;
}

export type BookFields = Pick<PtecBook, "title" | "author" | "isbn" | "publisher" | "year" | "language" | "category" | "department" | "ddc">;
export type CopyFields = {
  barcode: string | null;
  call_number: string | null;
  shelf_location: string | null;
  holding_library: string | null;
  accession_number: string | null;
  status: CopyStatus;
};

/** Where a copy goes: an existing record, or the record created for a Koha biblio in this run. */
export type BookRef = { existing: string } | { created: number };

export type ExceptionKind =
  | "record_not_in_koha"      // an active e-Library record none of whose copies Koha holds
  | "copy_not_in_koha"        // a live e-Library copy whose barcode Koha does not hold
  | "record_emptied"          // an unlinked e-Library record whose copies Koha grouped under other records
  | "regrouped"               // Koha grouped this record's copies differently; copies were moved to follow Koha
  | "barcode_conflict"        // a Koha barcode is held by an e-Library copy linked to a DIFFERENT Koha item
  | "missing_biblio";         // a Koha item whose record could not be read

export interface SyncException {
  kind: ExceptionKind;
  message: string;
  bookId?: string;
  copyId?: string;
  kohaBiblioId?: number;
  kohaItemId?: number;
  barcode?: string | null;
}

export interface SyncPlan {
  mode: SyncMode;
  createBooks: { kohaBiblioId: number; fields: BookFields }[];
  updateBooks: { id: string; patch: Partial<BookFields & { koha_biblio_id: number }> }[];
  unlistBooks: { id: string; kohaBiblioId: number }[];
  createCopies: { book: BookRef; kohaItemId: number; copyNumber: number; fields: CopyFields }[];
  updateCopies: { id: string; patch: Partial<CopyFields & { koha_item_id: number; catalog_book_id: string; copy_number: number }>; moveTo?: BookRef }[];
  retireCopies: { id: string; kohaItemId: number | null }[];
  exceptions: SyncException[];
  counts: Record<string, number>;
}

const norm = (v: unknown) => (v === undefined || v === "" ? null : v);

/** A patch containing only the Koha-owned fields Koha has a value for AND that differ. */
function diff<T extends Record<string, unknown>>(current: Record<string, unknown>, incoming: T, opts: { keepWhenIncomingNull: boolean }): Partial<T> {
  const patch: Partial<T> = {};
  for (const [k, v] of Object.entries(incoming)) {
    const next = norm(v);
    if (next === null && opts.keepWhenIncomingNull) continue;
    if (norm(current[k]) !== next) (patch as Record<string, unknown>)[k] = next;
  }
  return patch;
}

function bookFields(b: ProjectedBook, copies: ProjectedCopy[]): BookFields {
  return {
    title: b.title,
    author: b.author,
    isbn: b.isbn,
    publisher: b.publisher,
    year: b.year,
    language: b.language,
    category: b.category,
    department: recordDepartment(copies),
    ddc: recordCallNumber(copies, b.ddcClass),
  };
}

function copyFields(c: ProjectedCopy): CopyFields {
  return {
    barcode: c.barcode,
    call_number: c.callNumber,
    shelf_location: c.shelfLocation,
    holding_library: c.holdingLibrary,
    accession_number: c.accessionNumber,
    status: c.status,
  };
}

/**
 * @param kohaBooks  every Koha record in scope (full: all; incremental: changed
 *                   ones AND every record a changed item belongs to)
 * @param kohaCopies every item OF those records (the runner fetches the whole
 *                   item list of each record in scope, so record-level fields
 *                   like the call number are computed from all its copies)
 */
export function planSync(input: {
  mode: SyncMode;
  kohaBooks: ProjectedBook[];
  kohaCopies: ProjectedCopy[];
  ptecBooks: PtecBook[];
  ptecCopies: PtecCopy[];
}): SyncPlan {
  const { mode } = input;
  const plan: SyncPlan = {
    mode, createBooks: [], updateBooks: [], unlistBooks: [], createCopies: [], updateCopies: [], retireCopies: [], exceptions: [], counts: {},
  };

  const kohaBookById = new Map(input.kohaBooks.map((b) => [b.kohaBiblioId, b]));
  const itemsByBiblio = new Map<number, ProjectedCopy[]>();
  for (const c of input.kohaCopies) {
    if (!itemsByBiblio.has(c.kohaBiblioId)) itemsByBiblio.set(c.kohaBiblioId, []);
    itemsByBiblio.get(c.kohaBiblioId)!.push(c);
  }
  const ptecBookById = new Map(input.ptecBooks.map((b) => [b.id, b]));
  const ptecBookByKoha = new Map<number, PtecBook>();
  for (const b of input.ptecBooks) if (b.koha_biblio_id != null) ptecBookByKoha.set(b.koha_biblio_id, b);
  const copyByKoha = new Map<number, PtecCopy>();
  const copyByBarcode = new Map<string, PtecCopy>();
  for (const c of input.ptecCopies) {
    if (c.koha_item_id != null) copyByKoha.set(c.koha_item_id, c);
    if (c.barcode && c.status !== "withdrawn") copyByBarcode.set(c.barcode, c);
  }

  /** The e-Library copy a Koha item is, if any — and a conflict when the barcode is claimed by another item. */
  const matchedCopy = new Map<number, PtecCopy>();
  const conflicted = new Set<number>();
  for (const c of input.kohaCopies) {
    const byLink = copyByKoha.get(c.kohaItemId);
    if (byLink) { matchedCopy.set(c.kohaItemId, byLink); continue; }
    const byBarcode = c.barcode ? copyByBarcode.get(c.barcode) : undefined;
    if (!byBarcode) continue;
    if (byBarcode.koha_item_id != null && byBarcode.koha_item_id !== c.kohaItemId) {
      plan.exceptions.push({
        kind: "barcode_conflict", barcode: c.barcode, kohaItemId: c.kohaItemId, copyId: byBarcode.id,
        message: `Barcode ${c.barcode} is Koha item ${c.kohaItemId}, but the e-Library copy with that barcode is linked to Koha item ${byBarcode.koha_item_id}.`,
      });
      // Reported, and skipped: creating it would claim a barcode the
      // database already holds for another copy (ux_catalog_copies_barcode).
      conflicted.add(c.kohaItemId);
      continue;
    }
    matchedCopy.set(c.kohaItemId, byBarcode);
  }

  // ── Records: which e-Library record each Koha record is ────────────────────
  const bookFor = new Map<number, BookRef>();
  const claimedBooks = new Set<string>();
  for (const b of input.kohaBooks) {
    const linked = ptecBookByKoha.get(b.kohaBiblioId);
    if (linked) { bookFor.set(b.kohaBiblioId, { existing: linked.id }); claimedBooks.add(linked.id); }
  }
  // Unlinked Koha records: pair with the unlinked e-Library record sharing the most barcodes.
  const pairs: { biblio: number; book: string; n: number }[] = [];
  for (const b of input.kohaBooks) {
    if (bookFor.has(b.kohaBiblioId)) continue;
    const tally = new Map<string, number>();
    for (const c of itemsByBiblio.get(b.kohaBiblioId) ?? []) {
      const p = matchedCopy.get(c.kohaItemId);
      const owner = p?.catalog_book_id ? ptecBookById.get(p.catalog_book_id) : undefined;
      if (owner && owner.koha_biblio_id == null) tally.set(owner.id, (tally.get(owner.id) ?? 0) + 1);
    }
    for (const [book, n] of tally) pairs.push({ biblio: b.kohaBiblioId, book, n });
  }
  pairs.sort((x, y) => y.n - x.n || x.biblio - y.biblio || (x.book < y.book ? -1 : 1));
  for (const p of pairs) {
    if (bookFor.has(p.biblio) || claimedBooks.has(p.book)) continue;
    bookFor.set(p.biblio, { existing: p.book });
    claimedBooks.add(p.book);
  }

  for (const b of input.kohaBooks) {
    const items = itemsByBiblio.get(b.kohaBiblioId) ?? [];
    const fields = bookFields(b, items);
    const ref = bookFor.get(b.kohaBiblioId);
    if (ref && "existing" in ref) {
      const current = ptecBookById.get(ref.existing)!;
      const patch: SyncPlan["updateBooks"][number]["patch"] = diff(current as unknown as Record<string, unknown>, fields, { keepWhenIncomingNull: true });
      if (current.koha_biblio_id !== b.kohaBiblioId) patch.koha_biblio_id = b.kohaBiblioId;
      if (Object.keys(patch).length) plan.updateBooks.push({ id: current.id, patch });
      continue;
    }
    // A Koha record with no live item is not a book on a shelf: nothing to show.
    if (!items.some((c) => c.status !== "withdrawn")) continue;
    plan.createBooks.push({ kohaBiblioId: b.kohaBiblioId, fields });
    bookFor.set(b.kohaBiblioId, { created: b.kohaBiblioId });
  }

  // ── Copies ─────────────────────────────────────────────────────────────────
  // Copy numbers are unique per record among live copies; new and moved copies
  // take the next free number of their record.
  const nextNo = new Map<string, number>();
  for (const c of input.ptecCopies) {
    if (!c.catalog_book_id || c.status === "withdrawn") continue;
    nextNo.set(c.catalog_book_id, Math.max(nextNo.get(c.catalog_book_id) ?? 0, c.copy_number ?? 0));
  }
  const takeNo = (key: string) => { const n = (nextNo.get(key) ?? 0) + 1; nextNo.set(key, n); return n; };
  const refKey = (r: BookRef) => ("existing" in r ? r.existing : `new:${r.created}`);

  const regrouped = new Set<string>();
  for (const c of input.kohaCopies) {
    const target = bookFor.get(c.kohaBiblioId);
    if (!target) {
      if (!kohaBookById.has(c.kohaBiblioId)) {
        plan.exceptions.push({ kind: "missing_biblio", kohaItemId: c.kohaItemId, kohaBiblioId: c.kohaBiblioId, barcode: c.barcode,
          message: `Koha item ${c.kohaItemId} (barcode ${c.barcode ?? "none"}) belongs to Koha record ${c.kohaBiblioId}, which could not be read.` });
      }
      continue; // a withdrawn-only record that was not created
    }
    if (conflicted.has(c.kohaItemId)) continue;
    const fields = copyFields(c);
    const p = matchedCopy.get(c.kohaItemId);
    if (!p) {
      if (c.status === "withdrawn") continue; // never create a retired copy
      plan.createCopies.push({ book: target, kohaItemId: c.kohaItemId, copyNumber: takeNo(refKey(target)), fields });
      continue;
    }
    // Same rule as records: Koha's value wins when Koha has one. A shelf mark
    // hand-entered in the e-Library ("Shelf A-1") survives Koha holding none;
    // status always has a value, so it always follows Koha.
    const patch: SyncPlan["updateCopies"][number]["patch"] = diff(p as unknown as Record<string, unknown>, fields, { keepWhenIncomingNull: true });
    if (p.koha_item_id !== c.kohaItemId) patch.koha_item_id = c.kohaItemId;
    let moveTo: BookRef | undefined;
    if (!("existing" in target) || target.existing !== p.catalog_book_id) {
      moveTo = target;
      if (c.status !== "withdrawn") patch.copy_number = takeNo(refKey(target));
      if (p.catalog_book_id) regrouped.add(p.catalog_book_id);
      if ("existing" in target) patch.catalog_book_id = target.existing;
    }
    if (Object.keys(patch).length || moveTo) plan.updateCopies.push({ id: p.id, patch, moveTo });
  }
  for (const id of regrouped) {
    plan.exceptions.push({ kind: "regrouped", bookId: id,
      message: `Koha groups some copies of "${ptecBookById.get(id)?.title ?? id}" under a different record; those copies now follow Koha.` });
  }

  // ── Full mode only: what Koha no longer holds, and what it never held ─────
  if (mode === "full") {
    const kohaItemIds = new Set(input.kohaCopies.map((c) => c.kohaItemId));
    const kohaBiblioIds = new Set(input.kohaBooks.map((b) => b.kohaBiblioId));
    const matchedPtecCopyIds = new Set([...matchedCopy.values()].map((p) => p.id));
    const ptecCopyById = new Map(input.ptecCopies.map((c) => [c.id, c]));
    const movedAway = new Map<string, number>();
    for (const u of plan.updateCopies) {
      const p = ptecCopyById.get(u.id);
      if (u.moveTo && p?.catalog_book_id) movedAway.set(p.catalog_book_id, (movedAway.get(p.catalog_book_id) ?? 0) + 1);
    }
    const liveByBook = new Map<string, PtecCopy[]>();
    for (const c of input.ptecCopies) {
      if (!c.catalog_book_id || c.status === "withdrawn") continue;
      if (!liveByBook.has(c.catalog_book_id)) liveByBook.set(c.catalog_book_id, []);
      liveByBook.get(c.catalog_book_id)!.push(c);
    }

    for (const p of input.ptecCopies) {
      if (p.status === "withdrawn") continue;
      if (p.koha_item_id != null && !kohaItemIds.has(p.koha_item_id)) {
        plan.retireCopies.push({ id: p.id, kohaItemId: p.koha_item_id });
      } else if (p.koha_item_id == null && !matchedPtecCopyIds.has(p.id)) {
        const owner = p.catalog_book_id ? ptecBookById.get(p.catalog_book_id) : undefined;
        if (owner?.is_active) {
          plan.exceptions.push({ kind: "copy_not_in_koha", copyId: p.id, bookId: owner.id, barcode: p.barcode,
            message: `Copy ${p.barcode ?? "(no barcode)"} of "${owner.title}" is not in Koha.` });
        }
      }
    }
    for (const b of input.ptecBooks) {
      if (!b.is_active) continue;
      if (b.koha_biblio_id != null && !kohaBiblioIds.has(b.koha_biblio_id)) {
        plan.unlistBooks.push({ id: b.id, kohaBiblioId: b.koha_biblio_id });
      } else if (b.koha_biblio_id == null && !claimedBooks.has(b.id)) {
        const live = liveByBook.get(b.id) ?? [];
        const allMoved = live.length > 0 && live.every((c) => matchedPtecCopyIds.has(c.id));
        plan.exceptions.push(allMoved
          ? { kind: "record_emptied", bookId: b.id, message: `"${b.title}": Koha holds all its copies under other records. Consider unlisting it.` }
          : { kind: "record_not_in_koha", bookId: b.id, message: `"${b.title}" is not in Koha${movedAway.get(b.id) ? " (some copies are)" : ""}.` });
      }
    }
  }

  plan.counts = {
    kohaRecords: input.kohaBooks.length,
    kohaItems: input.kohaCopies.length,
    createRecords: plan.createBooks.length,
    linkRecords: plan.updateBooks.filter((u) => u.patch.koha_biblio_id != null).length,
    updateRecords: plan.updateBooks.filter((u) => u.patch.koha_biblio_id == null).length,
    unlistRecords: plan.unlistBooks.length,
    createCopies: plan.createCopies.length,
    linkCopies: plan.updateCopies.filter((u) => u.patch.koha_item_id != null).length,
    updateCopies: plan.updateCopies.filter((u) => u.patch.koha_item_id == null).length,
    retireCopies: plan.retireCopies.length,
    exceptions: plan.exceptions.length,
  };
  return plan;
}

/** Nothing to write? (A second run over an unchanged Koha must plan exactly this.) */
export function isNoop(plan: SyncPlan): boolean {
  return !plan.createBooks.length && !plan.updateBooks.length && !plan.unlistBooks.length
    && !plan.createCopies.length && !plan.updateCopies.length && !plan.retireCopies.length;
}
