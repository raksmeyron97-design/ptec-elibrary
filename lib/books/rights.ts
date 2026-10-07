// The rights basis a consumer may ACT on (WI-5, migration 0174). Pure.
//
// One rule, for every future consumer: only a basis a librarian CONFIRMED
// counts, and "we do not know" reads as the restrictive answer. A missing
// row, an unreviewed draft and an explicit 'unknown' are all 'commercial' —
// so no surface can ever open a book because a rule guessed, or because
// nobody looked.

export const RIGHTS_BASES = ["ptec_original", "government_public", "open_licence", "commercial", "unknown"] as const;
export type RightsBasis = (typeof RIGHTS_BASES)[number];

export type BookRightsRow = {
  basis: string | null;
  reviewed_at: string | null;
};

export function isRightsBasis(value: unknown): value is RightsBasis {
  return typeof value === "string" && (RIGHTS_BASES as readonly string[]).includes(value);
}

export function effectiveRightsBasis(row: BookRightsRow | null | undefined): Exclude<RightsBasis, "unknown"> {
  if (!row || !row.reviewed_at || !isRightsBasis(row.basis) || row.basis === "unknown") return "commercial";
  return row.basis;
}
