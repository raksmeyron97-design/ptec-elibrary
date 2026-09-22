// lib/catalogs/author-name.ts
//
// A physical-catalogue byline is catalogued SURNAME-FIRST. Reading it back
// to a human means putting it the other way round — and knowing when you
// cannot.
//
// ── What went wrong ──────────────────────────────────────────────────────────
//
// PMB stores `"Martin, Ann M."`. The live catalogue published
// `<Person name="Martin Ann M.">`, which a reader and a search engine both
// read as a person whose given name is Martin. Same for `"Hattie John"`,
// which is John Hattie, and `"Colfer Eoin"`, which is Eoin Colfer.
//
// ── The rule, and the line it will not cross ─────────────────────────────────
//
// STORAGE keeps the catalogued form. `catalog_books.author` stays exactly as
// the librarian entered it, because the inverted form is the correct filing
// form and re-ordering the column would destroy the only evidence of which
// part is the surname.
//
// DISPLAY acts only on the evidence of a comma, and WHAT it does depends on
// the script, because the two scripts file names the same way and read them
// differently:
//
//   "Martin, Ann M."   → "Ann M. Martin"   LATIN, one comma: the comma says
//                                          where the surname ends, and the
//                                          natural order is given-first
//   "ហង់ជួន, ណារ៉ុន"      → "ហង់ជួន ណារ៉ុន"     KHMER, one comma: the written
//                                          order is ALREADY correct — Khmer
//                                          is family-name-first in normal
//                                          use — so only the comma goes
//   "Sok, ដារ៉ា"         → unchanged, FLAGGED  mixed script: we do not know
//                                          which convention applies
//   "Hattie John"      → unchanged         no comma: nothing states the
//                                          boundary
//   "Cohen, L, Manion" → unchanged, FLAGGED  two commas: one person with a
//                                          suffix, or three people
//
// **A comma-less name is never re-ordered.** That is the whole discipline
// here, and it costs us the six records live today.
//
// Their commas were not lost by any script — checked against the PMB export
// itself (`import-csv/title_books_in_PMB_System.xlsx`, snapshot 27/05/2026):
// of 12,956 authors, exactly **70** carry a comma, all Latin, and
// `Martin Ann M.`, `Hattie John` and `Colfer Eoin` appear there verbatim,
// comma-less. That is how the library catalogued them. There is nothing
// upstream to recover and no re-export will produce one.
//
// So `Hattie John` IS the wrong way round, and this module will NOT fix it:
// the only way to know that is to recognise John Hattie, and a rule that
// guessed would reorder `គីម ថែខ្វាន់` — a Khmer name that is correctly
// family-name-first and must be left exactly as it is. Correcting those
// bylines is cataloguing work, not a data migration.

/** How many top-level commas the byline has. */
function commaCount(s: string): number {
  return (s.match(/,/g) ?? []).length;
}

/**
 * Which writing system the byline is in.
 *
 * Three-way on purpose. `hasKhmer()` and `titleScript()` already exist in
 * this repo and both answer khmer-or-latin, which cannot express the case
 * that actually needs a human: a byline carrying BOTH scripts, where the two
 * conventions disagree and neither is safe to apply.
 */
export type NameScript = "latin" | "khmer" | "mixed" | "unknown";

const KHMER_CHAR = /[ក-៿]/;
const LATIN_LETTER = /\p{Script=Latin}/u;

export function nameScript(raw: string | null | undefined): NameScript {
  const s = raw ?? "";
  const khmer = KHMER_CHAR.test(s);
  const latin = LATIN_LETTER.test(s);
  if (khmer && latin) return "mixed";
  if (khmer) return "khmer";
  if (latin) return "latin";
  return "unknown";
}

/** What was done to the stored form to get the displayed one. */
export type NameAction = "reordered" | "comma-removed" | "unchanged";

export interface ResolvedAuthorName {
  /** What a reader is shown. */
  display: string;
  script: NameScript;
  action: NameAction;
  /**
   * The byline carries a comma — the marker that states a name's parts —
   * and we did NOT act on it. Somebody should look.
   *
   * Deliberately narrow. A comma-LESS name is not flagged even though it may
   * well be surname-first: there are 13,359 of those in the import sheets
   * and flagging all of them would be noise, not a queue. `statesNameOrder()`
   * is there for counting that population separately.
   */
  flagged: boolean;
  /** Why it was flagged, for the report. */
  reason?: string;
}

/**
 * The full decision, with its reasoning, for a report or a review queue.
 * `displayAuthorName()` is this function's `display` field and nothing more.
 */
export function resolveAuthorName(raw: string | null | undefined): ResolvedAuthorName {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  const script = nameScript(name);
  const unchanged = (flagged = false, reason?: string): ResolvedAuthorName => ({
    display: name,
    script,
    action: "unchanged",
    flagged,
    reason,
  });

  if (!name) return { display: "", script, action: "unchanged", flagged: false };

  const commas = commaCount(name);
  if (commas === 0) return unchanged();
  if (commas > 1) {
    return unchanged(true, "more than one comma — a suffix, or several people");
  }

  const [first, second] = name.split(",");
  const a = first.trim();
  const b = second.trim();
  if (!a || !b) return unchanged(true, "a comma with nothing on one side of it");

  if (script === "mixed" || script === "unknown") {
    return unchanged(
      true,
      script === "mixed"
        ? "mixed scripts — Latin reads given-first, Khmer family-first, and we cannot tell which applies"
        : "no Latin or Khmer letters — the convention is unknown",
    );
  }

  if (script === "khmer") {
    // The written order is already the natural one. Only the filing comma
    // is removed; reordering here would be the corruption this module was
    // written to avoid.
    return { display: `${a} ${b}`, script, action: "comma-removed", flagged: false };
  }

  // Latin: a trailing generational or honorific suffix is not a given name,
  // and "King, Jr." must not become "Jr. King".
  if (SUFFIXES.has(b.toLowerCase().replace(/\.$/, ""))) {
    return unchanged(true, "the part after the comma is a suffix, not a given name");
  }

  return { display: `${b} ${a}`, script, action: "reordered", flagged: false };
}

/**
 * The byline as a human reads it.
 *
 * Returns the input unchanged whenever the surname boundary is not stated.
 * Never throws, never drops a part, never reorders on a guess.
 */
export function displayAuthorName(raw: string | null | undefined): string {
  return resolveAuthorName(raw).display;
}

const SUFFIXES = new Set([
  "jr", "sr", "ii", "iii", "iv", "v",
  "phd", "ph.d", "md", "m.d", "ed.d", "edd",
]);

/**
 * True when this byline states its own surname boundary.
 *
 * Exposed so a report can count how many rows are repairable and how many
 * need the upstream data fix, without re-implementing the comma rule.
 */
export function statesNameOrder(raw: string | null | undefined): boolean {
  return resolveAuthorName(raw).action !== "unchanged";
}
