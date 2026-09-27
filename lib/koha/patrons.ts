/**
 * Phase 7/8: Koha patrons — finding a library card at the desk, and a linked
 * reader's own loans and holds. READ-ONLY and pure (the client is injected).
 *
 * Koha 26.05.03 permissions (api/v1/swagger/paths, verified):
 *   GET /patrons                      borrowers → list_borrowers
 *   GET /patrons/{id}/checkouts       borrowers → view_checkout_history (read-only;
 *                                     GET /checkouts needs circulate_remaining_permissions,
 *                                     which can also check books out — never used)
 *   GET /patrons/{id}/holds           borrowers → view_holds_history (read-only;
 *                                     GET /holds needs place_holds — never used)
 *
 * Koha's patron record carries address, phone, email and date of birth. The
 * e-Library needs none of it: summarisePatron() keeps only what a librarian
 * needs to confirm a card in person, and nothing else leaves this module.
 */
import type { KohaClient } from "./client";
import { kohaPath } from "./client";

// ── Card lookup ──────────────────────────────────────────────────────────────

/** Everything the e-Library keeps of a Koha patron — to show a librarian, never to store. */
export interface PatronSummary {
  patronId: number;
  cardnumber: string;
  name: string;
  categoryId: string | null;
  libraryId: string | null;
  expiryDate: string | null;
  expired: boolean;
  restricted: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const isPatronList = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.every((x) => isObj(x) && Number.isInteger(x.patron_id));

/** The allow-list: a field not named here never leaves this function. */
export function summarisePatron(p: Record<string, unknown>): PatronSummary {
  const name = [str(p.preferred_name) ?? str(p.firstname), str(p.surname)].filter(Boolean).join(" ") || str(p.cardnumber) || "(no name)";
  return {
    patronId: p.patron_id as number,
    cardnumber: str(p.cardnumber) ?? "",
    name,
    categoryId: str(p.category_id),
    libraryId: str(p.library_id),
    expiryDate: str(p.expiry_date),
    expired: p.expired === true,
    restricted: p.restricted === true,
  };
}

/** A card's last four characters, for display: "•••• 0803". Never the whole number. */
export function cardHint(cardnumber: string): string {
  const c = cardnumber.trim();
  return c.length <= 4 ? `•••• ${c}` : `•••• ${c.slice(-4)}`;
}

/**
 * The one patron with exactly this card number (`_match=exact`: the default is a substring match).
 * `signal` bounds the whole call, retries included — someone is waiting on it.
 */
export async function findPatronByCard(koha: KohaClient, cardnumber: string, signal?: AbortSignal): Promise<PatronSummary | null> {
  const card = cardnumber.trim();
  if (!card) return null;
  const r = await koha.get("/patrons", isPatronList, { query: { cardnumber: card, _match: "exact", _per_page: 2 }, signal });
  const hit = r.data.find((p) => str(p.cardnumber) === card);
  return hit ? summarisePatron(hit) : null;
}

// ── A reader's loans and holds ────────────────────────────────────────────────

export interface LoanView {
  checkoutId: number;
  itemId: number;
  biblioId: number | null;
  barcode: string | null;
  checkoutDate: string | null;
  dueDate: string | null;
  renewals: number;
  overdue: boolean;
}

export type HoldState = "waiting" | "in_transit" | "processing" | "pending";

export interface HoldView {
  holdId: number;
  biblioId: number | null;
  itemId: number | null;
  state: HoldState;
  suspended: boolean;
  /** Queue position while pending (1 = next). */
  priority: number | null;
  holdDate: string | null;
  waitingDate: string | null;
  /** While waiting: the last day it is kept for pickup. */
  expirationDate: string | null;
  pickupLibraryId: string | null;
}

const isCheckoutList = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.every((x) => isObj(x) && Number.isInteger(x.checkout_id) && Number.isInteger(x.item_id));
const isHoldList = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.every((x) => isObj(x) && Number.isInteger(x.hold_id));

export function projectLoan(c: Record<string, unknown>, now: Date): LoanView {
  const item = isObj(c.item) ? c.item : null;
  const due = str(c.due_date);
  return {
    checkoutId: c.checkout_id as number,
    itemId: c.item_id as number,
    biblioId: item && Number.isInteger(item.biblio_id) ? (item.biblio_id as number) : null,
    barcode: item ? str(item.external_id) : null,
    checkoutDate: str(c.checkout_date),
    dueDate: due,
    renewals: Number.isInteger(c.renewals_count) ? (c.renewals_count as number) : 0,
    overdue: !!due && Date.parse(due) < now.getTime(),
  };
}

/** Koha's one-letter hold status: W waiting at pickup, T in transit, P processing; none = in the queue. */
export function holdState(status: unknown): HoldState {
  return status === "W" ? "waiting" : status === "T" ? "in_transit" : status === "P" ? "processing" : "pending";
}

export function projectHold(h: Record<string, unknown>): HoldView {
  return {
    holdId: h.hold_id as number,
    biblioId: Number.isInteger(h.biblio_id) ? (h.biblio_id as number) : null,
    itemId: Number.isInteger(h.item_id) ? (h.item_id as number) : null,
    state: holdState(h.status),
    suspended: h.suspended === true,
    priority: Number.isInteger(h.priority) ? (h.priority as number) : null,
    holdDate: str(h.hold_date),
    waitingDate: str(h.waiting_date),
    expirationDate: str(h.expiration_date),
    pickupLibraryId: str(h.pickup_library_id),
  };
}

/** A reader's current loans, soonest due first. */
export async function readLoans(koha: KohaClient, patronId: number, now = new Date(), signal?: AbortSignal): Promise<LoanView[]> {
  const r = await koha.get(kohaPath("/patrons/{id}/checkouts", { id: patronId }), isCheckoutList, {
    query: { _per_page: 200 },
    embed: ["item"],
    signal,
  });
  return r.data.map((c) => projectLoan(c, now)).sort((a, b) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9"));
}

/** A reader's current holds: waiting for pickup first, then in transit, then the queue. */
export async function readHolds(koha: KohaClient, patronId: number, signal?: AbortSignal): Promise<HoldView[]> {
  const r = await koha.get(kohaPath("/patrons/{id}/holds", { id: patronId }), isHoldList, { query: { _per_page: 200 }, signal });
  const order: Record<HoldState, number> = { waiting: 0, in_transit: 1, processing: 2, pending: 3 };
  return r.data.map(projectHold).sort((a, b) => order[a.state] - order[b.state] || (a.priority ?? 999) - (b.priority ?? 999));
}
