import { describe, it, expect } from "vitest";
import {
  normalizeCopyStatus,
  computeCopyStats,
  getCatalogAvailability,
  statsFromCounters,
  validateIsbn,
  normalizeIsbn,
  formatIsbn,
  validatePublicationYear,
  validateBarcode,
  sequenceValue,
  generateCopies,
  findInternalDuplicates,
  catalogSlugify,
  YEAR_MIN,
  yearMax,
} from "./catalog";

describe("normalizeCopyStatus", () => {
  it("keeps canonical statuses", () => {
    expect(normalizeCopyStatus("available")).toBe("available");
    expect(normalizeCopyStatus("on_loan")).toBe("on_loan");
    expect(normalizeCopyStatus("withdrawn")).toBe("withdrawn");
  });
  it("maps legacy values", () => {
    expect(normalizeCopyStatus("checked_out")).toBe("on_loan");
    expect(normalizeCopyStatus("on_order")).toBe("processing");
  });
  it("defaults null to available (historical column default)", () => {
    expect(normalizeCopyStatus(null)).toBe("available");
    expect(normalizeCopyStatus(undefined)).toBe("available");
  });
  it("treats junk values as processing (not borrowable)", () => {
    expect(normalizeCopyStatus("banana")).toBe("processing");
  });
});

describe("computeCopyStats", () => {
  it("counts an empty list as zero", () => {
    expect(computeCopyStats([]).total).toBe(0);
    expect(computeCopyStats(null).total).toBe(0);
  });
  it("groups statuses and excludes withdrawn from totals", () => {
    const stats = computeCopyStats([
      { status: "available" },
      { status: "available" },
      { status: "on_loan" },
      { status: "checked_out" }, // legacy on_loan
      { status: "reserved" },
      { status: "reference_only" },
      { status: "lost" },
      { status: "in_repair" },
      { status: "withdrawn" },
    ]);
    expect(stats.total).toBe(8);
    expect(stats.available).toBe(2);
    expect(stats.onLoan).toBe(2);
    expect(stats.reserved).toBe(1);
    expect(stats.referenceOnly).toBe(1);
    expect(stats.unavailable).toBe(2);
  });
});

describe("getCatalogAvailability", () => {
  const base = { total: 0, available: 0, onLoan: 0, reserved: 0, referenceOnly: 0, processing: 0, unavailable: 0 };
  it("no copies at all", () => {
    expect(getCatalogAvailability(base)).toBe("no_copies");
  });
  it("anything borrowable wins", () => {
    expect(getCatalogAvailability({ ...base, total: 3, available: 1, onLoan: 2 })).toBe("available");
  });
  it("reference-only beats on-loan", () => {
    expect(getCatalogAvailability({ ...base, total: 2, referenceOnly: 1, onLoan: 1 })).toBe("reference_only");
  });
  it("all out on loan", () => {
    expect(getCatalogAvailability({ ...base, total: 2, onLoan: 2 })).toBe("on_loan");
  });
  it("reserved counts as on-loan tier", () => {
    expect(getCatalogAvailability({ ...base, total: 1, reserved: 1 })).toBe("on_loan");
  });
  it("processing only", () => {
    expect(getCatalogAvailability({ ...base, total: 1, processing: 1 })).toBe("processing");
  });
  it("damaged/lost only", () => {
    expect(getCatalogAvailability({ ...base, total: 2, unavailable: 2 })).toBe("unavailable");
  });
});

describe("statsFromCounters (legacy fallback)", () => {
  it("clamps available to total and never goes negative", () => {
    expect(statsFromCounters({ copies_total: 2, copies_available: 5 }).available).toBe(2);
    expect(statsFromCounters({ copies_total: 2, copies_available: -1 }).available).toBe(0);
  });
});

describe("ISBN validation", () => {
  it("accepts a valid ISBN-13 with hyphens", () => {
    const r = validateIsbn("978-2-940396-75-7");
    expect(r).toEqual({ ok: true, normalized: "9782940396757", kind: "isbn13" });
  });
  it("accepts a valid ISBN-10 with X check digit", () => {
    const r = validateIsbn("0-8044-2957-X");
    expect(r).toEqual({ ok: true, normalized: "080442957X", kind: "isbn10" });
  });
  it("rejects a bad checksum", () => {
    expect(validateIsbn("9782940396758").ok).toBe(false);
    expect(validateIsbn("0804429572").ok).toBe(false);
  });
  it("rejects wrong lengths", () => {
    expect(validateIsbn("12345").ok).toBe(false);
  });
  it("treats empty as ok/null (ISBN optional)", () => {
    expect(validateIsbn("")).toEqual({ ok: true, normalized: null, kind: null });
    expect(validateIsbn(null)).toEqual({ ok: true, normalized: null, kind: null });
  });
  it("normalizes spacing and case", () => {
    expect(normalizeIsbn(" 080442957 x ")).toBe("080442957X");
  });
  it("formats ISBN-13 with a prefix hyphen for display", () => {
    expect(formatIsbn("9782940396757")).toBe("978-2940396757");
    expect(formatIsbn(null)).toBeNull();
  });
});

describe("publication year", () => {
  it("accepts blank as null", () => {
    expect(validatePublicationYear("")).toEqual({ ok: true, year: null });
    expect(validatePublicationYear(null)).toEqual({ ok: true, year: null });
  });
  it("accepts a realistic year", () => {
    expect(validatePublicationYear("2019")).toEqual({ ok: true, year: 2019 });
  });
  it("rejects pre-print-era and far-future years", () => {
    expect(validatePublicationYear(String(YEAR_MIN - 1)).ok).toBe(false);
    expect(validatePublicationYear(String(yearMax() + 1)).ok).toBe(false);
  });
  it("rejects non-integers", () => {
    expect(validatePublicationYear("19.5").ok).toBe(false);
    expect(validatePublicationYear("abc").ok).toBe(false);
  });
});

describe("barcode validation", () => {
  it("normalizes whitespace away", () => {
    expect(validateBarcode(" PTEC- 001250 ")).toEqual({ ok: true, barcode: "PTEC-001250" });
  });
  it("allows empty (barcode can be assigned later)", () => {
    expect(validateBarcode("")).toEqual({ ok: true, barcode: null });
  });
  it("rejects illegal characters and over-long values", () => {
    expect(validateBarcode("bad;code").ok).toBe(false);
    expect(validateBarcode("A".repeat(40)).ok).toBe(false);
  });
});

describe("sequence generation", () => {
  it("pads according to the start number (min 4)", () => {
    expect(sequenceValue("PTEC-", 1250, 0)).toBe("PTEC-1250");
    expect(sequenceValue("PTEC-", 1250, 1, 6)).toBe("PTEC-001251");
    expect(sequenceValue("ACC-", 7, 2)).toBe("ACC-0009");
  });

  it("generates a numbered batch with call-number copy suffixes", () => {
    const rows = generateCopies({
      count: 2,
      barcodePrefix: "PTEC-",
      barcodeStart: 1250,
      accessionPrefix: "ACC-",
      accessionStart: 1250,
      callNumberBase: "341.6 MEL",
      shelfLocation: "B-2-01",
      copyNumberStart: 1,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      copy_number: 1,
      barcode: "PTEC-1250",
      accession_number: "ACC-1250",
      call_number: "341.6 MEL C.1",
      shelf_location: "B-2-01",
      status: "available",
    });
    expect(rows[1].barcode).toBe("PTEC-1251");
    expect(rows[1].call_number).toBe("341.6 MEL C.2");
  });

  it("omits barcodes/accessions when no start number is given", () => {
    const rows = generateCopies({ count: 1, copyNumberStart: 3 });
    expect(rows[0].barcode).toBeNull();
    expect(rows[0].accession_number).toBeNull();
    expect(rows[0].copy_number).toBe(3);
    expect(rows[0].holding_library).toBe("PTEC Library");
  });

  it("caps the batch at 100", () => {
    expect(generateCopies({ count: 500 })).toHaveLength(100);
  });
});

describe("findInternalDuplicates", () => {
  it("finds duplicates and ignores nulls", () => {
    expect(findInternalDuplicates(["a", null, "b", "a", null])).toEqual(["a"]);
    expect(findInternalDuplicates(["a", "b"])).toEqual([]);
  });
});

describe("catalogSlugify", () => {
  it("slugifies with diacritics stripped", () => {
    expect(catalogSlugify("Café & Books! ")).toBe("cafe-books");
  });
  it("caps length at 100", () => {
    expect(catalogSlugify("x".repeat(300)).length).toBeLessThanOrEqual(100);
  });
});
