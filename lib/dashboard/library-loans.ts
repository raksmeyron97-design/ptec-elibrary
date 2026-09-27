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
  | { state: "ok"; cardHint: string; loans: MyLoan[]; holds: MyHold[]; asOf: string };
