// The shape of GET /api/me/library-loans (Koha Phase 7/8, docs/KOHA-PATRONS.md).
// Shared by the server (lib/koha/patron-server.ts) and the dashboard panel;
// deliberately free of any lib/koha import, so a client component may use it.

export type HoldState = "waiting" | "in_transit" | "processing" | "pending";

export interface MyLoan {
  /** Koha's checkout id: a stable list key, nothing more. */
  id: number;
  title: string | null;
  /** The /catalogs slug when the record is listed; null otherwise. */
  slug: string | null;
  barcode: string | null;
  checkoutDate: string | null;
  dueDate: string | null;
  renewals: number;
  overdue: boolean;
  /**
   * Whether Koha would renew it online now (Phase 10.1), asked of the PTEC
   * Reader Services plugin — only while KOHA_READER_RENEWALS is on. Absent =
   * renewals are not offered; null = Koha could not say, so the Renew button
   * is offered and Koha answers when it is pressed.
   */
  renewal?: RenewalView | null;
}

/** Koha's verdict on renewing one loan online, as the plugin states it. */
export interface RenewalView {
  allowed: boolean;
  /** Koha's own code when it would refuse (too_many, on_reserve, …), else null. */
  code: string | null;
  /** The loan's renewal limit, when a lending rule sets one. */
  max: number | null;
  /** For too_soon: the first moment it can be renewed. */
  soonest: string | null;
}

/** What pressing Renew did (the renewLibraryLoan server action). */
export type RenewResult =
  | { status: "renewed"; dueDate: string | null; renewals: number }
  | { status: "refused"; code: string }
  /** Koha may or may not have renewed it (a timeout); it was NOT sent twice. */
  | { status: "unconfirmed" }
  | { status: "not_found" }
  | { status: "unavailable" }
  | { status: "rate_limited" }
  | { status: "off" };

/**
 * The dashboard message for each code Koha (or the plugin) gives for a
 * renewal it will not do. Every code CanBookBeRenewed returns in Koha 26.05.03,
 * plus the plugin's own; anything else says "the library's rules" rather than
 * showing a raw code.
 */
const RENEWAL_MESSAGES: Record<string, string> = {
  too_many: "renewTooMany",
  too_unseen: "renewTooMany",
  on_reserve: "renewOnReserve",
  recalled: "renewOnReserve",
  booked: "renewOnReserve",
  too_soon: "renewTooSoon",
  overdue: "renewOverdue",
  too_much_owing: "renewFines",
  auto_too_much_owing: "renewFines",
  restriction: "renewRestricted",
  card_expired: "renewCardExpired",
  auto_account_expired: "renewCardExpired",
  online_renewal_disabled: "renewDisabled",
  item_denied_renewal: "renewNotAllowed",
  onsite_checkout: "renewNotAllowed",
  auto_too_late: "renewNotAllowed",
};

export function renewalMessageKey(code: string | null): string {
  return (code && RENEWAL_MESSAGES[code]) || "renewRefused";
}

export interface MyHold {
  /** Koha's hold id: a stable list key, nothing more. */
  id: number;
  title: string | null;
  slug: string | null;
  state: HoldState;
  suspended: boolean;
  priority: number | null;
  holdDate: string | null;
  waitingDate: string | null;
  expirationDate: string | null;
}

export type MyLibrary =
  | { state: "off" }
  | { state: "unlinked" }
  | { state: "unavailable"; cardHint: string | null }
  | { state: "ok"; cardHint: string; loans: MyLoan[]; holds: MyHold[]; asOf: string; renewalsOnline?: boolean };
