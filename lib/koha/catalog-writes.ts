/**
 * The admin's door to Koha record writes (Phase 5). Server-only: it holds the
 * configured client. The rules live in biblio-write.ts (pure, tested); this
 * file only binds them to the running server's Koha, and answers the questions
 * the catalog actions and pages ask.
 */
import "server-only";
import { getKohaClient, getKohaConfig } from "./index";
import { kohaCanRead, kohaCanWrite, kohaCanWriteItems, kohaStaffLinks } from "./config";
import { createBiblio, readBiblioFields, updateBiblio } from "./biblio-write";
import type { WritableBookFields } from "./marc-write";
import { createItem, heldCopy, readLocations, updateItem, type KohaLocation, type WritableCopyFields } from "./item-write";
import { KohaError } from "./errors";
import type { KohaItem } from "./projection";

/** Records are written to Koha first: KOHA_INTEGRATION=write, fully configured. */
export const kohaWritesRecords = () => kohaCanWrite(getKohaConfig());

/**
 * Koha owns a LINKED record's copies and the fields derived from them (call
 * number, department) whenever the integration is on — read or write — since
 * the sync overwrites them from Koha either way.
 */
export const kohaOwnsLinkedRecords = () => kohaCanRead(getKohaConfig());

/** Links into Koha's staff interface (KOHA_STAFF_URL), or null. */
export const kohaStaffLinksFor = (biblioId: number) => kohaStaffLinks(getKohaConfig().staffUrl, biblioId);

export const createInKoha = (fields: WritableBookFields & { ddc?: string | null }, opts: { confirmNotDuplicate?: boolean; recheckExisting?: boolean }) =>
  createBiblio(getKohaClient(), fields, opts);

export const updateInKoha = (biblioId: number, base: WritableBookFields, next: WritableBookFields) =>
  updateBiblio(getKohaClient(), biblioId, base, next);

export const readKohaRecord = (biblioId: number) => readBiblioFields(getKohaClient(), biblioId);

// ── Copies (Phase 6) ─────────────────────────────────────────────────────────

/** Copies of a Koha record are written to Koha first: record writes on AND KOHA_WRITE_ITEMS=on. */
export const kohaWritesItems = () => kohaCanWriteItems(getKohaConfig());

/**
 * Koha's shelving-location list, cached for five minutes per process (it
 * changes when an administrator edits it, rarely). Null when it could not be
 * read and nothing is cached: a shelf is then not written rather than guessed.
 */
let locationCache: { at: number; list: KohaLocation[] } | null = null;
export async function readKohaLocations(): Promise<KohaLocation[] | null> {
  if (locationCache && Date.now() - locationCache.at < 5 * 60_000) return locationCache.list;
  try {
    const list = await readLocations(getKohaClient());
    locationCache = { at: Date.now(), list };
    return list;
  } catch {
    return locationCache?.list ?? null;
  }
}
const noList = () => ({
  kind: "failed" as const, ambiguous: false,
  error: new KohaError("unreachable", "Koha's list of shelving locations could not be read, so the shelf was not saved. Try again in a moment."),
});

export async function createItemInKoha(biblioId: number, fields: WritableCopyFields) {
  const locations = await readKohaLocations();
  if (locations === null && fields.shelfLocation?.trim()) return noList();
  return createItem(getKohaClient(), biblioId, fields, { libraryId: getKohaConfig().libraryId, locations: locations ?? [] });
}

export async function updateItemInKoha(biblioId: number, itemId: number, base: WritableCopyFields, next: WritableCopyFields) {
  const locations = await readKohaLocations();
  if (locations === null && (next.shelfLocation ?? "").trim() !== (base.shelfLocation ?? "").trim()) return noList();
  return updateItem(getKohaClient(), biblioId, itemId, base, next, locations ?? []);
}

/**
 * The catalog_copies columns Koha decides, from the item as Koha now holds it.
 * A write's answer carries no labels (no `+strings`), so the shelf's label comes
 * from the location list just read, and the holding library is left to the
 * sync — the row must say what the sync would say, or the next pass rewrites it.
 */
export function copyColumnsFrom(item: KohaItem) {
  const h = heldCopy(item);
  const labelled = !!item._strings;
  const shelf = h.locationCode
    ? locationCache?.list.find((l) => l.code === h.locationCode)?.label ?? h.shelfLocation
    : null;
  return {
    koha_item_id: item.item_id,
    barcode: h.barcode || null,
    call_number: h.callNumber,
    shelf_location: shelf,
    accession_number: h.accessionNumber,
    status: h.status,
    ...(labelled && h.holdingLibrary ? { holding_library: h.holdingLibrary } : {}),
  };
}
