/**
 * Koha record/item → e-Library record/copy. Synthetic fixtures shaped like the
 * MARC the PMB migration wrote (ptec-koha-deployment/migration) and like
 * records copy-catalogued from the Library of Congress.
 */
import { describe, it, expect } from "vitest";
import {
  copyStatusOf,
  projectBiblio,
  projectItem,
  recordCallNumber,
  recordDepartment,
  type KohaItem,
  type MarcInJson,
} from "./projection";

const df = (ind: string, subs: [string, string][]) => ({ ind1: ind[0], ind2: ind[1], subfields: subs.map(([c, v]) => ({ [c]: v })) });

/** A record exactly as pmb_to_koha.py writes it, once Koha has added 999$c. */
const PMB: MarcInJson = {
  leader: "00000nam a22000007u 4500",
  fields: [
    { "008": "260925nuuuuuuuuxx ||||| |||||||| ||khm d" },
    { "035": df("  ", [["a", "(PTEC-PMB)1e84862326f468f5"]]) },
    { "041": df("0 ", [["a", "khm"]]) },
    { "082": df(" 4", [["a", "920"]]) },
    { "100": df("1 ", [["a", "Labbé Brigitte"]]) },
    { "245": df("10", [["a", "ខ្ញុំចង់ដឹងជីវិតរបស់... ម៉ាកូ ប៉ូឡូ"]]) },
    { "653": df("  ", [["a", "900 ប្រវត្តិសាស្ត្រ និងភូមិសាស្ត្រ"]]) },
    { "942": df("  ", [["c", "BK"], ["2", "ddc"]]) },
    { "999": df("  ", [["c", "2"], ["d", "2"]]) },
  ],
};

/** A copy-catalogued record: ISBD punctuation, subtitle, 264, a valid ISBN. */
const LOC: MarcInJson = {
  fields: [
    { "008": "120514s2012    enka     b    001 0 eng d" },
    { "020": df("  ", [["a", "9780415690157 (pbk.)"]]) },
    { "100": df("1 ", [["a", "Hattie, John,"]]) },
    { "245": df("10", [["a", "Visible learning for teachers :"], ["b", "maximizing impact on learning /"], ["c", "John Hattie."]]) },
    { "264": df(" 1", [["a", "London :"], ["b", "Routledge,"], ["c", "2012."]]) },
    { "999": df("  ", [["c", "77"]]) },
  ],
};

describe("projectBiblio", () => {
  it("reads a PMB-migrated record as the e-Library importer would have stored it", () => {
    expect(projectBiblio(PMB)).toEqual({
      kohaBiblioId: 2,
      title: "ខ្ញុំចង់ដឹងជីវិតរបស់... ម៉ាកូ ប៉ូឡូ",
      author: "Labbé Brigitte",
      isbn: null,
      publisher: null,
      year: null,
      language: "km",
      category: "900 ប្រវត្តិសាស្ត្រ និងភូមិសាស្ត្រ",
      ddcClass: "920",
    });
  });

  it("reads a copy-catalogued record: ISBD punctuation stripped, subtitle joined, ISBN normalised", () => {
    expect(projectBiblio(LOC)).toMatchObject({
      kohaBiblioId: 77,
      title: "Visible learning for teachers: maximizing impact on learning",
      author: "Hattie, John",
      isbn: "9780415690157",
      publisher: "Routledge",
      year: 2012,
      language: "en",
    });
  });

  it("keeps a full stop that belongs to a name", () => {
    const rec: MarcInJson = { fields: [{ "100": df("1 ", [["a", "Martin Ann M."]]) }, { "245": df("10", [["a", "T"]]) }, { "999": df("  ", [["c", "3"]]) }] };
    expect(projectBiblio(rec)?.author).toBe("Martin Ann M.");
  });

  it("does not store a placeholder that names nobody as an author", () => {
    const rec: MarcInJson = { fields: [{ "100": df("1 ", [["a", "គ្មានអ្នកនិពន្ធ"]]) }, { "245": df("10", [["a", "T"]]) }, { "999": df("  ", [["c", "4"]]) }] };
    expect(projectBiblio(rec)?.author).toBeNull();
  });

  it("falls back to 008 for the language, then to the title's script", () => {
    const by008: MarcInJson = { fields: [{ "008": "260925nuuuuuuuuxx ||||| |||||||| ||eng d" }, { "245": df("10", [["a", "គណិតវិទ្យា"]]) }, { "999": df("  ", [["c", "5"]]) }] };
    expect(projectBiblio(by008)?.language).toBe("en");
    const byScript: MarcInJson = { fields: [{ "245": df("10", [["a", "គណិតវិទ្យា"]]) }, { "999": df("  ", [["c", "6"]]) }] };
    expect(projectBiblio(byScript)?.language).toBe("km");
    const other: MarcInJson = { fields: [{ "041": df("0 ", [["a", "ger"]]) }, { "245": df("10", [["a", "Buch"]]) }, { "999": df("  ", [["c", "7"]]) }] };
    expect(projectBiblio(other)?.language).toBe("other");
  });

  it("ignores an invalid ISBN rather than storing it", () => {
    const rec: MarcInJson = { fields: [{ "020": df("  ", [["a", "9780415690158"]]) }, { "245": df("10", [["a", "T"]]) }, { "999": df("  ", [["c", "8"]]) }] };
    expect(projectBiblio(rec)?.isbn).toBeNull();
  });

  it("returns nothing for a record without a biblionumber or a title", () => {
    expect(projectBiblio({ fields: [{ "245": df("10", [["a", "T"]]) }] })).toBeNull();
    expect(projectBiblio({ fields: [{ "999": df("  ", [["c", "9"]]) }] })).toBeNull();
  });
});

const item = (over: Partial<KohaItem>): KohaItem => ({
  item_id: 1, biblio_id: 2, external_id: "0991", callnumber: "920 LAB", home_library_id: "PTEC", holding_library_id: "PTEC",
  location: null, collection_code: null, checked_out_date: null, not_for_loan_status: 0, lost_status: 0, damaged_status: 0,
  withdrawn: 0, restricted_status: null, inventory_number: null, timestamp: "2026-09-26T10:00:00+07:00", ...over,
});

describe("copyStatusOf", () => {
  it("maps each Koha state, most important first", () => {
    expect(copyStatusOf(item({}))).toBe("available");
    expect(copyStatusOf(item({ checked_out_date: "2026-10-10" }))).toBe("on_loan");
    expect(copyStatusOf(item({ damaged_status: 1, checked_out_date: "2026-10-10" }))).toBe("damaged");
    expect(copyStatusOf(item({ lost_status: 1, damaged_status: 1 }))).toBe("lost");
    expect(copyStatusOf(item({ lost_status: 4 }))).toBe("missing");
    expect(copyStatusOf(item({ withdrawn: 1, lost_status: 1 }))).toBe("withdrawn");
    expect(copyStatusOf(item({ not_for_loan_status: -1 }))).toBe("processing");
    expect(copyStatusOf(item({ not_for_loan_status: 1 }))).toBe("reference_only");
    expect(copyStatusOf(item({ restricted_status: 1 }))).toBe("reference_only");
    expect(copyStatusOf(item({ not_for_loan_status: 0, effective_not_for_loan_status: 1 }))).toBe("reference_only");
  });
});

describe("projectItem", () => {
  it("keeps the barcode exactly, leading zero included, and prefers Koha's labels", () => {
    const p = projectItem(item({
      location: "REF", collection_code: "PED",
      _strings: { location: { str: "Reference" }, collection_code: { str: "Department of Pedagogy" }, holding_library_id: { str: "PTEC Library" } },
    }));
    expect(p).toMatchObject({
      kohaItemId: 1, kohaBiblioId: 2, barcode: "0991", callNumber: "920 LAB",
      shelfLocation: "Reference", holdingLibrary: "PTEC Library", collection: "Department of Pedagogy", status: "available",
    });
  });

  it("falls back to codes without labels", () => {
    expect(projectItem(item({ location: "REF" }))).toMatchObject({ shelfLocation: "REF", holdingLibrary: "PTEC", collection: null });
  });
});

describe("record-level fields from copies", () => {
  it("takes the call number most copies carry, else the Dewey class", () => {
    expect(recordCallNumber([
      { callNumber: "371.1 HAT", status: "available" },
      { callNumber: "371.1 HAT", status: "on_loan" },
      { callNumber: "371.1 HAT c.3", status: "available" },
    ], "371.1")).toBe("371.1 HAT");
    expect(recordCallNumber([{ callNumber: null, status: "available" }], "371.1")).toBe("371.1");
    expect(recordCallNumber([{ callNumber: "X", status: "withdrawn" }], null)).toBeNull();
  });

  it("takes the department most copies are collected under", () => {
    expect(recordDepartment([{ collection: "Department of Pedagogy", status: "available" }, { collection: null, status: "available" }])).toBe("Department of Pedagogy");
    expect(recordDepartment([{ collection: null, status: "available" }])).toBeNull();
  });
});
