/**
 * Canonical normalization for book identity.
 *
 * This is the ONE place that decides what "the same title", "the same ISBN"
 * and "the same person" mean. lib/admin/duplicates.ts re-exports the title and
 * ISBN functions rather than keeping its own copies, so the duplicate review
 * queue and the upload gate can never disagree about what a duplicate is.
 *
 * Pure and browser-safe on purpose: no DB, no server-only imports, so the
 * rules that decide whether a librarian is blocked are unit-testable offline
 * (lib/books/duplicate-detection/normalize.test.ts).
 *
 * BILINGUAL RULE. Khmer carries meaning in combining marks (U+17B6 ា is a
 * vowel sign, category Mn/Mc, NOT a letter), so a normalizer that keeps only
 * \p{L}\p{N} would silently shred every Khmer title into consonant skeletons
 * and cluster unrelated books together. Marks are kept. Latin combining
 * diacritics are stripped first, after NFKD, so "Zoë" and "Zoe" agree — that
 * is folding, not transliteration, and no script is romanised.
 */

/** Latin combining diacritics left behind by NFKD. Khmer marks are not here. */
const LATIN_COMBINING = /[̀-ͯ]/g;

/** Everything that is not a letter, number or combining mark is a separator. */
const NON_WORD = /[^\p{L}\p{N}\p{M}]+/gu;

/**
 * Casefolded, diacritic-folded, punctuation-collapsed title.
 *
 * "Introduction to Psychology", " introduction   to   psychology ",
 * "INTRODUCTION TO PSYCHOLOGY" and "Introduction-to-Psychology" all produce
 * "introduction to psychology".
 */
export function normalizeTitle(title: string | null | undefined): string {
  if (!title) return "";
  return title
    .normalize("NFKD")
    .replace(LATIN_COMBINING, "")
    .toLowerCase()
    .replace(NON_WORD, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Whitespace-separated tokens of a normalized title. Khmer has no word
 *  boundaries, so a Khmer title is legitimately one token — the similarity
 *  layer falls back to character distance for exactly that case. */
export function titleTokens(title: string | null | undefined): string[] {
  const normalized = normalizeTitle(title);
  return normalized ? normalized.split(" ") : [];
}

/* ── Edition awareness ─────────────────────────────────────────────────── */

/**
 * Edition markers, in the forms this collection actually contains: "2nd
 * Edition", "3rd ed.", "second edition", "revised edition", and the Khmer
 * បោះពុម្ពលើកទី N.
 *
 * They matter because "Mathematics" and "Mathematics — 2nd Edition" are the
 * single most common pair that looks like a duplicate and is not. Extracting
 * the marker lets the scorer DEMOTE such a pair instead of blocking it.
 */
const ORDINAL_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};

const EDITION_NUMERIC = /\b(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:ed|edn|edition)\b/;
const EDITION_WORD = new RegExp(`\\b(${Object.keys(ORDINAL_WORDS).join("|")})\\s+edition\\b`);
const EDITION_KHMER = /លើកទី\s*([\d០-៩]{1,2})/;
const EDITION_REVISED = /\b(revised|updated|expanded)\s+(?:ed|edn|edition)\b/;

const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩";

/** Khmer numerals → ASCII, so "លើកទី២" and "2nd edition" compare. */
export function khmerDigitsToAscii(value: string): string {
  return value.replace(/[០-៩]/g, (d) => String(KHMER_DIGITS.indexOf(d)));
}

/**
 * The edition a title declares, or null when it declares none.
 * Returned as a string key ("2", "revised") so comparison is exact and the
 * caller never has to know which pattern matched.
 */
export function editionMarker(title: string | null | undefined): string | null {
  const normalized = normalizeTitle(title);
  if (!normalized) return null;

  const khmer = EDITION_KHMER.exec(normalized);
  if (khmer) return khmerDigitsToAscii(khmer[1]).replace(/^0+(?=\d)/, "");

  const numeric = EDITION_NUMERIC.exec(normalized);
  if (numeric) return String(Number(numeric[1]));

  const word = EDITION_WORD.exec(normalized);
  if (word) return String(ORDINAL_WORDS[word[1]]);

  const revised = EDITION_REVISED.exec(normalized);
  if (revised) return revised[1];

  return null;
}

/** Every edition pattern, so a title can be compared with its marker taken
 *  out. Order does not matter — a title declares at most one. */
const EDITION_PATTERNS = [EDITION_KHMER, EDITION_NUMERIC, EDITION_WORD, EDITION_REVISED];

/**
 * The normalized title with its edition marker removed.
 *
 * "Mathematics, 2nd Edition" and "Mathematics, 3rd Edition" are the same WORK,
 * and the only thing separating them is the marker `editionMarker()` already
 * knows how to find. Comparing the bases says so directly; the scorer used to
 * infer it from whole-string edit distance, which happened to rate the pair
 * alike only because the marker is short next to the title. Stripping is the
 * honest version of that, and it does not weaken when the title is short or
 * the marker is Khmer.
 */
export function titleWithoutEdition(title: string | null | undefined): string {
  let base = normalizeTitle(title);
  if (!base) return "";
  for (const pattern of EDITION_PATTERNS) base = base.replace(pattern, " ");
  return base.replace(/\s+/g, " ").trim();
}

/* ── ISBN ──────────────────────────────────────────────────────────────── */

export type IsbnStatus = "empty" | "invalid" | "valid";

export type IsbnAssessment = {
  status: IsbnStatus;
  /** ISBN-13 form when the input is a well-formed ISBN, else null. */
  canonical: string | null;
  /** What was supplied, before conversion. */
  kind: "isbn10" | "isbn13" | null;
};

/** Bare ISBN characters: digits plus a trailing X check character. */
function isbnDigits(raw: string | null | undefined): string {
  if (!raw) return "";
  return khmerDigitsToAscii(raw).replace(/[^0-9xX]/g, "").toUpperCase();
}

function isbn10CheckDigit(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(first9[i]);
  const check = (11 - (sum % 11)) % 11;
  return check === 10 ? "X" : String(check);
}

function isbn13CheckDigit(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

/** Mechanical ISBN-10 → ISBN-13 conversion (978 prefix, recomputed check). */
export function isbn10To13(isbn10: string): string | null {
  const digits = isbnDigits(isbn10);
  if (digits.length !== 10) return null;
  const body = `978${digits.slice(0, 9)}`;
  if (!/^\d{12}$/.test(body)) return null;
  return body + isbn13CheckDigit(body);
}

/** ISBN-13 (978-prefixed only) → ISBN-10, for matching legacy records. */
export function isbn13To10(isbn13: string): string | null {
  const digits = isbnDigits(isbn13);
  if (digits.length !== 13 || !digits.startsWith("978")) return null;
  const body = digits.slice(3, 12);
  if (!/^\d{9}$/.test(body)) return null;
  return body + isbn10CheckDigit(body);
}

/**
 * Canonical ISBN for MATCHING — always the ISBN-13 form when the input has a
 * usable ISBN shape, so `978-1-23456-789-0` and its ISBN-10 collapse onto one
 * key. Returns null for "N/A", junk, and anything that is not 10 or 13 chars.
 *
 * Deliberately LENIENT about the check digit: two records carrying the same
 * mistyped ISBN are still the same record twice, and refusing to match them
 * would be a duplicate this catalogue then keeps. Checksum validity is a
 * separate question, answered by validateIsbn().
 */
export function normalizeIsbn(isbn: string | null | undefined): string | null {
  if (!isbn) return null;
  const trimmed = isbn.trim();
  if (!trimmed || /^n\/?a$/i.test(trimmed)) return null;
  const digits = isbnDigits(trimmed);
  if (digits.length === 13) return /^\d{13}$/.test(digits) ? digits : null;
  if (digits.length === 10) {
    // X is only ever the ISBN-10 check character.
    if (!/^\d{9}[\dX]$/.test(digits)) return null;
    return isbn10To13(digits) ?? digits;
  }
  return null;
}

/**
 * Every digit string a database row might hold for this ISBN.
 *
 * The `books.isbn` column stores whatever the cataloguer typed, and legacy
 * rows hold ISBN-10s. The candidate query compares the DB's stripped digits
 * against this array, so one lookup finds both forms without the database
 * needing to know the conversion rule.
 */
export function isbnMatchKeys(isbn: string | null | undefined): string[] {
  const canonical = normalizeIsbn(isbn);
  if (!canonical) return [];
  const keys = new Set<string>([canonical]);
  const ten = isbn13To10(canonical);
  if (ten) keys.add(ten);
  const raw = isbnDigits(isbn);
  if (raw.length === 10 || raw.length === 13) keys.add(raw);
  return [...keys];
}

/**
 * Validity, for the form's own feedback — distinct from matching.
 * "invalid" means the check digit does not verify (or the shape is wrong);
 * the librarian is told, and nothing is blocked on that alone.
 */
export function validateIsbn(isbn: string | null | undefined): IsbnAssessment {
  const trimmed = (isbn ?? "").trim();
  if (!trimmed || /^n\/?a$/i.test(trimmed)) return { status: "empty", canonical: null, kind: null };

  const digits = isbnDigits(trimmed);
  if (digits.length === 10 && /^\d{9}[\dX]$/.test(digits)) {
    const ok = isbn10CheckDigit(digits.slice(0, 9)) === digits[9];
    return {
      status: ok ? "valid" : "invalid",
      canonical: ok ? isbn10To13(digits) : null,
      kind: "isbn10",
    };
  }
  if (digits.length === 13 && /^\d{13}$/.test(digits)) {
    const ok = isbn13CheckDigit(digits.slice(0, 12)) === digits[12];
    return { status: ok ? "valid" : "invalid", canonical: ok ? digits : null, kind: "isbn13" };
  }
  return { status: "invalid", canonical: null, kind: null };
}

/* ── People ────────────────────────────────────────────────────────────── */

/** Honorifics and post-nominals that are not part of a person's identity. */
const HONORIFICS = new Set([
  "dr", "prof", "professor", "mr", "mrs", "ms", "miss", "sir", "madam",
  "phd", "ph", "md", "msc", "ma", "ba", "bsc", "edd", "assoc", "asst",
]);

/**
 * Casefolded, honorific-stripped, punctuation-collapsed name.
 * "Dr. John Smith" and "john smith" agree; "John A. Smith" keeps its middle
 * initial, because dropping it would merge two people.
 */
export function normalizePersonName(name: string | null | undefined): string {
  const normalized = normalizeTitle(name);
  if (!normalized) return "";
  const parts = normalized.split(" ").filter((p) => !HONORIFICS.has(p));
  return parts.join(" ").trim();
}

/**
 * Identity key for "is this the same author record?".
 *
 * Only EXACT normalized equality is an identity. "J. Smith" and "John Smith"
 * produce different keys on purpose: the author picker offers the existing
 * record as a suggestion, and a human decides. Nothing in this codebase merges
 * two people because their names looked alike.
 */
export function personNameKey(name: string | null | undefined): string {
  return normalizePersonName(name);
}

/** Placeholder authors that are not evidence of anything. */
const UNKNOWN_AUTHORS = new Set(["", "unknown", "unknown author", "anonymous", "n a", "na"]);

export function isMeaningfulAuthor(name: string | null | undefined): boolean {
  return !UNKNOWN_AUTHORS.has(personNameKey(name));
}

/**
 * Initials-and-surname form: "john a smith" → "j smith".
 * Used only to SUGGEST that "J. Smith" may be the same person as "John Smith";
 * never to decide it.
 */
export function personInitialKey(name: string | null | undefined): string {
  const parts = normalizePersonName(name).split(" ").filter(Boolean);
  if (parts.length < 2) return "";
  const surname = parts[parts.length - 1];
  return `${parts[0][0]} ${surname}`;
}

/* ── Taxonomy ──────────────────────────────────────────────────────────── */

/**
 * Canonical key for a category / department / publisher value, so "Education",
 * "education" and " EDUCATION " resolve to one existing row instead of minting
 * three. Matching only — nothing here renames or merges an existing value.
 */
export function normalizeTaxonomyValue(value: string | null | undefined): string {
  return normalizeTitle(value);
}
