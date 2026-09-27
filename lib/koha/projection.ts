/**
 * Koha → e-Library projection: what a Koha record and a Koha item BECOME in
 * the Physical Library. Pure — no network, no database — so every mapping
 * rule is unit-tested and the sync (lib/koha/sync-run.ts) only moves data.
 *
 * Koha is the system of record (Gate 1). The e-Library shows a projection of
 * it, and never writes back. Two rules shape every function here:
 *
 *   • Nothing is invented. A field Koha does not hold comes back null, and the
 *     sync then leaves the e-Library's own value alone (sync-plan.ts decides
 *     that; this module only reports what Koha says).
 *   • The same reader-facing rules as the e-Library's own importer
 *     (lib/catalog-import.ts): a placeholder that names nobody is not an
 *     author (contributor-trust.ts); ISBNs are stored as bare digits; language
 *     is one of km/en/fr/zh/other.
 */
import { normalizeIsbn, validateIsbn, type CopyStatus } from "@/lib/catalog";
import { assessContributorName } from "@/lib/resources/contributor-trust";

// ── MARC-in-JSON (Koha: Accept: application/marc-in-json) ──────────────────────
// {"leader": "...", "fields": [{"008": "..."}, {"245": {"ind1": "1", "ind2": "0",
//   "subfields": [{"a": "Title"}]}}]}

export type MarcDataField = { ind1?: string; ind2?: string; subfields: Record<string, string>[] };
export type MarcInJson = { leader?: string; fields: Record<string, string | MarcDataField>[] };

export function isMarcInJson(v: unknown): v is MarcInJson {
  return !!v && typeof v === "object" && Array.isArray((v as MarcInJson).fields);
}

function fieldsOf(rec: MarcInJson, tag: string): (string | MarcDataField)[] {
  const out: (string | MarcDataField)[] = [];
  for (const f of rec.fields) if (tag in f) out.push(f[tag]);
  return out;
}

export function marcControl(rec: MarcInJson, tag: string): string | null {
  const f = fieldsOf(rec, tag).find((x): x is string => typeof x === "string");
  return f ?? null;
}

/** Every value of `tag`$`code`, in record order. */
export function marcSubfields(rec: MarcInJson, tag: string, code: string): string[] {
  const out: string[] = [];
  for (const f of fieldsOf(rec, tag)) {
    if (typeof f === "string") continue;
    for (const sf of f.subfields ?? []) if (code in sf && typeof sf[code] === "string") out.push(sf[code]);
  }
  return out;
}

const tidy = (s: string | null | undefined) => (s ?? "").replace(/[\s﻿]+/g, " ").trim();
/** ISBD separators MARC puts at the END of a subfield (" /", " :", " ;", " =", ","). Never a full stop: "Martin Ann M." ends in an initial. */
const stripIsbd = (s: string) => tidy(s).replace(/\s*[/:;=,]\s*$/u, "").trim();
const first = (xs: string[]) => xs.map(tidy).find(Boolean) ?? null;

// ── Records ────────────────────────────────────────────────────────────────────

export type CatalogLanguageCode = "km" | "en" | "fr" | "zh" | "other";

const MARC_LANGUAGE: Record<string, CatalogLanguageCode> = {
  khm: "km", eng: "en", fre: "fr", fra: "fr", chi: "zh", zho: "zh",
};
const KHMER = /[ក-៿᧠-᧿]/;
const LATIN_LETTER = /\p{Script=Latin}/u;

export interface ProjectedBook {
  kohaBiblioId: number;
  title: string;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  year: number | null;
  language: CatalogLanguageCode;
  /** 653$a — the shelf class label in the PMB records ("370 អប់រំ …"). */
  category: string | null;
  /** 082 $a (+ $b) — the Dewey number, used only when no item carries a call number. */
  ddcClass: string | null;
}

/** Koha keeps the biblionumber in 999$c (MARC 21). */
export function biblioIdOf(rec: MarcInJson): number | null {
  const n = Number(first(marcSubfields(rec, "999", "c")));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function languageOf(rec: MarcInJson, title: string): CatalogLanguageCode {
  const code = (first(marcSubfields(rec, "041", "a")) ?? marcControl(rec, "008")?.slice(35, 38) ?? "").toLowerCase().trim();
  // `und` is what the e-Library (and the PMB converter) write for "other" —
  // read it back as "other", so a record written from the e-Library reads the
  // same. No PMB record carries it (all 13,429 copies are km or en).
  if (code === "und") return "other";
  if (code && code !== "|||") return MARC_LANGUAGE[code] ?? "other";
  // No coded language: the title's script, exactly as the importer decides it.
  if (KHMER.test(title)) return "km";
  if (LATIN_LETTER.test(title)) return "en";
  return "km";
}

function yearOf(rec: MarcInJson, maxYear: number): number | null {
  const candidates = [
    ...marcSubfields(rec, "264", "c"),
    ...marcSubfields(rec, "260", "c"),
    marcControl(rec, "008")?.slice(7, 11) ?? "",
  ];
  for (const c of candidates) {
    const m = /\b(1[4-9]\d\d|2\d\d\d)\b/.exec(c);
    if (m) {
      const y = Number(m[1]);
      if (y >= 1400 && y <= maxYear) return y;
    }
  }
  return null;
}

/** The first 082: $a the class, $b the item number ("372.7" + "BIL"), as the e-Library writes them. */
function ddcOf(rec: MarcInJson): string | null {
  const f = fieldsOf(rec, "082").find((x): x is MarcDataField => typeof x !== "string");
  if (!f) return null;
  const a = first(f.subfields.flatMap((sf) => (typeof sf.a === "string" ? [sf.a] : [])));
  if (!a) return null;
  const b = first(f.subfields.flatMap((sf) => (typeof sf.b === "string" ? [sf.b] : [])));
  return b ? `${a} ${b}` : a;
}

export function projectBiblio(rec: MarcInJson, opts: { maxYear?: number } = {}): ProjectedBook | null {
  const kohaBiblioId = biblioIdOf(rec);
  const a = first(marcSubfields(rec, "245", "a"));
  if (!kohaBiblioId || !a) return null;
  const b = first(marcSubfields(rec, "245", "b"));
  const title = b ? `${stripIsbd(a)}: ${stripIsbd(b)}` : stripIsbd(a);

  const rawAuthor = first(marcSubfields(rec, "100", "a")) ?? first(marcSubfields(rec, "110", "a")) ?? first(marcSubfields(rec, "111", "a"));
  const authorText = rawAuthor ? tidy(rawAuthor).replace(/\s*,\s*$/u, "") : null;
  const author = authorText && assessContributorName(authorText).trust !== "invalid" ? authorText : null;

  let isbn: string | null = null;
  for (const raw of marcSubfields(rec, "020", "a")) {
    const v = validateIsbn(normalizeIsbn(raw.split(/\s/)[0] ?? ""));
    if (v.ok && v.normalized) { isbn = v.normalized; break; }
  }

  const publisherRaw = first(marcSubfields(rec, "264", "b")) ?? first(marcSubfields(rec, "260", "b"));
  return {
    kohaBiblioId,
    title,
    author,
    isbn,
    publisher: publisherRaw ? stripIsbd(publisherRaw) || null : null,
    year: yearOf(rec, opts.maxYear ?? new Date().getFullYear() + 1),
    language: languageOf(rec, title),
    category: first(marcSubfields(rec, "653", "a")),
    ddcClass: ddcOf(rec),
  };
}

// ── Items ──────────────────────────────────────────────────────────────────────

/** The fields of a Koha 26.05 item (swagger definitions/item.yaml) the projection reads. */
export interface KohaItem {
  item_id: number;
  biblio_id: number;
  external_id: string | null;
  callnumber: string | null;
  home_library_id: string | null;
  holding_library_id: string | null;
  location: string | null;
  collection_code: string | null;
  /** items.onloan — non-null while the item is checked out. */
  checked_out_date: string | null;
  not_for_loan_status: number | null;
  effective_not_for_loan_status?: number | null;
  lost_status: number | null;
  damaged_status: number | null;
  withdrawn: number | null;
  restricted_status: number | null;
  inventory_number: string | null;
  timestamp: string | null;
  /** x-koha-embed: +strings — human labels for coded fields. */
  _strings?: Record<string, { str?: string | null } | null> | null;
}

export function isKohaItem(v: unknown): v is KohaItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return Number.isInteger(o.item_id) && Number.isInteger(o.biblio_id);
}
export function isKohaItemList(v: unknown): v is KohaItem[] {
  return Array.isArray(v) && v.every(isKohaItem);
}

/**
 * One e-Library status for a Koha item. Koha stores several independent flags;
 * the reader sees the most important one, in this order:
 *   withdrawn → lost/missing → damaged → on loan → on order/processing →
 *   not for loan (reference) → available.
 * Koha's LOST values 4 and 5 are "Missing" and "Missing from bundle".
 * A negative NOT_LOAN value means ordered/in processing; a positive one is a
 * not-for-loan category (reference, staff collection), as is a use restriction.
 * Holds and transfers are not visible to a `catalogue`-only API user and are
 * not projected (an item waiting on the hold shelf reads as available).
 */
export function copyStatusOf(item: Pick<KohaItem,
  "withdrawn" | "lost_status" | "damaged_status" | "checked_out_date" | "not_for_loan_status" | "effective_not_for_loan_status" | "restricted_status">): CopyStatus {
  if ((item.withdrawn ?? 0) !== 0) return "withdrawn";
  const lost = item.lost_status ?? 0;
  if (lost === 4 || lost === 5) return "missing";
  if (lost !== 0) return "lost";
  if ((item.damaged_status ?? 0) !== 0) return "damaged";
  if (item.checked_out_date) return "on_loan";
  const notForLoan = item.effective_not_for_loan_status ?? item.not_for_loan_status ?? 0;
  if (notForLoan < 0) return "processing";
  if (notForLoan > 0 || (item.restricted_status ?? 0) !== 0) return "reference_only";
  return "available";
}

export interface ProjectedCopy {
  kohaItemId: number;
  kohaBiblioId: number;
  barcode: string | null;
  callNumber: string | null;
  shelfLocation: string | null;
  holdingLibrary: string | null;
  /** Koha collection (952$8) label — the e-Library shows it as the department. */
  collection: string | null;
  accessionNumber: string | null;
  status: CopyStatus;
  timestamp: string | null;
}

const label = (item: KohaItem, field: string, raw: string | null) =>
  tidy(item._strings?.[field]?.str ?? null) || tidy(raw) || null;

export function projectItem(item: KohaItem): ProjectedCopy {
  return {
    kohaItemId: item.item_id,
    kohaBiblioId: item.biblio_id,
    barcode: tidy(item.external_id) || null,
    callNumber: tidy(item.callnumber) || null,
    shelfLocation: label(item, "location", item.location),
    holdingLibrary: label(item, "holding_library_id", item.holding_library_id ?? item.home_library_id),
    collection: item.collection_code ? label(item, "collection_code", item.collection_code) : null,
    accessionNumber: tidy(item.inventory_number) || null,
    status: copyStatusOf(item),
    timestamp: item.timestamp ?? null,
  };
}

/** The record-level call number: the one most of its copies carry, else the Dewey class. */
export function recordCallNumber(copies: Pick<ProjectedCopy, "callNumber" | "status">[], ddcClass: string | null): string | null {
  const counts = new Map<string, number>();
  for (const c of copies) if (c.callNumber && c.status !== "withdrawn") counts.set(c.callNumber, (counts.get(c.callNumber) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [k, v] of counts) if (v > n || (v === n && best !== null && k < best)) { best = k; n = v; }
  return best ?? ddcClass;
}

/** The record-level department: the collection most of its copies are in. */
export function recordDepartment(copies: Pick<ProjectedCopy, "collection" | "status">[]): string | null {
  const counts = new Map<string, number>();
  for (const c of copies) if (c.collection && c.status !== "withdrawn") counts.set(c.collection, (counts.get(c.collection) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [k, v] of counts) if (v > n || (v === n && best !== null && k < best)) { best = k; n = v; }
  return best;
}
