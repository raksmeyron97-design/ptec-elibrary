// lib/rights/publisher-signals.ts
//
// Pure, browser-safe. Given what a PUBLIC book page already says about a book,
// answer one question for a librarian: is this plausibly a commercial work
// PTEC may not have the right to distribute?
//
// ── What this is, and what it very deliberately is not ───────────────────────
//
// It is a TRIAGE ORDER for a human review queue. It is not a rights
// determination, and nothing in the application reads it. No book's access
// changes because of what this returns; the only consumer is a CSV a librarian
// reads (scripts/audit-rights-exposure.ts).
//
// That is why every class is hedged in its own name. `commercial-likely` means
// "a signal fired, go and look", not "this is infringing" — a university may
// hold a licence, a title may be out of print and reverted, a ministry may
// have bought distribution rights. And `unknown` means UNMEASURED, never
// "safe": in this collection it is the largest bucket by far, because most
// rows carry no publisher at all (lib/seo/citation.ts emits citation_publisher
// only when the record names a real one, and most PTEC records do not).
//
// ── The three rules ──────────────────────────────────────────────────────────
//
// 1. OPEN SIGNALS ARE CHECKED FIRST AND WIN OUTRIGHT. The expensive error here
//    is not a missed textbook — it is telling a librarian that a book the
//    Ministry published for free national distribution looks commercial, and
//    having them withdraw it. A Khmer MoEYS title must never come out
//    `commercial-likely`, so the open vocabulary is searched across publisher,
//    contributors AND title before any commercial signal is considered.
//
// 2. A TITLE ALONE NEVER DECIDES `commercial-likely`. "Educational Psychology"
//    is a Pearson textbook and also a subject taught here. Only a publisher
//    name or an ISBN registrant prefix — facts about the ARTEFACT — may raise
//    the commercial flag.
//
// 3. THE REASON NAMES THE EVIDENCE. Every verdict carries the signal that
//    produced it, including the literal ISBN prefix, so a human can check the
//    table rather than trust it. The prefix table below is best-effort public
//    knowledge about ISBN registrant elements, not an authoritative registry
//    extract, and it is wrong-by-omission far more often than wrong-by-match.

import { normalizeIsbn } from "@/lib/books/duplicate-detection/normalize";

export type RightsClass = "commercial-likely" | "open-likely" | "unknown";

export interface RightsSignalInput {
  title?: string | null;
  /** Contributor display names, as the page publishes them. */
  authors?: readonly string[] | null;
  /** The record's REAL publisher. Usually absent in this collection. */
  publisher?: string | null;
  isbn?: string | null;
}

export interface RightsVerdict {
  rightsClass: RightsClass;
  /** Human-readable evidence. Never empty. */
  reason: string;
}

// ── Vocabulary ───────────────────────────────────────────────────────────────

/**
 * Publishers whose presence is, on its own, reason for a human to look.
 * Matched as a lowercased substring of the publisher field only (rule 2).
 * Imprints are listed beside their parent because a record names the imprint.
 */
const COMMERCIAL_PUBLISHERS: readonly string[] = [
  // Pearson
  "pearson", "prentice hall", "prentice-hall", "addison-wesley", "addison wesley",
  "allyn & bacon", "allyn and bacon", "longman", "merrill",
  // Wiley
  "wiley", "jossey-bass", "jossey bass", "blackwell",
  // SAGE
  "sage publications", "sage publishing", "corwin",
  // Taylor & Francis / Routledge
  "routledge", "taylor & francis", "taylor and francis", "psychology press",
  "lawrence erlbaum", "erlbaum",
  // Springer Nature / Palgrave
  "springer", "palgrave", "macmillan", "nature publishing",
  // Cengage
  "cengage", "wadsworth", "heinle", "brooks/cole", "brooks cole", "course technology",
  // McGraw-Hill
  "mcgraw-hill", "mcgraw hill",
  // University presses that trade commercially
  "oxford university press", "cambridge university press", "harvard university press",
  "mit press", "university of chicago press",
  // Elsevier
  "elsevier", "academic press", "mosby", "saunders", "butterworth", "morgan kaufmann",
  // Other trade and academic houses found on this collection's shelves
  "harpercollins", "hodder", "bloomsbury", "w. w. norton", "w.w. norton",
  "guilford", "sinauer", "thieme", "kogan page", "emerald publishing",
  "john benjamins", "de gruyter", "brill",
];

/**
 * ISBN-13 registrant prefixes (digits only, no hyphens) belonging to major
 * commercial publishers. BEST-EFFORT — see rule 3. Each entry is the 978 group
 * prefix plus the registrant element, so a match is a claim about who
 * registered the block, not about the imprint on the cover.
 *
 * Kept as a single table on purpose: this is the one place to correct if a
 * prefix turns out to be wrong or to have changed hands.
 */
const COMMERCIAL_ISBN_PREFIXES: ReadonlyArray<readonly [prefix: string, publisher: string]> = [
  ["978013", "Pearson / Prentice Hall (0-13)"],
  ["9780201", "Pearson / Addison-Wesley (0-201)"],
  ["9780205", "Pearson / Allyn & Bacon (0-205)"],
  ["9780321", "Pearson / Addison-Wesley (0-321)"],
  ["9780273", "Pearson Education UK (0-273)"],
  ["9781292", "Pearson Education Ltd, international (1-292)"],
  ["9780470", "Wiley (0-470)"],
  ["9780471", "Wiley (0-471)"],
  ["9781118", "Wiley (1-118)"],
  ["9781119", "Wiley (1-119)"],
  ["97808039", "SAGE (0-8039)"],
  ["97814129", "SAGE (1-4129)"],
  ["97814462", "SAGE (1-4462)"],
  ["97814739", "SAGE (1-4739)"],
  ["97815063", "SAGE (1-5063)"],
  ["9780415", "Routledge (0-415)"],
  ["9781138", "Routledge (1-138)"],
  ["9781032", "Routledge (1-032)"],
  ["9781003", "Routledge / T&F eBooks (1-003)"],
  ["97808058", "Lawrence Erlbaum (0-8058)"],
  ["9780387", "Springer (0-387)"],
  ["9783540", "Springer (3-540)"],
  ["9783319", "Springer (3-319)"],
  ["9783030", "Springer (3-030)"],
  ["97814020", "Springer (1-4020)"],
  ["9780333", "Palgrave Macmillan (0-333)"],
  ["9780230", "Palgrave Macmillan (0-230)"],
  ["9781137", "Palgrave Macmillan (1-137)"],
  ["9780495", "Cengage / Wadsworth (0-495)"],
  ["9780534", "Cengage / Wadsworth (0-534)"],
  ["9781133", "Cengage (1-133)"],
  ["9781285", "Cengage (1-285)"],
  ["9781305", "Cengage (1-305)"],
  ["9781337", "Cengage (1-337)"],
  ["978007", "McGraw-Hill (0-07)"],
  ["9781259", "McGraw-Hill (1-259)"],
  ["9780697", "McGraw-Hill (0-697)"],
  ["978019", "Oxford University Press (0-19)"],
  ["9780521", "Cambridge University Press (0-521)"],
  ["9781107", "Cambridge University Press (1-107)"],
  ["9781108", "Cambridge University Press (1-108)"],
  ["978012", "Elsevier / Academic Press (0-12)"],
  ["9780323", "Elsevier / Mosby (0-323)"],
  ["9780444", "Elsevier (0-444)"],
  ["97807020", "Elsevier (0-7020)"],
];

/**
 * Institutions whose material is published to be given away. Searched across
 * publisher, contributors and title (rule 1).
 *
 * Long enough to be unambiguous as substrings. Short acronyms live in
 * OPEN_ACRONYMS instead, because "who" inside "whole" is a false positive that
 * would mis-file a book as open — the one direction this must not fail in.
 */
const OPEN_INSTITUTIONS: readonly string[] = [
  "ministry of education", "moeys", "ministry of education, youth and sport",
  "ក្រសួងអប់រំ", "អប់រំ យុវជន និងកីឡា",
  "phnom penh teacher education", "teacher education college", "ptec",
  "national institute of education",
  "unesco", "unicef", "undp", "unfpa", "unhcr", "world health organization",
  "international labour organization", "food and agriculture organization",
  "seameo", "world bank", "asian development bank",
  "organisation for economic co-operation", "organization for economic co-operation",
  "european union", "save the children", "plan international", "room to read",
  "vvob", "kampuchean action for primary education", "usaid", "jica",
  "deutsche gesellschaft für internationale zusammenarbeit",
  "open development cambodia",
];

/**
 * Short, all-caps organisation acronyms.
 *
 * Matched on a word boundary AND only against the CREATOR fields (publisher,
 * contributors) — never the title. An institution credits itself as an author
 * or a publisher; it does not appear inside a title as a bare acronym without
 * also appearing as a creator. Searching titles too would make "who" match
 * the ordinary English pronoun, and a false OPEN reading is the one direction
 * this must not fail in: it tells a librarian there is nothing to review.
 *
 * Verified against all 1,956 production book pages: every acronym hit is a
 * real institutional creator, and restricting the search to creator fields
 * loses none of them.
 */
const OPEN_ACRONYMS: readonly string[] = ["oecd", "adb", "ilo", "fao", "who", "nie", "giz", "kape"];

/** An explicit grant of reuse, wherever it appears. */
const OPEN_LICENCES: readonly string[] = [
  "creative commons", "cc by", "cc-by", "public domain", "open access",
  "open educational resource", "openly licensed",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

const lower = (s: string | null | undefined) => (s ?? "").toLowerCase();

function matchedSubstring(haystack: string, needles: readonly string[]): string | null {
  for (const n of needles) if (haystack.includes(n)) return n;
  return null;
}

function matchedAcronym(haystack: string, needles: readonly string[]): string | null {
  for (const n of needles) {
    // Latin acronyms only, so an ASCII \b is the right boundary here.
    if (new RegExp(`\\b${n}\\b`, "i").test(haystack)) return n;
  }
  return null;
}

// ── The decision ─────────────────────────────────────────────────────────────

export function classifyRights(input: RightsSignalInput): RightsVerdict {
  const publisher = lower(input.publisher);
  const title = lower(input.title);
  const authors = (input.authors ?? []).map(lower).join(" | ");
  const everything = `${publisher} ${authors} ${title}`;

  // Rule 1 — open wins outright, and is searched everywhere.
  const licence = matchedSubstring(everything, OPEN_LICENCES);
  if (licence) return { rightsClass: "open-likely", reason: `open licence stated: "${licence}"` };

  const institution = matchedSubstring(everything, OPEN_INSTITUTIONS);
  if (institution) {
    return { rightsClass: "open-likely", reason: `open-access institution: "${institution}"` };
  }

  const acronym = matchedAcronym(`${publisher} ${authors}`, OPEN_ACRONYMS);
  if (acronym) {
    return { rightsClass: "open-likely", reason: `open-access institution: "${acronym.toUpperCase()}"` };
  }

  // Rule 2 — only the artefact's own facts may raise the commercial flag.
  const commercialPublisher = publisher ? matchedSubstring(publisher, COMMERCIAL_PUBLISHERS) : null;
  if (commercialPublisher) {
    return {
      rightsClass: "commercial-likely",
      reason: `commercial publisher named: "${commercialPublisher}"`,
    };
  }

  // The repo's one ISBN normaliser (CLAUDE.md § Book Ingestion: "One
  // definition of 'the same string', for three doors"). It canonicalises to
  // ISBN-13, widening a legacy ISBN-10 with a recomputed check digit — which
  // is what lets a pre-2007 textbook reach the registrant table at all.
  const digits = normalizeIsbn(input.isbn) ?? "";
  if (digits.length === 13) {
    // Longest prefix first, so "9780321" is reported rather than a shorter
    // table entry that also happens to match.
    const hit = [...COMMERCIAL_ISBN_PREFIXES]
      .sort((a, b) => b[0].length - a[0].length)
      .find(([prefix]) => digits.startsWith(prefix));
    if (hit) {
      return {
        rightsClass: "commercial-likely",
        reason: `ISBN registrant prefix ${hit[0]} → ${hit[1]}`,
      };
    }
  }

  // Rule 3's other half: say WHY nothing was decided, so the bucket is
  // readable as work-to-do rather than as a verdict.
  if (!publisher && digits.length !== 13) {
    return { rightsClass: "unknown", reason: "no publisher and no usable ISBN on the public page" };
  }
  if (!publisher) return { rightsClass: "unknown", reason: "ISBN not in the registrant table; no publisher recorded" };
  return { rightsClass: "unknown", reason: `publisher "${input.publisher}" not in either vocabulary` };
}

/** Sort order for the review queue: the rows a human must read first. */
export const RIGHTS_CLASS_ORDER: Record<RightsClass, number> = {
  "commercial-likely": 0,
  unknown: 1,
  "open-likely": 2,
};
