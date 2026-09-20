// lib/resources/contributor-trust.ts
//
// IS THIS STRING SOMEBODY?
//
// `lib/resources/contributor-identity.ts` answers "what kind of entity does
// this byline name — a person, a corporate body, or the institution itself?".
// It has always assumed the byline names SOMETHING. In this collection that
// assumption is false often enough to be the library's largest published
// untruth.
//
// ── The defect, measured on production 2026-09-19 ───────────────────────────
//
// `books.author` is very often not a byline at all. It is whatever the PDF's
// `Author` metadata field happened to hold when the file was produced — the
// operating-system account of the person who scanned it, the name of the
// software that wrote it, a placeholder nobody filled in. Every one of those
// strings became an `authors` row, then an entry in the public author
// directory, then a URL in sitemap.xml, then a `ProfilePage` whose
// `mainEntity` is a `Person` with a stable `@id`:
//
//   /authors/windows-user            "Windows User"          7 works
//   /authors/user                    "user"                  4 works
//   /authors/administrator           "Administrator"         1 work
//   /authors/name                    "Name:"                 1 work
//   /authors/teste                   "Teste"                 1 work
//   /authors/pc                      "PC"                    1 work
//   /authors/lenovo                  "LENOVO"                1 work
//   /authors/pptxgenjs               "PptxGenJS"             1 work   ← a JS library
//   /authors/ទំព័រ                     "ទំព័រ" = "page"          1 work
//   /authors/channa-0977-33-61-62    "Channa 0977 33 61 62"  621 works
//
// All ten answered HTTP 200 with `index, follow`. The last is the single
// most-published `Person` in the library: a given name with a Cambodian mobile
// number attached, credited with 621 of 1,916 published books — 32% of the
// collection, asserted to search engines as the work of one human being whose
// name contains a phone number.
//
// ── What this module does, and deliberately does not do ─────────────────────
//
// It answers ONE question about ONE already-separated name, purely:
//
//   valid       nothing here says this is not a name
//   suspicious  a librarian should look at it; nothing changes automatically
//   invalid     this provably does not name a person or a body
//
// `invalid` is the only verdict with consequences, and its consequence is
// SILENCE, never deletion. The row stays in the database. The catalogue record
// keeps the string it was catalogued with, because that string is a true fact
// about the file. What stops is the CLAIM: no `Person` node, no author URL, no
// sitemap entry, no directory listing. Omission over fabrication — the same
// asymmetry `contributor-identity.ts` already applies to a byline it cannot
// split, pointed at a byline that names nobody.
//
// ── Why the rules are narrow, and must stay narrow ──────────────────────────
//
// The cost of the two errors is not symmetric, and it is not symmetric in the
// direction that first suggests itself. Being wrong by calling a real author
// invalid silently deletes a scholar from the entity layer — their page stops
// being advertised and their books stop crediting them in machine-readable
// form — and nothing in the app can tell that from a library that never held
// their work. Being wrong by calling junk valid leaves one more bad URL in a
// sitemap that already has hundreds of good ones.
//
// So every `invalid` rule is one of two shapes, and no rule is a judgement:
//
//   1. an EXACT full-string match against a closed vocabulary of strings that
//      are document metadata rather than names — OS account defaults, software
//      product names, form placeholders. Exact, because "User" is junk and
//      "Users, A. B." is a catalogued name, and substring matching cannot tell
//      them apart.
//
//   2. a STRUCTURAL impossibility — the string carries something a personal or
//      corporate name cannot carry: six or more digits, an email address, a
//      URL, a file extension, a long opaque hex token, or no letters at all.
//
// Everything that merely LOOKS odd — an acronym, a single given name, a handle
// — is `suspicious` and changes nothing. "IJERE" is a real journal. "KPC" and
// "ITPSO" may well be real Cambodian institutions. A rule that caught them
// would be a rule that also catches the next real one.
//
// Pure: no database, no `server-only`, no I/O. The audit script, the unit
// tests and the render path all read the same function.

/** Why a name was judged `suspicious` or `invalid`. Stable ids — the admin
 *  queue, the audit report and the tests all key on these. */
export type ContributorTrustReason =
  /** An operating-system or office-suite default document author. */
  | "software_default"
  /** The name of a program, device or manufacturer, not of an author. */
  | "software_or_device"
  /** A form placeholder or a filled-in "unknown". */
  | "placeholder"
  /** Document furniture: a word that labels part of a document. */
  | "document_furniture"
  /** Carries a telephone number or another long digit run. */
  | "contains_number"
  /** Carries an email address or a URL. */
  | "contains_contact"
  /** Reads as a file name rather than a byline. */
  | "filename"
  /** A long opaque token — a hash, an id, a fragment of machine output. */
  | "opaque_token"
  /** Contains no letter in any script. */
  | "no_letters"
  /** A single lowercase token with no space — plausibly a username. */
  | "single_token_handle"
  /** A job title or a role standing where a name should be. */
  | "role_not_name";

export type ContributorTrust = "valid" | "suspicious" | "invalid";

export type ContributorAssessment = {
  trust: ContributorTrust;
  /** `null` exactly when `trust` is `valid`. */
  reason: ContributorTrustReason | null;
};

const VALID: ContributorAssessment = { trust: "valid", reason: null };

const invalid = (reason: ContributorTrustReason): ContributorAssessment => ({
  trust: "invalid",
  reason,
});

const suspicious = (reason: ContributorTrustReason): ContributorAssessment => ({
  trust: "suspicious",
  reason,
});

/**
 * Comparison form: casefolded, punctuation dropped, whitespace collapsed.
 *
 * "Name:" and "name" fold together; "Windows  User" and "windows user" fold
 * together. Nothing else is done — no transliteration, no accent folding
 * across scripts, because every entry below is ASCII or Khmer and is compared
 * whole.
 */
function fold(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[.,:;'"“”‘’\-–—_/\\()[\]{}!?*#@]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Default document authors written by an operating system or an office suite.
 *
 * Matched against the WHOLE folded name. Every entry was either observed in
 * this collection's production data or is the documented default of software
 * used to produce it. A name is added here only when it cannot be a person in
 * a teacher-education library — which is why `owner`, `admin` and `guest` are
 * present and `dell`, `sony` and `page` are not: the first three are account
 * names, the last three are surnames somebody has.
 */
const SOFTWARE_DEFAULTS = new Set([
  "windows user",
  "windows",
  "microsoft office user",
  "office user",
  "word user",
  "wps office",
  "wps user",
  "user",
  "users",
  "user1",
  "user 1",
  "usuario",
  "utilisateur",
  "administrator",
  "admin",
  "administrador",
  "owner",
  "guest",
  "default",
  "default user",
  "home",
  "hp",
  "acer",
  "asus",
  "lenovo",
  "toshiba",
  "compaq",
  "pc",
  "my pc",
  "this pc",
  "computer",
  "my computer",
  "laptop",
  "desktop",
]);

/**
 * Programs, libraries and devices that write their own name into the `Author`
 * field. `pptxgenjs` is in production; the rest are the other producers that
 * reach a library through a scanning or conversion workflow.
 */
const SOFTWARE_NAMES = new Set([
  "pptxgenjs",
  "microsoft word",
  "microsoft® word",
  "microsoft powerpoint",
  "microsoft excel",
  "adobe acrobat",
  "adobe indesign",
  "adobe photoshop",
  "acrobat pdfmaker",
  "pdf24",
  "pdfcreator",
  "pdftex",
  "latex",
  "libreoffice",
  "openoffice",
  "canva",
  "foxit reader",
  "foxit phantompdf",
  "nitro pro",
  "camscanner",
  "hp scan",
  "epson scan",
  "xerox",
  "scanner",
  "scan",
]);

/**
 * Placeholders: a field that was left as its prompt, or filled in with a word
 * meaning "there is nobody here".
 *
 * "name" catches the production row displayed as "Name:" — a form label that
 * became a `Person`.
 */
const PLACEHOLDERS = new Set([
  "name",
  "your name",
  "author",
  "authors",
  "author name",
  "title",
  "untitled",
  "no author",
  "unknown",
  "unknown author",
  "unknown user",
  "anonymous",
  "anon",
  "none",
  "n a",
  "na",
  "nil",
  "null",
  "undefined",
  "nan",
  "test",
  "teste",
  "testing",
  "test user",
  "test author",
  "sample",
  "example",
  "asdf",
  "xxx",
  "tbd",
  "to be determined",
]);

/**
 * Khmer strings that label part of a document rather than naming anybody.
 *
 * Matched whole, never as substrings: Khmer has no word boundaries, so a
 * substring rule here would match inside real names. `ទំព័រ` ("page") is in
 * production as an author with a live, indexed `Person` page.
 */
const KHMER_FURNITURE = new Set([
  "ទំព័រ", // page
  "គ្មាន", // none
  // "no author". Matched WHOLE, so neither "គ្មាន" nor "អ្នកនិពន្ធ" above
  // catches the compound — and a substring rule is out of the question here
  // (Khmer has no word boundaries). A guard for legacy rows: the PMB import
  // stores NULL for a missing author rather than this placeholder, but the
  // string is the natural thing for a cataloguer to have typed, and it names
  // nobody wherever it came from.
  "គ្មានអ្នកនិពន្ធ",
  "គ្មានឈ្មោះ", // no name
  "មិនស្គាល់", // unknown
  "អ្នកប្រើប្រាស់", // user
  "អ្នកនិពន្ធ", // author
  "ចំណងជើង", // title
  "សាកល្បង", // test
]);

/**
 * Job titles standing alone where a name belongs.
 *
 * `suspicious`, never `invalid`: "Computer Teacher" is almost certainly the
 * role of whoever produced the file, but this library cannot prove that it is
 * not how a contributor chose to be credited, and a rule confident enough to
 * suppress it would also suppress a corporate body named after its function.
 */
const BARE_ROLES = new Set([
  "teacher",
  "computer teacher",
  "student",
  "students",
  "librarian",
  "researcher",
  "editor",
  "translator",
  "publisher",
  "school",
  "staff",
]);

// ── Structural tests ─────────────────────────────────────────────────────────

/** Every digit, in any script — Khmer numerals count. */
const DIGITS = /\p{Nd}/gu;
/** A run of digits, in any script. */
const DIGIT_RUN = /\p{Nd}+/gu;
/** Any letter, in any script. */
const HAS_LETTER = /\p{L}/u;

/**
 * Does this string carry a number no name carries?
 *
 * Two independent tests, because a phone number reaches this field in two
 * shapes. "Channa 0977 33 61 62" is four short runs — ten digits in total and
 * no single run longer than four — so a run-length test alone misses it.
 * "MoEYS 2019" is one run of four and eight digits would be needed to trip the
 * total, so a four-digit year passes both.
 *
 * Roman numerals are letters: "William Mendenhall III" is unaffected.
 */
function carriesNumber(raw: string): boolean {
  const total = (raw.match(DIGITS) ?? []).length;
  if (total >= 6) return true;
  return (raw.match(DIGIT_RUN) ?? []).some((run) => run.length >= 5);
}

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const URLISH = /(https?:\/\/|www\.)/i;
const FILE_EXTENSION = /\.(pdf|docx?|pptx?|xlsx?|odt|rtf|txt|jpe?g|png|zip)\s*$/i;
/** A token of twelve or more hex characters — a hash or an internal id. */
const OPAQUE_HEX = /\b[0-9a-f]{12,}\b/i;

/**
 * THE ENTRY POINT. What can be said about one already-separated name?
 *
 * The caller has already split a multi-person byline and stripped any role
 * marker — this function judges ONE candidate identity and nothing else.
 *
 * Order is load-bearing only in that the structural tests run before the
 * vocabulary ones: a string carrying a phone number is invalid whatever else
 * it says, and reaching the vocabulary first would let "Channa 0977 33 61 62"
 * out as an ordinary name.
 */
export function assessContributorName(
  raw: string | null | undefined,
): ContributorAssessment {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!name) return invalid("placeholder");

  // ── Structural: what the string carries ──────────────────────────────────
  if (!HAS_LETTER.test(name)) return invalid("no_letters");
  if (EMAIL.test(name)) return invalid("contains_contact");
  if (URLISH.test(name)) return invalid("contains_contact");
  if (FILE_EXTENSION.test(name)) return invalid("filename");
  if (OPAQUE_HEX.test(name)) return invalid("opaque_token");
  if (carriesNumber(name)) return invalid("contains_number");

  // ── Vocabulary: what the string IS, compared whole ───────────────────────
  const folded = fold(name);
  if (SOFTWARE_DEFAULTS.has(folded)) return invalid("software_default");
  if (SOFTWARE_NAMES.has(folded)) return invalid("software_or_device");
  if (PLACEHOLDERS.has(folded)) return invalid("placeholder");
  if (KHMER_FURNITURE.has(name.normalize("NFC"))) return invalid("document_furniture");

  // ── Advisory: reported, never acted on ───────────────────────────────────
  if (BARE_ROLES.has(folded)) return suspicious("role_not_name");
  // One lowercase word, no space, no Khmer: "sokhavuth", "indavy". Plausibly a
  // username, plausibly how a Cambodian author is credited by a single given
  // name. A librarian decides; this library does not.
  if (/^[a-z][a-z'\-]{2,}$/.test(name) && !/\s/.test(name)) {
    return suspicious("single_token_handle");
  }

  return VALID;
}

/** Does this name provably not identify anybody? */
export function isUnidentifiedContributorName(raw: string | null | undefined): boolean {
  return assessContributorName(raw).trust === "invalid";
}
