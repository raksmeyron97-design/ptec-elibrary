/**
 * e-Library → Koha: the MARC a librarian's form becomes (Phase 5, record writes).
 * Pure — no network, no database.
 *
 * This is the INVERSE of lib/koha/projection.ts, and the tests hold it to
 * that: for every field the e-Library may write, projectBiblio(written) gives
 * back exactly what was written. Two rules follow from Koha's API:
 *
 *   • PUT /biblios/{id} replaces the WHOLE record (C4::Biblio::ModBiblio), and
 *     the e-Library only understands a handful of fields. So an edit is never
 *     a rebuild: editBiblioMarc() starts from the record Koha holds and changes
 *     only the fields the librarian changed. Every other field — subjects,
 *     notes, added entries, 942, 999 — goes back exactly as Koha sent it.
 *   • A new record is laid out the way the PMB converter laid out the 2,638
 *     records already in Koha (ptec-koha-deployment migration/pmb_to_koha.py:
 *     leader, 008, 020, 041, 082, 100, 245, 264, 653, 942), so one reader
 *     serves both.
 *
 * What the e-Library may write is the bibliographic record only. Call number
 * and department belong to the COPIES in Koha (952$o, 952$8) — the projection
 * derives the record's from its copies — so they are not in WritableBookFields,
 * except that a new record's Dewey class goes to 082, which is where the
 * projection looks when a record has no copies yet.
 */
import type { CatalogLanguageCode, MarcDataField, MarcInJson } from "./projection";

/** The bibliographic fields the e-Library may change in Koha. */
export interface WritableBookFields {
  title: string;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  year: number | null;
  language: CatalogLanguageCode;
  category: string | null;
}
export const WRITABLE_BOOK_FIELDS = ["title", "author", "isbn", "publisher", "year", "language", "category"] as const;
export type WritableField = (typeof WRITABLE_BOOK_FIELDS)[number];

/** MARC 21 language codes (008/35-37, 041$a) — the converter's own table. */
export const MARC_LANGUAGE_CODE: Record<CatalogLanguageCode, string> = {
  km: "khm", en: "eng", fr: "fre", zh: "chi", other: "und",
};

/** "new, language material, monograph, UTF-8, minimal level" — the converter's leader. */
export const NEW_RECORD_LEADER = "00000nam a22000007u 4500";
/** The Dewey class at the start of a call number ("372.7 BIL" → "372.7"), as the converter decides it. */
const DDC_CLASS = /^(\d{3}(?:\.\d+)?)(?=\s|$)/;

const tidy = (s: string | null | undefined) => (s ?? "").replace(/[\s﻿]+/g, " ").trim();

type Field = Record<string, string | MarcDataField>;
const data = (tag: string, ind1: string, ind2: string, subfields: [string, string | null | undefined][]): Field | null => {
  const sfs = subfields.filter(([, v]) => tidy(v)).map(([c, v]) => ({ [c]: tidy(v) }));
  return sfs.length ? { [tag]: { ind1, ind2, subfields: sfs } } : null;
};
const tagOf = (f: Field) => Object.keys(f)[0];

/**
 * 008 for books, 40 characters, exactly as the converter writes it:
 * 00-05 entered · 06 `s` + 07-10 year when known, else `n` + `uuuu` ·
 * 11-14 `uuuu` · 15-17 place unknown · 18-34 no attempt to code · 35-37 language.
 */
export function field008(language: CatalogLanguageCode, entered: Date, year: number | null): string {
  const yymmdd = entered.toISOString().slice(2, 10).replace(/-/g, "");
  const dates = year ? `s${year}uuuu` : "nuuuuuuuu";
  const books = "||||" + "|" + " " + "||||" + "|" + "|" + "|" + "|" + " " + "|" + "|";
  const value = yymmdd + dates + "xx " + books + MARC_LANGUAGE_CODE[language] + " " + "d";
  if (value.length !== 40) throw new Error(`008 must be 40 characters, got ${value.length}`);
  return value;
}

/** Split a call number into 082 $a (Dewey class) and $b (the rest), or null when it is not Dewey. */
export function ddcSubfields(callNumber: string | null): { a: string; b: string | null } | null {
  const cn = tidy(callNumber);
  const m = DDC_CLASS.exec(cn);
  if (!m) return null;
  return { a: m[1], b: tidy(cn.slice(m[1].length)) || null };
}

/** A new bibliographic record for POST /biblios. */
export function newBiblioMarc(
  f: WritableBookFields & { ddc?: string | null },
  opts: { itemType: string; entered: Date },
): MarcInJson {
  const ddc = ddcSubfields(f.ddc ?? null);
  const fields = [
    { "008": field008(f.language, opts.entered, f.year) } as Field,
    data("020", " ", " ", [["a", f.isbn]]),
    data("041", "0", " ", [["a", MARC_LANGUAGE_CODE[f.language]]]),
    ddc ? data("082", " ", "4", [["a", ddc.a], ["b", ddc.b]]) : null,
    data("100", "1", " ", [["a", f.author]]),
    data("245", f.author ? "1" : "0", "0", [["a", f.title]]),
    data("264", " ", "1", [["b", f.publisher], ["c", f.year ? String(f.year) : null]]),
    data("653", " ", " ", [["a", f.category]]),
    data("942", " ", " ", [["c", opts.itemType], ["2", ddc ? "ddc" : null]]),
  ].filter((x): x is Field => x !== null);
  return { leader: NEW_RECORD_LEADER, fields };
}

// ── Editing a record Koha holds ─────────────────────────────────────────────────

const clone = (rec: MarcInJson): MarcInJson => JSON.parse(JSON.stringify(rec));
const isData = (v: unknown): v is MarcDataField => !!v && typeof v === "object" && Array.isArray((v as MarcDataField).subfields);
const indexOf = (rec: MarcInJson, tag: string) => rec.fields.findIndex((f) => tag in f && isData(f[tag]));

/** Put a field where MARC order says it belongs (after the last tag ≤ its own). */
function insertInOrder(rec: MarcInJson, field: Field): void {
  const tag = tagOf(field);
  let at = rec.fields.length;
  for (let i = 0; i < rec.fields.length; i++) {
    if (tagOf(rec.fields[i]) > tag) { at = i; break; }
  }
  rec.fields.splice(at, 0, field);
}

function setSubfield(field: MarcDataField, code: string, value: string | null): void {
  const at = field.subfields.findIndex((sf) => code in sf);
  if (value === null) {
    field.subfields = field.subfields.filter((sf) => !(code in sf));
  } else if (at >= 0) {
    field.subfields[at] = { [code]: value };
    // Only one of each: the projection reads the first, a second would be stale.
    field.subfields = field.subfields.filter((sf, i) => i === at || !(code in sf));
  } else {
    field.subfields.push({ [code]: value });
  }
}

const hasValidIsbn = (raw: string, isValid: (s: string) => boolean) => isValid(raw.split(/\s/)[0] ?? "");

/**
 * The record Koha holds, with ONLY the given fields changed. `changes` holds
 * the librarian's new values for the fields they changed, and nothing else.
 * `isValidIsbn` is the projection's own ISBN rule, so "the ISBN" means the
 * same 020 to the writer as to the reader.
 */
export function editBiblioMarc(
  current: MarcInJson,
  changes: Partial<WritableBookFields>,
  opts: { isValidIsbn: (raw: string) => boolean },
): MarcInJson {
  const rec = clone(current);
  const has = (k: WritableField) => Object.prototype.hasOwnProperty.call(changes, k);

  if (has("author")) {
    const author = tidy(changes.author) || null;
    // The projection reads the first of 100, 110, 111: that is "the author".
    const tag = ["100", "110", "111"].find((t) => indexOf(rec, t) >= 0);
    if (!author) {
      rec.fields = rec.fields.filter((f) => !["100", "110", "111"].includes(tagOf(f)));
    } else if (tag) {
      // A different person: their dates ($d) and role ($e) described the old one.
      const f = rec.fields[indexOf(rec, tag)][tag] as MarcDataField;
      f.subfields = [{ a: author }];
    } else {
      insertInOrder(rec, data("100", "1", " ", [["a", author]])!);
    }
  }

  if (has("title")) {
    const title = tidy(changes.title);
    if (!title) throw new Error("A record needs a title.");
    const at = indexOf(rec, "245");
    if (at >= 0) {
      const f = rec.fields[at]["245"] as MarcDataField;
      // The projection joins $a and $b; the new title is written whole to $a.
      f.subfields = f.subfields.filter((sf) => !("b" in sf));
      const followedByC = f.subfields.some((sf) => "c" in sf);
      // ISBD: $a ends " /" before a statement of responsibility; the reader strips it.
      setSubfield(f, "a", followedByC ? `${title} /` : title);
    } else {
      insertInOrder(rec, data("245", "0", "0", [["a", title]])!);
    }
  }
  // 245 ind1 says whether a 1XX main entry exists — keep it true after either edit.
  if (has("title") || has("author")) {
    const at = indexOf(rec, "245");
    if (at >= 0) (rec.fields[at]["245"] as MarcDataField).ind1 = ["100", "110", "111"].some((t) => indexOf(rec, t) >= 0) ? "1" : "0";
  }

  if (has("isbn")) {
    const isbn = tidy(changes.isbn) || null;
    const valid = rec.fields
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => "020" in f && isData(f["020"]) && (f["020"] as MarcDataField).subfields.some((sf) => typeof sf.a === "string" && hasValidIsbn(sf.a, opts.isValidIsbn)));
    if (!isbn) {
      // "No ISBN": the projection reads the first VALID 020, so every one goes.
      const drop = new Set(valid.map(({ i }) => i));
      rec.fields = rec.fields.filter((_, i) => !drop.has(i));
    } else if (valid.length) {
      // Its qualifier ($q "pbk.") described the old number.
      (rec.fields[valid[0].i]["020"] as MarcDataField).subfields = [{ a: isbn }];
    } else {
      // Before any other 020, so it is the one the projection reads.
      const firstIsbn = rec.fields.findIndex((f) => "020" in f);
      const field = data("020", " ", " ", [["a", isbn]])!;
      if (firstIsbn >= 0) rec.fields.splice(firstIsbn, 0, field);
      else insertInOrder(rec, field);
    }
  }

  if (has("publisher") || has("year")) {
    // The projection reads the first 264, else the first 260.
    const tag = indexOf(rec, "264") >= 0 ? "264" : indexOf(rec, "260") >= 0 ? "260" : null;
    let f: MarcDataField;
    if (tag) f = rec.fields[indexOf(rec, tag)][tag] as MarcDataField;
    else {
      f = { ind1: " ", ind2: "1", subfields: [] };
      insertInOrder(rec, { "264": f });
    }
    if (has("publisher")) setSubfield(f, "b", tidy(changes.publisher) || null);
    if (has("year")) setSubfield(f, "c", changes.year ? String(changes.year) : null);
    // Keep $b before $c, as cataloguers write them.
    f.subfields.sort((x, y) => ("a" in x ? 0 : "b" in x ? 1 : "c" in x ? 2 : 3) - ("a" in y ? 0 : "b" in y ? 1 : "c" in y ? 2 : 3));
    if (!f.subfields.length) rec.fields = rec.fields.filter((x) => !(tagOf(x) === (tag ?? "264") && x[tagOf(x)] === f));
    if (has("year")) {
      // 008/06-10 carries the date too, and the projection falls back to it.
      const at = rec.fields.findIndex((x) => typeof x["008"] === "string");
      const v = at >= 0 ? (rec.fields[at]["008"] as string) : null;
      if (v && v.length === 40) {
        const dates = changes.year ? `s${changes.year}` : "nuuuu";
        rec.fields[at] = { "008": v.slice(0, 6) + dates + v.slice(11) };
      }
    }
  }

  if (has("language") && changes.language) {
    const code = MARC_LANGUAGE_CODE[changes.language];
    const at = indexOf(rec, "041");
    if (at >= 0) setSubfield(rec.fields[at]["041"] as MarcDataField, "a", code);
    else insertInOrder(rec, data("041", "0", " ", [["a", code]])!);
    const c008 = rec.fields.findIndex((x) => typeof x["008"] === "string");
    const v = c008 >= 0 ? (rec.fields[c008]["008"] as string) : null;
    if (v && v.length === 40) rec.fields[c008] = { "008": v.slice(0, 35) + code + v.slice(38) };
  }

  if (has("category")) {
    const category = tidy(changes.category) || null;
    const at = indexOf(rec, "653");
    if (!category) {
      if (at >= 0) rec.fields.splice(at, 1);
    } else if (at >= 0) {
      setSubfield(rec.fields[at]["653"] as MarcDataField, "a", category);
    } else {
      insertInOrder(rec, data("653", " ", " ", [["a", category]])!);
    }
  }

  return rec;
}
