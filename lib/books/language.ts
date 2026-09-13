// lib/books/language.ts
//
// THE ONE VOCABULARY for `books.language`, and the one place that knows how to
// read a value that does not match it.
//
// ── The defect this exists to close ─────────────────────────────────────────
//
// `books.language` is free text. The upload form has only ever offered two
// options — "Khmer" and "English" — but an import path wrote raw codes, and
// production ended up holding FIVE spellings of two languages (measured
// 2026-09-13):
//
//   Khmer    157      English  102
//   kh        35      en         1      khmer  1
//
// That is not cosmetic. `languageCode()` mapped `khmer`, `km`, `english` and
// `en` but not `kh`, so **35 published books — 11.8% of the catalogue — emitted
// no `inLanguage` at all** in their Book JSON-LD. Verified on the live site
// before this module existed: /books/រុក្ខវិទ្យា-1 had no `inLanguage`, while
// an otherwise identical Khmer book had `"km"`.
//
// The facet sidebar had the same fracture from the other side: the value shown
// to a reader is the stored string, so "Khmer", "kh" and "khmer" appeared as
// three separate filter chips over one language.
//
// ── Why this vocabulary and not ISO codes ───────────────────────────────────
//
// `catalog_books.language` already uses ISO-ish codes (`km`/`en`/`fr`/`zh`/
// `other`, normalized by lib/catalog-import.ts) and that is correct for a MARC-
// shaped physical catalogue. `books.language` is a DISPLAY string: it is
// rendered to readers on the detail page, and it is the facet value itself.
// Unifying the two would change what a reader sees and what every existing
// `?language=` filter matches, for no gain. They stay separate, deliberately,
// and this file says so once rather than each caller guessing.
//
// ── Unknown values are preserved, never destroyed ───────────────────────────
//
// A language this library has not catalogued before is a cataloguing fact, not
// a typo. `normalizeBookLanguage()` returns the trimmed original for anything
// it does not recognise, so a French book stays French and simply does not get
// a canonical spelling until someone adds one. The alternative — folding the
// unknown into a default — is how 35 books came to claim they were something
// they are not.

/** The canonical spellings, and the only options the upload form offers. */
export const BOOK_LANGUAGES = ["Khmer", "English"] as const;
export type BookLanguage = (typeof BOOK_LANGUAGES)[number];

/**
 * Every spelling seen in production or plausibly produced by an import,
 * folded to lowercase, mapped to its canonical display name.
 *
 * `kh` is in here and is NOT a real ISO code for Khmer (that is `km`) — it is
 * what an import actually wrote, 35 times, and a vocabulary that only accepts
 * correct input is not a normalizer.
 */
const ALIASES: Record<string, BookLanguage> = {
  khmer: "Khmer",
  km: "Khmer",
  kh: "Khmer",
  kmr: "Khmer",
  "km-kh": "Khmer",
  ខ្មែរ: "Khmer",
  ភាសាខ្មែរ: "Khmer",
  cambodian: "Khmer",
  english: "English",
  en: "English",
  eng: "English",
  "en-us": "English",
  "en-gb": "English",
  អង់គ្លេស: "English",
  ភាសាអង់គ្លេស: "English",
};

/** BCP-47 for each canonical spelling. */
const BCP47: Record<BookLanguage, string> = { Khmer: "km", English: "en" };

/** Languages this library holds but has no canonical display spelling for. */
// Kept in step with lib/catalog-import.ts's LANGUAGE_ALIASES, which is the
// physical catalogue's equivalent table. The two vocabularies stay separate —
// see the header — but a spelling one of them recognises should not be a
// mystery to the other.
const EXTRA_BCP47: Record<string, string> = {
  french: "fr", fr: "fr", fra: "fr", fre: "fr", "fr-fr": "fr", បារាំង: "fr",
  chinese: "zh", zh: "zh", chi: "zh", zho: "zh", mandarin: "zh", ចិន: "zh",
};

function fold(value: string | null | undefined): string {
  return (value ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The canonical display spelling for a stored language value.
 *
 * Returns `null` for empty input — absent is a real answer and must not become
 * a default. Returns the TRIMMED ORIGINAL for a value it does not recognise,
 * so an uncatalogued language survives contact with this function.
 */
export function normalizeBookLanguage(raw: string | null | undefined): string | null {
  const folded = fold(raw);
  if (!folded) return null;
  return ALIASES[folded] ?? (raw ?? "").trim();
}

/**
 * BCP-47 code for a stored language value, or undefined when this library
 * cannot say.
 *
 * `undefined` is deliberate and must stay: omitting `inLanguage` is honest,
 * while guessing `"en"` for an unrecognised value publishes a false claim about
 * a book in a language nobody recorded.
 */
export function bookLanguageCode(raw: string | null | undefined): string | undefined {
  const folded = fold(raw);
  if (!folded) return undefined;
  const canonical = ALIASES[folded];
  if (canonical) return BCP47[canonical];
  return EXTRA_BCP47[folded];
}

/** Does this value already carry its canonical spelling? */
export function isCanonicalBookLanguage(raw: string | null | undefined): boolean {
  const value = (raw ?? "").trim();
  if (!value) return false;
  return (BOOK_LANGUAGES as readonly string[]).includes(value);
}
