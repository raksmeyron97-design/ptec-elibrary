/**
 * Reading Koha's catalogue for the sync: every item, every record (as MARC),
 * or only what changed since a cursor. Pure over an injected KohaClient, so the
 * mock and the real Koha run the same code.
 *
 * Koha 26.05, verified against a live 26.05.03 (docs/KOHA-SYNC.md):
 *   GET /items    — permission `catalogue`; `x-koha-embed: +strings` adds the
 *                   human labels of coded fields (location, collection).
 *   GET /biblios  — permission `catalogue`; with `Accept: application/marc-in-json`
 *                   a page of full MARC records, biblionumber in 999$c.
 *   Both page with `_page`/`_per_page`, report `X-Total-Count`, and filter with
 *   `q` (a JSON query over the API's field names).
 * Two quirks of 26.05.03, both measured (each 500s rather than answering):
 *   • /biblios prefixes the sort column itself: `_order_by=+me.biblio_id`
 *     becomes `me.me.biblionumber`. Sort /biblios by `+biblio_id`.
 *   • /biblios joins biblioitems, so a bare `timestamp` in `q` is ambiguous.
 *     Filter /biblios on `me.timestamp`. (/items takes both forms.)
 * And: the JSON listing needs an explicit `Accept: application/json` (the
 * client always sends one); the MARC listing sends no X-Total-Count.
 * Pages are read in a STABLE order (by id), so a record added mid-read shifts
 * nothing already read; a record changed mid-read is picked up by the next
 * incremental run, whose cursor is the newest timestamp this run SAW.
 */
import type { KohaClient } from "./client";
import { isKohaItemList, isMarcInJson, type KohaItem, type MarcInJson } from "./projection";

/**
 * Rows per request. Koha's item serializer is the cost, about 23 ms an item
 * with labels on 26.05.03 (measured: 100 items 2.3 s, 200 4.4–5.7 s, 500
 * 9.3 s), so a page is kept to a few seconds even on a slower box: one
 * request stays short and a failed one is cheap to retry. Records are cheaper
 * (100 as MARC in 0.35 s); one size keeps the paging rule the same for both.
 */
export const KOHA_PAGE_SIZE = 100;
/**
 * The budget for one page. The sync runs in the background, so it is not held
 * to the interactive KOHA_TIMEOUT_MS (8 s by default — a 500-item page did not
 * fit in it); the client caps it at KOHA_MAX_TIMEOUT_MS.
 */
export const KOHA_SYNC_TIMEOUT_MS = 60_000;
/** Ids per `q` IN-list: keeps the query string far from any request-line limit. */
const ID_CHUNK = 100;

const isMarcList = (v: unknown): v is MarcInJson[] => Array.isArray(v) && v.every(isMarcInJson);

async function readAll<T>(
  client: KohaClient,
  path: string,
  validate: (v: unknown) => v is T[],
  opts: { q?: unknown; orderBy: string; accept?: "application/json" | "application/marc-in-json"; embed?: "+strings"[]; signal?: AbortSignal },
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const r = await client.get(path, validate, {
      query: {
        _page: page,
        _per_page: KOHA_PAGE_SIZE,
        _order_by: opts.orderBy,
        q: opts.q === undefined ? undefined : JSON.stringify(opts.q),
      },
      accept: opts.accept,
      embed: opts.embed,
      signal: opts.signal,
      timeoutMs: KOHA_SYNC_TIMEOUT_MS,
    });
    out.push(...r.data);
    // Stop on a short page; X-Total-Count is used only as a second opinion,
    // because the MARC formats do not always send it.
    if (r.data.length < KOHA_PAGE_SIZE) break;
    if (r.total !== null && out.length >= r.total) break;
    if (page > 10_000) throw new Error(`Koha ${path}: more than 10,000 pages — refusing to read further.`);
  }
  return out;
}

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export interface ReadScope {
  /** Only rows Koha changed at or after this instant (ISO 8601). */
  since?: string;
  signal?: AbortSignal;
  /**
   * Embed the display labels (`+strings`). Default true. Koha builds them per
   * item and they cost about a third of the request (measured on 26.05.03:
   * 500 items in 6.8 s bare, 9.3 s with labels), so a read that only needs to
   * know WHICH records changed goes without.
   */
  labels?: boolean;
}

export async function readKohaItems(client: KohaClient, scope: ReadScope = {}): Promise<KohaItem[]> {
  return readAll(client, "/items", isKohaItemList, {
    q: scope.since ? { timestamp: { ">=": scope.since } } : undefined,
    orderBy: "+me.item_id",
    embed: scope.labels === false ? undefined : ["+strings"],
    signal: scope.signal,
  });
}

/** Every item of the given records — so a record's call number is computed from ALL its copies. */
export async function readKohaItemsOf(client: KohaClient, biblioIds: number[], signal?: AbortSignal): Promise<KohaItem[]> {
  const out: KohaItem[] = [];
  for (const part of chunks([...new Set(biblioIds)], ID_CHUNK)) {
    out.push(...(await readAll(client, "/items", isKohaItemList, { q: { biblio_id: part }, orderBy: "+me.item_id", embed: ["+strings"], signal })));
  }
  return out;
}

/** Every record, as MARC. */
export async function readKohaBiblios(client: KohaClient, scope: Pick<ReadScope, "signal"> = {}): Promise<MarcInJson[]> {
  return readAll(client, "/biblios", isMarcList, { orderBy: "+biblio_id", accept: "application/marc-in-json", signal: scope.signal });
}

export interface BiblioStamp { biblio_id: number; timestamp: string | null }
const isStampList = (v: unknown): v is BiblioStamp[] =>
  Array.isArray(v) && v.every((x) => !!x && typeof x === "object" && Number.isInteger((x as BiblioStamp).biblio_id));

/** Ids and Koha change timestamps of the records changed at or after `since` (JSON — MARC carries no timestamp field Koha filters on). */
export async function readKohaBiblioChanges(client: KohaClient, since: string, signal?: AbortSignal): Promise<BiblioStamp[]> {
  return readAll(client, "/biblios", isStampList, { q: { "me.timestamp": { ">=": since } }, orderBy: "+biblio_id", signal });
}

export async function readKohaBibliosById(client: KohaClient, biblioIds: number[], signal?: AbortSignal): Promise<MarcInJson[]> {
  const out: MarcInJson[] = [];
  for (const part of chunks([...new Set(biblioIds)], ID_CHUNK)) {
    out.push(...(await readAll(client, "/biblios", isMarcList, { q: { biblio_id: part }, orderBy: "+biblio_id", accept: "application/marc-in-json", signal })));
  }
  return out;
}
