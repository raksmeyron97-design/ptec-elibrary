/**
 * The writer is the reader's inverse (docs/KOHA-WRITES.md): whatever the
 * e-Library writes, the Phase 2 projection reads back unchanged — and an edit
 * leaves every field it was not asked to change exactly as Koha sent it.
 */
import { describe, it, expect } from "vitest";
import { editBiblioMarc, field008, newBiblioMarc, WRITABLE_BOOK_FIELDS, type WritableBookFields } from "./marc-write";
import { projectBiblio, type MarcInJson } from "./projection";
import { isValidIsbn, pickWritable } from "./biblio-write";

const withId = (rec: MarcInJson, id = 77): MarcInJson => ({ ...rec, fields: [...rec.fields, { "999": { ind1: " ", ind2: " ", subfields: [{ c: String(id) }] } }] });
const read = (rec: MarcInJson) => {
  const p = projectBiblio(rec.fields.some((f) => "999" in f) ? rec : withId(rec));
  if (!p) throw new Error("unreadable");
  return p;
};
const ENTERED = new Date("2026-09-27T00:00:00Z");

const CASES: (WritableBookFields & { ddc?: string | null })[] = [
  { title: "ភូមិវិទ្យា ថ្នាក់ទី១២", author: "អេង វ៉ាត់", isbn: null, publisher: null, year: null, language: "km", category: "សៀវភៅសិក្សាគោល", ddc: "ស.គ" },
  { title: "Visible Learning for Teachers", author: "Hattie, John", isbn: "9780415690157", publisher: "Routledge", year: 2012, language: "en", category: "370 Education", ddc: "370.15 HAT" },
  { title: "Anthologie", author: null, isbn: null, publisher: "Gallimard", year: 1999, language: "fr", category: null, ddc: "840" },
  { title: "汉语教程", author: "杨寄洲", isbn: null, publisher: null, year: 2006, language: "zh", category: null, ddc: null },
  { title: "Kanji in Context", author: "Nishiguchi", isbn: null, publisher: null, year: null, language: "other", category: null },
];

describe("a new record reads back as written", () => {
  it.each(CASES)("$title", (f) => {
    const p = read(newBiblioMarc(f, { itemType: "BK", entered: ENTERED }));
    expect(pickWritable(p)).toEqual(pickWritable(f));
    // A Dewey call number goes to 082 ($a class, $b the rest); anything else stays with the e-Library.
    expect(p.ddcClass).toBe(f.ddc && /^\d{3}/.test(f.ddc) ? f.ddc : null);
  });

  it("lays the record out as the PMB converter did", () => {
    const rec = newBiblioMarc(CASES[1], { itemType: "BK", entered: ENTERED });
    expect(rec.leader).toBe("00000nam a22000007u 4500");
    expect(rec.fields.map((f) => Object.keys(f)[0])).toEqual(["008", "020", "041", "082", "100", "245", "264", "653", "942"]);
    expect(rec.fields.find((f) => "942" in f)).toEqual({ "942": { ind1: " ", ind2: " ", subfields: [{ c: "BK" }, { "2": "ddc" }] } });
    expect(rec.fields.find((f) => "245" in f)).toMatchObject({ "245": { ind1: "1", ind2: "0" } });
  });

  it("008 is 40 characters with the date and language where MARC puts them", () => {
    const v = field008("km", ENTERED, 2012);
    expect(v).toHaveLength(40);
    expect(v.slice(0, 6)).toBe("260927");
    expect(v.slice(6, 11)).toBe("s2012");
    expect(v.slice(35, 38)).toBe("khm");
    expect(field008("other", ENTERED, null).slice(6, 11)).toBe("nuuuu");
  });
});

/** A record as a cataloguer might have left it in Koha: more than the e-Library knows about. */
const RICH: MarcInJson = withId({
  leader: "01234cam a2200313 i 4500",
  fields: [
    { "001": "ocm12345" },
    { "008": "120301s2012    enka     b    001 0 eng d" },
    { "020": { ind1: " ", ind2: " ", subfields: [{ a: "9780415690157" }, { q: "(pbk.)" }] } },
    { "020": { ind1: " ", ind2: " ", subfields: [{ a: "9780415690140" }, { q: "(hbk.)" }] } },
    { "041": { ind1: "0", ind2: " ", subfields: [{ a: "eng" }] } },
    { "082": { ind1: "0", ind2: "4", subfields: [{ a: "370.15" }, { "2": "23" }] } },
    { "100": { ind1: "1", ind2: " ", subfields: [{ a: "Hattie, John," }, { d: "1950-" }, { e: "author." }] } },
    { "245": { ind1: "1", ind2: "0", subfields: [{ a: "Visible learning for teachers :" }, { b: "maximizing impact on learning /" }, { c: "John Hattie." }] } },
    { "264": { ind1: " ", ind2: "1", subfields: [{ a: "London :" }, { b: "Routledge," }, { c: "2012." }] } },
    { "500": { ind1: " ", ind2: " ", subfields: [{ a: "Includes index." }] } },
    { "650": { ind1: " ", ind2: "0", subfields: [{ a: "Effective teaching." }] } },
    { "653": { ind1: " ", ind2: " ", subfields: [{ a: "370 Education" }] } },
    { "700": { ind1: "1", ind2: " ", subfields: [{ a: "Yates, Gregory," }] } },
    { "942": { ind1: " ", ind2: " ", subfields: [{ c: "BK" }] } },
  ],
});
const edit = (changes: Partial<WritableBookFields>) => editBiblioMarc(RICH, changes, { isValidIsbn });
const tags = (rec: MarcInJson, keep: (t: string) => boolean) => rec.fields.filter((f) => keep(Object.keys(f)[0]));

describe("an edit changes only what was asked", () => {
  it("reads back with the change and every other field as it was", () => {
    const before = read(RICH);
    for (const [field, value] of [
      ["title", "Visible Learning"], ["author", "Hattie, J."], ["isbn", "9781138939998"], ["publisher", "Corwin"],
      ["year", 2015], ["language", "km"], ["category", "371 Teaching"],
    ] as const) {
      const after = read(edit({ [field]: value }));
      expect(after[field], field).toEqual(value);
      for (const other of WRITABLE_BOOK_FIELDS) if (other !== field) expect(after[other], `${field} left ${other}`).toEqual(before[other]);
    }
  });

  it("leaves the fields the e-Library does not own byte-for-byte alone", () => {
    const notMine = (t: string) => !["008", "020", "041", "100", "110", "111", "245", "260", "264", "653"].includes(t);
    for (const change of [{ title: "X" }, { author: "Y" }, { isbn: null }, { year: 2000 }, { language: "fr" as const }, { category: null }]) {
      expect(tags(edit(change), notMine)).toEqual(tags(RICH, notMine));
    }
    expect(edit({ author: "Y" }).leader).toBe(RICH.leader);
  });

  it("does not modify the record it was given", () => {
    const copy = JSON.parse(JSON.stringify(RICH));
    edit({ title: "X", author: null, isbn: null, year: null, category: null, language: "km", publisher: null });
    expect(RICH).toEqual(copy);
  });

  it("title: written whole to $a, subtitle dropped, ISBD before the statement of responsibility", () => {
    const f = edit({ title: "Visible Learning" }).fields.find((x) => "245" in x)!["245"];
    expect(f).toEqual({ ind1: "1", ind2: "0", subfields: [{ a: "Visible Learning /" }, { c: "John Hattie." }] });
  });

  it("author: a new name drops the old person's dates and role; clearing it removes the main entry", () => {
    expect(edit({ author: "Hattie, J." }).fields.find((x) => "100" in x)).toEqual({ "100": { ind1: "1", ind2: " ", subfields: [{ a: "Hattie, J." }] } });
    const none = edit({ author: null });
    expect(none.fields.some((x) => "100" in x)).toBe(false);
    expect(none.fields.find((x) => "245" in x)).toMatchObject({ "245": { ind1: "0" } });
    expect(read(none).author).toBeNull();
    expect(tags(none, (t) => t === "700")).toHaveLength(1); // added entries are not the author
  });

  it("isbn: replaces the one the reader reads, drops its qualifier, keeps the rest; clearing removes every valid one", () => {
    const changed = edit({ isbn: "9781138939998" });
    expect(tags(changed, (t) => t === "020")).toEqual([
      { "020": { ind1: " ", ind2: " ", subfields: [{ a: "9781138939998" }] } },
      RICH.fields[3],
    ]);
    expect(read(edit({ isbn: null })).isbn).toBeNull();
    const added = editBiblioMarc({ ...RICH, fields: RICH.fields.filter((f) => !("020" in f)) }, { isbn: "9781138939998" }, { isValidIsbn });
    expect(read(added).isbn).toBe("9781138939998");
  });

  it("year: 264 $c and the date in 008 move together", () => {
    const rec = edit({ year: 2015 });
    expect(rec.fields.find((x) => "264" in x)).toEqual({ "264": { ind1: " ", ind2: "1", subfields: [{ a: "London :" }, { b: "Routledge," }, { c: "2015" }] } });
    expect((rec.fields.find((x) => "008" in x)!["008"] as string).slice(6, 11)).toBe("s2015");
    const cleared = edit({ year: null });
    expect(read(cleared).year).toBeNull();
  });

  it("language: 041 and 008/35-37; `other` round-trips through und", () => {
    const rec = edit({ language: "other" });
    expect(rec.fields.find((x) => "041" in x)).toEqual({ "041": { ind1: "0", ind2: " ", subfields: [{ a: "und" }] } });
    expect((rec.fields.find((x) => "008" in x)!["008"] as string).slice(35, 38)).toBe("und");
    expect(read(rec).language).toBe("other");
  });

  it("adds a field the record lacks, in MARC order", () => {
    const bare = withId({ leader: RICH.leader, fields: [{ "245": { ind1: "0", ind2: "0", subfields: [{ a: "Bare" }] } }] });
    const rec = editBiblioMarc(bare, { author: "A", publisher: "P", year: 2001, category: "C", isbn: "9781138939998" }, { isValidIsbn });
    expect(rec.fields.map((f) => Object.keys(f)[0])).toEqual(["020", "100", "245", "264", "653", "999"]);
    expect(pickWritable(read(rec))).toMatchObject({ author: "A", publisher: "P", year: 2001, category: "C", isbn: "9781138939998" });
  });

  it("refuses to empty the title", () => {
    expect(() => edit({ title: "  " })).toThrow(/title/);
  });
});
