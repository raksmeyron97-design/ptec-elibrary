import { describe, it, expect } from "vitest";
import {
  normalizeHeader,
  autoMapHeaders,
  missingRequiredFields,
  applyMappings,
  convertGoogleDriveUrl,
  analyzeCoverUrl,
  normalizeLanguage,
  normalizeKeywords,
  parseCopiesTotal,
  validateRow,
  markInFileDuplicates,
  buildImportGroups,
  summarizeValidation,
  chunkGroups,
  buildFailedRowsCsv,
  buildImportReportCsv,
  refreshRowStatus,
  groupKey,
  IMPORT_LIMITS,
  DEFAULT_IMPORT_OPTIONS,
  type ValidatedRow,
  type ImportRowResult,
} from "./catalog-import";

// ── Header normalization & auto-mapping ──────────────────────────────────────

describe("normalizeHeader", () => {
  it("trims, lowercases and underscores", () => {
    expect(normalizeHeader("  Book Title ")).toBe("book_title");
    expect(normalizeHeader("Shelf-Location")).toBe("shelf_location");
    expect(normalizeHeader("Pub  Year")).toBe("pub_year");
  });
  it("strips a UTF-8 BOM from the first header", () => {
    expect(normalizeHeader("﻿title")).toBe("title");
  });
  it("collapses repeated underscores and trims edge underscores", () => {
    expect(normalizeHeader("__cover___url__")).toBe("cover_url");
  });
});

describe("autoMapHeaders", () => {
  it("maps exact canonical names with confidence 1", () => {
    const m = autoMapHeaders(["title", "author"], [["A", "B"]]);
    expect(m[0]).toMatchObject({ destination: "title", confidence: 1 });
    expect(m[1]).toMatchObject({ destination: "author", confidence: 1 });
  });
  it("maps known aliases (Book Name → title, Writer → author, Tags → keywords)", () => {
    const m = autoMapHeaders(["Book Name", "Writer", "Pub Year", "Photo", "Tags", "Accession"], [[]]);
    expect(m.map((x) => x.destination)).toEqual([
      "title", "author", "year", "cover_url", "keywords", "accession_number",
    ]);
    expect(m.every((x) => x.confidence === 0.9)).toBe(true);
  });
  it("never maps two columns to the same destination", () => {
    const m = autoMapHeaders(["title", "book_title"], [[]]);
    expect(m[0].destination).toBe("title");
    expect(m[1].destination).toBe("ignore");
  });
  it("leaves unknown headers unmapped", () => {
    const m = autoMapHeaders(["random_stuff"], [[]]);
    expect(m[0].destination).toBe("ignore");
    expect(m[0].confidence).toBe(0);
  });
  it("collects sample values", () => {
    const m = autoMapHeaders(["title"], [["First"], ["Second"], ["Third"], ["Fourth"]]);
    expect(m[0].sampleValues).toEqual(["First", "Second", "Third"]);
  });
});

describe("missingRequiredFields / applyMappings", () => {
  it("reports missing title/author", () => {
    const m = autoMapHeaders(["isbn"], [[]]);
    expect(missingRequiredFields(m)).toEqual(["title", "author"]);
  });
  it("applies mappings by column index", () => {
    const m = autoMapHeaders(["Writer", "Book Name"], [[]]);
    const rec = applyMappings(["John", "Intro"], m);
    expect(rec).toEqual({ author: "John", title: "Intro" });
  });
});

// ── Google Drive & cover URLs ─────────────────────────────────────────────────

describe("convertGoogleDriveUrl", () => {
  it("converts /file/d/ share links", () => {
    expect(convertGoogleDriveUrl("https://drive.google.com/file/d/ABC_12-3/view?usp=sharing"))
      .toBe("https://lh3.googleusercontent.com/d/ABC_12-3");
  });
  it("converts open?id= links", () => {
    expect(convertGoogleDriveUrl("https://drive.google.com/open?id=XYZ"))
      .toBe("https://lh3.googleusercontent.com/d/XYZ");
  });
  it("leaves other URLs alone", () => {
    expect(convertGoogleDriveUrl("https://example.com/cover.jpg")).toBe("https://example.com/cover.jpg");
  });
});

describe("analyzeCoverUrl", () => {
  it("empty → none", () => {
    expect(analyzeCoverUrl("")).toEqual({ status: "none", url: null });
    expect(analyzeCoverUrl(undefined)).toEqual({ status: "none", url: null });
  });
  it("valid https image URL passes through", () => {
    expect(analyzeCoverUrl("https://example.com/a.jpg").status).toBe("valid");
  });
  it("Drive links are converted", () => {
    const r = analyzeCoverUrl("https://drive.google.com/file/d/ID1/view");
    expect(r.status).toBe("converted");
    expect(r.url).toBe("https://lh3.googleusercontent.com/d/ID1");
  });
  it("rejects javascript: and data: protocols", () => {
    expect(analyzeCoverUrl("javascript:alert(1)").status).toBe("invalid");
    expect(analyzeCoverUrl("data:image/png;base64,AAAA").status).toBe("invalid");
  });
  it("rejects plain http (insecure) but keeps note", () => {
    const r = analyzeCoverUrl("http://example.com/a.jpg");
    expect(r.status).toBe("insecure");
    expect(r.url).toBeNull();
  });
  it("rejects overlong URLs", () => {
    const r = analyzeCoverUrl("https://example.com/" + "a".repeat(IMPORT_LIMITS.maxCoverUrlLength));
    expect(r.status).toBe("invalid");
  });
  it("rejects unparseable URLs", () => {
    expect(analyzeCoverUrl("not a url").status).toBe("invalid");
  });
});

// ── Language / keywords / copies ──────────────────────────────────────────────

describe("normalizeLanguage", () => {
  it("blank defaults to km", () => {
    expect(normalizeLanguage("")).toEqual({ value: "km", known: true });
  });
  it("accepts codes and names (including Khmer names)", () => {
    expect(normalizeLanguage("EN").value).toBe("en");
    expect(normalizeLanguage("Khmer").value).toBe("km");
    expect(normalizeLanguage("ខ្មែរ").value).toBe("km");
    expect(normalizeLanguage("french").value).toBe("fr");
    expect(normalizeLanguage("Chinese").value).toBe("zh");
  });
  it("unknown values map to other and are flagged", () => {
    expect(normalizeLanguage("klingon")).toEqual({ value: "other", known: false });
  });
});

describe("normalizeKeywords", () => {
  it("splits on comma, semicolon and pipe", () => {
    expect(normalizeKeywords("a, b; c | d")).toEqual(["a", "b", "c", "d"]);
  });
  it("dedupes case-insensitively and drops empties", () => {
    expect(normalizeKeywords("Law, law, ,LAW, intro")).toEqual(["Law", "intro"]);
  });
  it("preserves Khmer keywords", () => {
    expect(normalizeKeywords("ច្បាប់, សិក្សា")).toEqual(["ច្បាប់", "សិក្សា"]);
  });
});

describe("parseCopiesTotal", () => {
  it("blank → null", () => {
    expect(parseCopiesTotal("")).toEqual({ ok: true, value: null });
  });
  it("accepts 0 and positive integers", () => {
    expect(parseCopiesTotal("0")).toEqual({ ok: true, value: 0 });
    expect(parseCopiesTotal("12")).toEqual({ ok: true, value: 12 });
  });
  it("rejects negatives, decimals and text", () => {
    expect(parseCopiesTotal("-1").ok).toBe(false);
    expect(parseCopiesTotal("1.5").ok).toBe(false);
    expect(parseCopiesTotal("three").ok).toBe(false);
  });
  it("rejects values above the per-book cap", () => {
    expect(parseCopiesTotal(String(IMPORT_LIMITS.maxCopiesPerBook + 1)).ok).toBe(false);
  });
});

// ── Row validation ────────────────────────────────────────────────────────────

const GOOD_ROW = {
  title: "Introduction to Law",
  author: "John Smith",
  isbn: "978-0-306-40615-7",
  year: "2020",
  language: "en",
  category: "Law",
  copies_total: "1",
  barcode: "33697",
};

describe("validateRow", () => {
  it("a fully valid row is ready with normalized values", () => {
    const r = validateRow(GOOD_ROW, 2);
    expect(r.status).toBe("ready");
    expect(r.normalized.isbn).toBe("9780306406157");
    expect(r.normalized.year).toBe(2020);
    expect(r.normalized.language).toBe("en");
    expect(r.normalized.barcode).toBe("33697");
  });
  it("missing title/author are errors", () => {
    const r = validateRow({ title: " ", author: "" }, 2);
    expect(r.status).toBe("error");
    expect(r.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["REQUIRED_TITLE", "REQUIRED_AUTHOR"]),
    );
  });
  it("bad ISBN checksum is an error", () => {
    const r = validateRow({ ...GOOD_ROW, isbn: "978-0-306-40615-8" }, 2);
    expect(r.status).toBe("error");
    expect(r.issues.some((i) => i.code === "INVALID_ISBN")).toBe(true);
  });
  it("whitespace is collapsed but Khmer text preserved", () => {
    const r = validateRow({ title: "  ច្បាប់   រដ្ឋប្បវេណី ", author: "ក  សុខា" }, 2);
    expect(r.normalized.title).toBe("ច្បាប់ រដ្ឋប្បវេណី");
    expect(r.normalized.author).toBe("ក សុខា");
    expect(r.status).toBe("ready");
  });
  it("unknown language is a warning, imported as other", () => {
    const r = validateRow({ ...GOOD_ROW, language: "German" }, 2);
    expect(r.status).toBe("warning");
    expect(r.normalized.language).toBe("other");
  });
  it("new category vs reference values is a warning", () => {
    const refs = { categories: ["Law"], departments: [] };
    const known = validateRow({ ...GOOD_ROW, category: "law" }, 2, refs);
    expect(known.issues.some((i) => i.code === "NEW_CATEGORY")).toBe(false);
    const novel = validateRow({ ...GOOD_ROW, category: "Astrology" }, 2, refs);
    expect(novel.issues.some((i) => i.code === "NEW_CATEGORY")).toBe(true);
    expect(novel.status).toBe("warning");
  });
  it("invalid cover URL is a warning, not an error, and url is dropped", () => {
    const r = validateRow({ ...GOOD_ROW, cover_url: "javascript:alert(1)" }, 2);
    expect(r.status).toBe("warning");
    expect(r.normalized.cover_url).toBeNull();
  });
  it("oversized fields are errors", () => {
    const r = validateRow({ ...GOOD_ROW, title: "x".repeat(301) }, 2);
    expect(r.status).toBe("error");
    expect(r.issues.some((i) => i.code === "FIELD_TOO_LONG")).toBe(true);
  });
  it("pathologically long cells are rejected early", () => {
    const r = validateRow({ ...GOOD_ROW, description: "x".repeat(6000) }, 2);
    expect(r.status).toBe("error");
  });
  it("bad year and bad copies are errors", () => {
    expect(validateRow({ ...GOOD_ROW, year: "20" }, 2).status).toBe("error");
    expect(validateRow({ ...GOOD_ROW, copies_total: "-2" }, 2).status).toBe("error");
  });
});

// ── In-file duplicates ────────────────────────────────────────────────────────

describe("markInFileDuplicates", () => {
  it("flags repeated barcodes/accessions with the first row number", () => {
    const rows = [
      validateRow({ ...GOOD_ROW, barcode: "B1", accession_number: "A1" }, 2),
      validateRow({ ...GOOD_ROW, barcode: "B1", accession_number: "A2" }, 3),
      validateRow({ ...GOOD_ROW, barcode: "B2", accession_number: "A1" }, 4),
    ];
    const marked = markInFileDuplicates(rows);
    expect(marked[0].status).toBe("ready");
    expect(marked[1].status).toBe("error");
    expect(marked[1].issues.some((i) => i.code === "DUPLICATE_BARCODE_IN_FILE" && i.message.includes("row 2"))).toBe(true);
    expect(marked[2].status).toBe("error");
    expect(marked[2].issues.some((i) => i.code === "DUPLICATE_ACCESSION_IN_FILE")).toBe(true);
  });
});

// ── Grouping ──────────────────────────────────────────────────────────────────

describe("buildImportGroups", () => {
  const opts = { defaultOneCopy: true };

  it("rows with same title+author+isbn become one book with one copy per barcoded row", () => {
    const rows = [
      validateRow({ ...GOOD_ROW, barcode: "B1" }, 2),
      validateRow({ ...GOOD_ROW, barcode: "B2" }, 3),
    ];
    const { groups } = buildImportGroups(rows, opts);
    expect(groups).toHaveLength(1);
    expect(groups[0].copies.map((c) => c.barcode)).toEqual(["B1", "B2"]);
    expect(groups[0].rowNumbers).toEqual([2, 3]);
  });

  it("different isbn splits otherwise identical rows", () => {
    const rows = [
      validateRow({ title: "T", author: "A", isbn: "9780306406157" }, 2),
      validateRow({ title: "T", author: "A" }, 3),
    ];
    const { groups } = buildImportGroups(rows, opts);
    expect(groups).toHaveLength(2);
  });

  it("copies_total tops up unbarcoded copies with a warning", () => {
    const rows = [validateRow({ ...GOOD_ROW, copies_total: "3", barcode: "B1" }, 2)];
    const { groups, rows: outRows } = buildImportGroups(rows, opts);
    expect(groups[0].copies).toHaveLength(3);
    expect(groups[0].copies.filter((c) => c.barcode === null)).toHaveLength(2);
    expect(outRows[0].issues.some((i) => i.code === "COPIES_BARCODE_MISMATCH")).toBe(true);
  });

  it("copies_total alone creates that many copies (no warning)", () => {
    const rows = [validateRow({ title: "T", author: "A", copies_total: "2" }, 2)];
    const { groups, rows: outRows } = buildImportGroups(rows, opts);
    expect(groups[0].copies).toHaveLength(2);
    expect(outRows[0].issues).toHaveLength(0);
  });

  it("defaultOneCopy creates one copy for bare metadata rows", () => {
    const rows = [validateRow({ title: "T", author: "A" }, 2)];
    expect(buildImportGroups(rows, { defaultOneCopy: true }).groups[0].copies).toHaveLength(1);
    expect(buildImportGroups(rows, { defaultOneCopy: false }).groups[0].copies).toHaveLength(0);
  });

  it("copies_total = 0 means metadata only, even with defaultOneCopy", () => {
    const rows = [validateRow({ title: "T", author: "A", copies_total: "0" }, 2)];
    expect(buildImportGroups(rows, opts).groups[0].copies).toHaveLength(0);
  });

  it("error rows and skipped rows are excluded from groups", () => {
    const rows = [
      validateRow({ title: "", author: "A" }, 2),
      { ...validateRow({ title: "T", author: "A" }, 3), skipped: true },
    ];
    expect(buildImportGroups(rows, opts).groups).toHaveLength(0);
  });
});

// ── Summary / chunking / reports ──────────────────────────────────────────────

describe("summarizeValidation", () => {
  it("counts statuses, new values and drive conversions", () => {
    const refs = { categories: ["Law"], departments: [] };
    const rows = [
      validateRow(GOOD_ROW, 2, refs),
      validateRow({ ...GOOD_ROW, barcode: "B9", category: "Astrology", cover_url: "https://drive.google.com/file/d/X/view" }, 3, refs),
      validateRow({ title: "", author: "" }, 4, refs),
      { ...validateRow({ ...GOOD_ROW, barcode: "B8" }, 5, refs), skipped: true },
    ];
    const { groups, rows: outRows } = buildImportGroups(rows, { defaultOneCopy: true });
    const s = summarizeValidation(outRows, groups);
    expect(s.total).toBe(4);
    expect(s.ready).toBe(1);
    expect(s.warnings).toBe(1);
    expect(s.errors).toBe(1);
    expect(s.skipped).toBe(1);
    expect(s.newCategories).toEqual(["Astrology"]);
    expect(s.driveLinksConverted).toBe(1);
  });
});

describe("chunkGroups", () => {
  it("keeps groups whole and respects the row budget", () => {
    const mkGroup = (rows: number[]) => {
      const vr = rows.map((n) => validateRow({ ...GOOD_ROW, barcode: `B${n}` }, n));
      return buildImportGroups(vr, { defaultOneCopy: true }).groups[0];
    };
    const groups = [mkGroup([1, 2, 3]), mkGroup([4, 5]), mkGroup([6, 7, 8, 9])];
    const batches = chunkGroups(groups, 5);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(2); // 3 + 2 rows
    expect(batches[1]).toHaveLength(1); // 4 rows (group not split)
  });
  it("a single oversized group still forms one batch", () => {
    const vr = Array.from({ length: 10 }, (_, i) => validateRow({ ...GOOD_ROW, barcode: `C${i}` }, i + 2));
    const g = buildImportGroups(vr, { defaultOneCopy: true }).groups;
    expect(chunkGroups(g, 5)).toHaveLength(1);
  });
});

describe("reports", () => {
  it("failed-rows CSV keeps original columns and escapes formulas", () => {
    const rows: ValidatedRow[] = [
      validateRow({ title: "=HYPERLINK(\"https://evil\")", author: "" }, 2),
    ];
    const csv = buildFailedRowsCsv(rows, new Map());
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toContain("title,author");
    expect(lines[0]).toContain("import_status,error_codes,error_messages");
    // Formula neutralised with a leading apostrophe (repo-wide convention).
    expect(lines[1]).toContain("'=HYPERLINK");
    expect(lines[1]).toContain("REQUIRED_AUTHOR");
  });

  it("import report includes server results", () => {
    const rows = [validateRow(GOOD_ROW, 2)];
    const results = new Map<number, ImportRowResult>([
      [2, { rowNumber: 2, status: "created", bookId: "abc", copiesCreated: 1 }],
    ]);
    const csv = buildImportReportCsv(rows, results);
    expect(csv).toContain("created");
    expect(csv).toContain("abc");
  });
});

describe("groupKey / refreshRowStatus", () => {
  it("groupKey is case-insensitive on title/author", () => {
    const a = validateRow({ title: "Intro", author: "Smith" }, 2).normalized;
    const b = validateRow({ title: "INTRO", author: "smith" }, 3).normalized;
    expect(groupKey(a)).toBe(groupKey(b));
  });
  it("refreshRowStatus turns a clean row with duplicateMatch into duplicate", () => {
    const r = validateRow({ title: "T", author: "A" }, 2);
    const dup = refreshRowStatus({
      ...r,
      duplicateMatch: { existingBookId: "x", existingTitle: "T", existingSlug: "t", matchedBy: "title_author" },
    });
    expect(dup.status).toBe("duplicate");
  });
});

describe("DEFAULT_IMPORT_OPTIONS", () => {
  it("defaults to the safest strategy (skip duplicates)", () => {
    expect(DEFAULT_IMPORT_OPTIONS.duplicateStrategy).toBe("skip");
  });
});
