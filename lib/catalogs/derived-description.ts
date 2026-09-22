// lib/catalogs/derived-description.ts
//
// Is this catalogue description actually ABOUT the book, or is it the record
// read back to itself?
//
// ── The defect this exists for ───────────────────────────────────────────────
//
// `assessCatalogIndexability()` indexed any record whose own description
// cleared 40 characters. Measured on production 2026-09-21, all six live
// records cleared it with text like:
//
//     "Social sciences by Martin Ann M. DDC call number: 300 MAR."
//
// 58 characters, and every one of them is a field the page already prints:
// the department, the author and the call number. It tells a reader nothing
// the title bar does not, and it is not a description — it is the record,
// rendered as a sentence. All six pages were `index, follow`.
//
// The source is the staged PMB import sheets (`import-csv/ptec-books-part*.xlsx`,
// the `description` column). **All 13,429 rows carry one**, in 53 shapes, and
// not one row carries editorial prose. So this is not six thin pages; it is
// 13,429 waiting for the import to run.
//
// ── The rule ─────────────────────────────────────────────────────────────────
//
// Strip the record's OWN field values out of its description, strip the
// template's own connective words, and count the LETTERS that remain.
//
// Letters, not characters: `"។ ។ ៖ ."` is four characters of punctuation and
// says nothing, and a bare call number is digits.
//
// TWO SIGNALS MUST AGREE, and the second one is not decoration. "Derived"
// has to mean *the record accounted for this text*, not *this text is
// short* — the length floor already answers shortness, and conflating them
// refuses genuine writing. Measured while building this: a real 69-character
// Khmer sentence sharing NOTHING with its record left 39 letters and was
// called derived, purely for being one letter under the floor. Nothing had
// been stripped from it at all.
//
// So a description is derived only when
//
//   • under `MIN_NOVEL_DESCRIPTION_CHARS` letters survive, AND
//   • at least `MIN_DERIVED_SHARE` of its letters were accounted for by the
//     record's own values and the template's words.
//
// This is the rule `lib/ai/page-quality.ts` uses for the same reason:
// dropping a template costs nothing, dropping a librarian's sentence costs
// a real page its ranking.
//
// ── What this rule can and cannot do ─────────────────────────────────────────
//
// The connective list is a CLOSED vocabulary and has to be: the template's
// joining words ("by", "DDC call number", "និពន្ធដោយ") are not field values,
// so stripping field values alone leaves them behind and a Khmer template
// clears 40 characters on its scaffolding alone.
//
// That means a NEW template, phrased differently, would pass until its words
// are added here — the rule is conservative in the wrong direction for an
// unseen shape. It is pinned against all 53 shapes present in the import
// sheets, which is every shape this library's data actually contains; a new
// one arriving is a reason to extend the list, and `derived-description.test.ts`
// is where the evidence goes.

/** The fields a description could be echoing back. */
export interface CatalogDescriptionSource {
  description?: string | null;
  title?: string | null;
  author?: string | null;
  category?: string | null;
  department?: string | null;
  ddc?: string | null;
  publisher?: string | null;
  shelfLocation?: string | null;
}

/**
 * Letters of genuinely new text a description must carry.
 *
 * Deliberately the same number as `CATALOG_MIN_DESCRIPTION_CHARS`: the old
 * gate asked for 40 characters of anything, this one asks for 40 letters of
 * something. One short sentence either way.
 */
export const MIN_NOVEL_DESCRIPTION_CHARS = 40;

/**
 * How much of a description the record must account for before "derived" is
 * the honest word for it.
 *
 * Half. A template scores ~1.0 (every letter came from a field or a
 * connective); an independent sentence scores ~0. There is a lot of room
 * between those, which is why the exact value is not delicate.
 */
export const MIN_DERIVED_SHARE = 0.5;

/**
 * The template's own joining words, in both languages the sheets use.
 *
 * Longest first, because `DDC` occurs inside the Khmer phrase and a shorter
 * match would strand the rest. Matched case-insensitively for Latin; Khmer
 * has no case.
 */
const TEMPLATE_CONNECTIVES: readonly string[] = [
  // Khmer, as the sheets write it
  "សៀវភៅក្នុងចំណាត់ថ្នាក់",
  "លេខរៀបចំតាមប្រព័ន្ធ",
  "និពន្ធដោយ",
  // English
  "ddc call number",
  "call number",
  "classification",
  "published by",
  "written by",
  "shelved at",
  "category",
  "author",
  "book in",
  "ddc",
  "by",
];

/**
 * The category, as the template writes it in the OTHER language.
 *
 * The `category` column holds Khmer ("300 វិទ្យាសាស្ត្រសង្គម") while the
 * English template writes the Dewey class in English ("Social sciences"), so
 * the row's own value strips nothing and 130 rows survived on the class name
 * alone. These are the ten Dewey classes plus the three local shelves this
 * library adds, which is a closed list — a new one is a data question, and
 * the test that counts the sheets is where it would show up.
 */
const CATEGORY_LABELS: readonly string[] = [
  "General knowledge and information science",
  "Natural sciences and mathematics",
  "Technology and applied sciences",
  "Philosophy and psychology",
  "Education and pedagogy",
  "History and geography",
  "Arts and recreation",
  "Social sciences",
  "Novel / fiction",
  "Core textbook",
  "Literature",
  "Religion",
  "Languages",
  "Language",
];

const LETTER = /\p{L}/gu;

function countLetters(s: string): number {
  return (s.match(LETTER) ?? []).length;
}

/**
 * Remove a WHOLE WORD, case-insensitively, leaving partial matches alone.
 *
 * Substring removal is wrong for Latin text and was actively destructive:
 * the word `for` from a title deleted the middle of `information`, which
 * corrupted a category label so the label pass could no longer match it, and
 * 12 templates survived on the damage. Khmer has no word boundaries, so
 * Khmer values are handled by the whole-value substring pass instead — this
 * function is only ever given space-delimited words.
 */
function removeWord(haystack: string, word: string): string {
  const w = word.trim();
  if (!w) return haystack;
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // A "boundary" here is anything that is not a letter or a digit, so
  // `\b` (ASCII-defined, and this corpus is bilingual) is not used.
  return haystack.replace(
    new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=[^\\p{L}\\p{N}]|$)`, "giu"),
    "$1",
  );
}

/** Remove every occurrence of `needle`, case-insensitively, without regex. */
function removeAll(haystack: string, needle: string): string {
  const n = needle.trim();
  if (!n) return haystack;
  let out = "";
  let i = 0;
  const lowHay = haystack.toLowerCase();
  const lowNeedle = n.toLowerCase();
  for (;;) {
    const at = lowHay.indexOf(lowNeedle, i);
    if (at === -1) {
      out += haystack.slice(i);
      return out;
    }
    out += haystack.slice(i, at);
    i = at + lowNeedle.length;
  }
}

/**
 * What a description says that the record does not already say.
 *
 * Exposed as a measurement, not just a verdict, so the admin data-quality
 * surface and the import preview can show a librarian HOW far a row is from
 * earning an index rather than only that it did not.
 */
export function describeNovelty(source: CatalogDescriptionSource): {
  /** Letters left once the record's own values and the template words go. */
  novelChars: number;
  /** Share of the description's letters the record accounted for, 0–1. */
  accountedShare: number;
  /** What was left, for a report. */
  remainder: string;
  /** True when the description is the record read back to itself. */
  derived: boolean;
} {
  const description = source.description?.trim() ?? "";
  if (!description) {
    return { novelChars: 0, accountedShare: 0, remainder: "", derived: false };
  }
  const totalLetters = countLetters(description);

  let rest = description;

  // The record's own values, longest first so a value containing another
  // (a shelf location inside a call number) cannot strand a fragment.
  const values = [
    source.title,
    source.author,
    source.category,
    source.department,
    source.ddc,
    source.publisher,
    source.shelfLocation,
  ]
    .map((v) => (v ?? "").trim())
    .filter((v) => v.length > 1)
    .sort((a, b) => b.length - a.length);

  for (const v of values) rest = removeAll(rest, v);

  // ORDER MATTERS. The multi-word phrases go before the single words, or a
  // word removed from inside a phrase stops the phrase from matching — see
  // removeWord() for the case that caught this.
  for (const label of CATEGORY_LABELS) rest = removeAll(rest, label);
  for (const c of TEMPLATE_CONNECTIVES) rest = removeAll(rest, c);

  // A department is often "Department of X" where the description says only
  // "X", so the individual words of each value go too — as whole words.
  // Khmer has no spaces, so this contributes nothing there and the
  // whole-value pass above is what does the work.
  for (const v of values) {
    for (const word of v.split(/[\s,./()\-]+/)) {
      if (countLetters(word) >= 3) rest = removeWord(rest, word);
    }
  }

  const novelChars = countLetters(rest);
  const accountedShare =
    totalLetters === 0 ? 0 : (totalLetters - novelChars) / totalLetters;

  return {
    novelChars,
    accountedShare,
    remainder: rest.replace(/\s+/g, " ").trim(),
    derived:
      novelChars < MIN_NOVEL_DESCRIPTION_CHARS &&
      accountedShare >= MIN_DERIVED_SHARE,
  };
}

/**
 * True when the description only restates the record.
 *
 * An ABSENT description is not "derived" — it is absent, which the
 * indexability gate already handles as `record-only`. Keeping those two
 * apart matters for the reason given to a librarian: "write one" and "write
 * a real one" are different instructions.
 */
export function isDerivedDescription(source: CatalogDescriptionSource): boolean {
  return describeNovelty(source).derived;
}
