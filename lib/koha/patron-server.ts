/**
 * Phase 7/8 on the server: a reader's own loans and holds, and the desk's
 * card lookup. Server-only — it holds the configured client and the service
 * database client.
 *
 * Three rules (docs/KOHA-PATRONS.md):
 *   • The patron is always the one LINKED to the signed-in reader, read from
 *     koha_patron_links by the caller's profile id — never an id a browser
 *     sends. There is no way to ask for someone else's loans.
 *   • A failed read is "unavailable", never "no loans". A reader told "nothing
 *     on loan" while Koha is down may not return a book on time.
 *   • Koha is read at most once a minute per reader (Koha runs two Plack
 *     workers; a dashboard is opened far more often than loans change).
 *   • Someone is waiting on every call here, so each has ONE budget, retries
 *     included: at the client's default (three attempts of 8 s) a Koha that
 *     does not answer kept the panel on "Loading…" for 28 s, measured.
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { getKohaClient, getKohaConfig } from "./index";
import { kohaCanHoldForReaders, kohaCanReadPatrons, kohaCanRenewForReaders } from "./config";
import { catalogAvailabilityIsLive } from "@/lib/catalogs/availability-live";
import { findPatronByCard, readHolds, readLoans, type HoldView, type LoanView, type PatronSummary } from "./patrons";
import { renewabilityForLoans } from "./renewals";
import type { MyLibrary, RenewalView, TitleHoldStatus } from "@/lib/dashboard/library-loans";

/** Card lookup, links and My Library loans are on: KOHA_READ_PATRONS=on with a working integration. */
export const kohaReadsPatrons = () => kohaCanReadPatrons(getKohaConfig());

/** Readers may renew their own loans online (Phase 10.1): KOHA_READER_RENEWALS=on as well. */
export const kohaRenewsForReaders = () => kohaCanRenewForReaders(getKohaConfig());

/**
 * Readers may place and cancel their own holds online (Phase 10.2):
 * KOHA_READER_HOLDS=on, AND print availability live. Until the desk has
 * re-issued the PMB loans Koha does not know which copies are really out, so
 * "no copy on the shelf — place a hold" would be a claim about a database,
 * not a shelf (approved 2026-09-29).
 */
export const kohaHoldsForReaders = () => kohaCanHoldForReaders(getKohaConfig()) && catalogAvailabilityIsLive();

/** The whole budget of one interactive Koha read, retries included. */
export const PATRON_READ_BUDGET_MS = 10_000;

export const lookupCard = (cardnumber: string): Promise<PatronSummary | null> =>
  findPatronByCard(getKohaClient(), cardnumber, AbortSignal.timeout(PATRON_READ_BUDGET_MS));

export type { MyHold, MyLibrary, MyLoan } from "@/lib/dashboard/library-loans";

const TTL_MS = 60_000;
const MAX_ENTRIES = 5_000;
type Entry = { at: number; loans: LoanView[]; holds: HoldView[]; renewability: Map<number, RenewalView | null> | null };
// One cache per PROCESS, not per module instance. A route handler and a
// server action can each load their own copy of this module (measured on
// the dev server, 2026-09-29: a renewal's forgetPatron() cleared the action's
// copy, and the loans route kept serving the pre-renewal due date for up to a
// minute). Every copy shares globalThis, so a forget reaches every reader.
const shared = globalThis as typeof globalThis & { __ptecKohaPatronCache?: Map<number, Entry> };
const cache = (shared.__ptecKohaPatronCache ??= new Map<number, Entry>());

async function koha(patronId: number): Promise<Entry> {
  const hit = cache.get(patronId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  const client = getKohaClient();
  const budget = AbortSignal.timeout(PATRON_READ_BUDGET_MS);
  const [loans, holds] = await Promise.all([readLoans(client, patronId, new Date(), budget), readHolds(client, patronId, budget)]);
  // Whether each loan can be renewed online, asked only while renewals are on.
  // Its own budget: the verdicts are extra, and a slow answer costs a verdict
  // (the loan shows without one), never the loans.
  const renewability = kohaRenewsForReaders() && loans.length
    ? await renewabilityForLoans(client, patronId, loans.map((l) => l.checkoutId), AbortSignal.timeout(PATRON_READ_BUDGET_MS))
    : null;
  const entry: Entry = { at: Date.now(), loans, holds, renewability };
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as number);
  cache.set(patronId, entry);
  return entry;
}

/** Forget a patron's cached loans — after a link or unlink, a renewal or a hold, so the next view is fresh. */
export function forgetPatron(patronId: number): void {
  cache.delete(patronId);
}

/**
 * The Koha patron linked to this reader. `null` = no link; "unavailable" =
 * we could not tell (no table before 0159 counts as no link).
 */
export async function linkedPatron(profileId: string): Promise<{ patronId: number; cardHint: string } | null | "unavailable"> {
  const db = createServiceClient();
  const { data: link, error } = await db
    .from("koha_patron_links").select("koha_patron_id, card_hint").eq("profile_id", profileId).maybeSingle();
  if (error) return error.code === "42P01" || /koha_patron_links/.test(error.message ?? "") ? null : "unavailable";
  return link ? { patronId: link.koha_patron_id, cardHint: link.card_hint } : null;
}

/** A reader's loans read NOW, past the cache — what a renewal is checked against. */
export const freshLoans = (patronId: number): Promise<LoanView[]> =>
  readLoans(getKohaClient(), patronId, new Date(), AbortSignal.timeout(PATRON_READ_BUDGET_MS));

/** A reader's holds read NOW, past the cache — what a hold is placed and cancelled against. */
export const freshHolds = (patronId: number): Promise<HoldView[]> =>
  readHolds(getKohaClient(), patronId, AbortSignal.timeout(PATRON_READ_BUDGET_MS));

/**
 * The Koha record behind a Physical Library slug, if a reader may hold it:
 * listed, and linked to Koha by the sync. `null` = not holdable; "unavailable"
 * = the database did not answer.
 */
export async function holdableRecord(slug: string): Promise<{ biblioId: number } | null | "unavailable"> {
  const { data, error } = await createServiceClient()
    .from("catalog_books").select("koha_biblio_id").eq("slug", slug).eq("is_active", true).maybeSingle();
  if (error) return "unavailable";
  return data && Number.isSafeInteger(data.koha_biblio_id) && data.koha_biblio_id > 0 ? { biblioId: data.koha_biblio_id } : null;
}

/**
 * What the Physical Library page shows THIS reader about THIS title: whether
 * they already hold it or have it on loan (from the minute-cached read the
 * dashboard shares), so the page offers "Place a hold" only to a reader who
 * could place one. A hint — Koha decides again when the button is pressed.
 */
export async function titleHoldStatus(profileId: string, slug: string): Promise<TitleHoldStatus> {
  if (!kohaHoldsForReaders()) return { state: "off" };
  const record = await holdableRecord(slug);
  if (record === "unavailable") return { state: "unavailable" };
  if (!record) return { state: "off" };
  const link = await linkedPatron(profileId);
  if (link === "unavailable") return { state: "unavailable" };
  if (!link) return { state: "unlinked" };
  let data: Entry;
  try {
    data = await koha(link.patronId);
  } catch {
    return { state: "unavailable" };
  }
  const hold = data.holds.find((h) => h.biblioId === record.biblioId);
  if (hold) return { state: "ok", existing: { kind: "hold", holdState: hold.state, priority: hold.priority } };
  const loan = data.loans.find((l) => l.biblioId === record.biblioId);
  if (loan) return { state: "ok", existing: { kind: "loan", dueDate: loan.dueDate } };
  return { state: "ok", existing: null };
}

export async function myLibrary(profileId: string): Promise<MyLibrary> {
  if (!kohaReadsPatrons()) return { state: "off" };
  const db = createServiceClient();
  const { data: link, error } = await db
    .from("koha_patron_links").select("koha_patron_id, card_hint").eq("profile_id", profileId).maybeSingle();
  if (error) {
    // No table yet (the window before 0159 is applied) is "off"; anything else we cannot tell.
    if (error.code === "42P01" || /koha_patron_links/.test(error.message ?? "")) return { state: "off" };
    return { state: "unavailable", cardHint: null };
  }
  if (!link) return { state: "unlinked" };

  let data: Awaited<ReturnType<typeof koha>>;
  try {
    data = await koha(link.koha_patron_id);
  } catch {
    return { state: "unavailable", cardHint: link.card_hint };
  }

  // Titles from the e-Library's own catalogue: a loan by its copy (koha_item_id),
  // else its record; a hold by its record. A title the sync has not brought yet
  // is shown without one rather than guessed.
  const itemIds = data.loans.map((l) => l.itemId);
  const { data: copies } = itemIds.length
    ? await db.from("catalog_copies").select("koha_item_id, catalog_book_id").in("koha_item_id", itemIds)
    : { data: [] as { koha_item_id: number; catalog_book_id: string }[] };
  const bookIdByItem = new Map((copies ?? []).map((c) => [c.koha_item_id, c.catalog_book_id]));
  const biblioIds = [...new Set([...data.loans.map((l) => l.biblioId), ...data.holds.map((h) => h.biblioId)].filter((x): x is number => x !== null))];
  const bookIds = [...new Set([...bookIdByItem.values()])];
  const [{ data: byId }, { data: byBiblio }] = await Promise.all([
    bookIds.length ? db.from("catalog_books").select("id, title, slug, is_active, koha_biblio_id").in("id", bookIds) : Promise.resolve({ data: [] }),
    biblioIds.length ? db.from("catalog_books").select("id, title, slug, is_active, koha_biblio_id").in("koha_biblio_id", biblioIds) : Promise.resolve({ data: [] }),
  ]);
  type Book = { id: string; title: string; slug: string; is_active: boolean; koha_biblio_id: number | null };
  const books = new Map<string, Book>([...(byId ?? []), ...(byBiblio ?? [])].map((b: Book) => [b.id, b]));
  const bookByBiblio = new Map([...books.values()].filter((b) => b.koha_biblio_id != null).map((b) => [b.koha_biblio_id as number, b]));
  const show = (b: Book | undefined) => ({ title: b?.title ?? null, slug: b && b.is_active ? b.slug : null });

  return {
    state: "ok",
    cardHint: link.card_hint,
    asOf: new Date(data.at).toISOString(),
    renewalsOnline: kohaRenewsForReaders(),
    holdsOnline: kohaHoldsForReaders(),
    loans: data.loans.map((l) => {
      const bookId = bookIdByItem.get(l.itemId);
      const b = (bookId ? books.get(bookId) : undefined) ?? (l.biblioId !== null ? bookByBiblio.get(l.biblioId) : undefined);
      return {
        id: l.checkoutId, ...show(b), barcode: l.barcode, checkoutDate: l.checkoutDate, dueDate: l.dueDate, renewals: l.renewals, overdue: l.overdue,
        ...(data.renewability ? { renewal: data.renewability.get(l.checkoutId) ?? null } : {}),
      };
    }),
    holds: data.holds.map((h) => ({
      id: h.holdId,
      ...show(h.biblioId !== null ? bookByBiblio.get(h.biblioId) : undefined),
      state: h.state, suspended: h.suspended, priority: h.priority,
      holdDate: h.holdDate, waitingDate: h.waitingDate, expirationDate: h.expirationDate,
      cancellationRequested: h.cancellationRequested,
    })),
  };
}
