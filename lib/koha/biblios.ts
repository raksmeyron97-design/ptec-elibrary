/**
 * Read-only biblio lookups. Nothing here writes.
 */
import type { KohaClient } from "./client";
import { isKohaBiblioList, type KohaBiblioSummary } from "./types";

/**
 * Koha records that already carry this ISBN — the "Check Koha duplicate" step
 * of Add by ISBN. `GET /biblios` is a database filter, not a search engine:
 * `isbn` is rewritten to `biblioitem.isbn`, which holds every 020$a joined
 * with " | ", so each form is matched as a substring. An ISBN catalogued WITH
 * hyphens will not match; that is Koha data this lookup reports on, not
 * repairs.
 */
export async function findKohaBiblioIdsByIsbn(
  client: KohaClient,
  isbn13: string,
  isbn10: string | null,
): Promise<KohaBiblioSummary[]> {
  const forms = [isbn13, ...(isbn10 ? [isbn10] : [])];
  const q = JSON.stringify({ "-or": forms.map((f) => ({ isbn: { "-like": `%${f}%` } })) });
  const r = await client.get("/biblios", isKohaBiblioList, { query: { q, _per_page: 5 } });
  return r.data;
}
