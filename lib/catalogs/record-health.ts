// lib/catalogs/record-health.ts
//
// "What is this record missing, and what does that cost?" — for the librarian
// editing it. Pure, and it DERIVES rather than scores: every check is a fact
// about the saved record, and each failing one names its consequence rather
// than a number. The PMB import sheets are thin in the same ways on every row
// (no ISBN, publisher, year, cover or shelf, and a description that only
// restates the record); a completeness percentage would give all 2,638
// records the same score and say nothing about which gap to fill first.
//
// Two tiers, because the consequences are not equal:
//   • `action` — a reader is affected TODAY: the public page says "no
//     copies", nothing says where the book is shelved, or it appears under no
//     subject;
//   • `info`   — worth filling, nothing visible breaks without it.
//
// There is no search-visibility check: since SEO decision P2-1 no catalogue
// record is indexed (lib/catalogs/indexability.ts), so it would be an
// action-tier failure no edit could fix.

import type { CatalogBook, CopyStats } from "@/lib/catalog";

export type RecordHealthCheckId =
  | "copies"
  | "call-number"
  | "subject"
  | "isbn"
  | "publication"
  | "cover";

export type RecordHealthCheck = {
  id: RecordHealthCheckId;
  tier: "action" | "info";
  ok: boolean;
};

export type RecordHealthInput = Pick<
  CatalogBook,
  | "title"
  | "author"
  | "description"
  | "category"
  | "department"
  | "ddc"
  | "publisher"
  | "shelf_location"
  | "isbn"
  | "year"
  | "cover_url"
>;

const present = (v: string | number | null | undefined) =>
  v != null && String(v).trim() !== "";

export function assessCatalogRecordHealth(book: RecordHealthInput, stats: Pick<CopyStats, "total">): RecordHealthCheck[] {
  return [
    // Withdrawn copies are already excluded from `total`: the public page shows
    // "no copies" for a record whose every copy is withdrawn.
    { id: "copies", tier: "action", ok: stats.total > 0 },
    { id: "call-number", tier: "action", ok: present(book.ddc) || present(book.shelf_location) },
    { id: "subject", tier: "action", ok: present(book.category) },
    { id: "isbn", tier: "info", ok: present(book.isbn) },
    { id: "publication", tier: "info", ok: present(book.publisher) && present(book.year) },
    { id: "cover", tier: "info", ok: present(book.cover_url) },
  ];
}
