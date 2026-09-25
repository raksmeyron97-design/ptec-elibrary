/**
 * What a librarian typed or scanned into "Add by ISBN", read strictly.
 *
 * Built on the library's one ISBN implementation
 * (lib/books/duplicate-detection/normalize.ts) — hyphens, spaces and Khmer
 * digits are tolerated, an ISBN-10 becomes its ISBN-13 — but unlike matching,
 * a LOOKUP refuses a bad check digit: sending a mistyped ISBN to a provider
 * would fetch a different book and present it as this one. The input is never
 * silently corrected.
 */
import { isbn13To10, validateIsbn } from "@/lib/books/duplicate-detection/normalize";

export type ParsedIsbn =
  | { ok: true; isbn13: string; isbn10: string | null; inputKind: "isbn10" | "isbn13" }
  | { ok: false; reason: "empty" | "not_an_isbn" | "bad_check_digit" };

export function parseIsbnInput(raw: string | null | undefined): ParsedIsbn {
  const v = validateIsbn(raw);
  if (v.status === "empty") return { ok: false, reason: "empty" };
  if (v.status === "invalid") return { ok: false, reason: v.kind ? "bad_check_digit" : "not_an_isbn" };
  const isbn13 = v.canonical!;
  return { ok: true, isbn13, isbn10: isbn13To10(isbn13), inputKind: v.kind! };
}
