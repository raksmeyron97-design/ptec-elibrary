// lib/catalog-import.ts
// Shared, pure logic for the catalog CSV import wizard.
//
// Used on BOTH sides:
//   • client (app/(admin)/admin/(protected)/catalogs/import/*) — instant
//     preview: header auto-mapping, row normalization, validation, grouping;
//   • server (import-actions.ts) — re-runs the exact same normalization and
//     validation on the raw values before anything is written. The server
//     never trusts a client-side verdict.
//
// Data-model facts this module encodes (verified against the live schema):
//   • catalog_books.category / department / shelf_location / language are
//     FREE-TEXT columns — there are no reference tables for the physical
//     catalog, so an "unknown category" is a warning (new value), never a
//     missing foreign key;
//   • one CSV row ≈ one physical copy: rows sharing title+author(+isbn) are
//     grouped into one bibliographic record and each row's barcode/accession
//     becomes a catalog_copies row (model B in library terms);
//   • copies_total can top-up a group with unbarcoded copies but can never
//     shrink it below the number of barcoded rows;
//   • barcodes / accession numbers are unique among live copies (0095).

import {
  validateIsbn,
  validatePublicationYear,
  validateBarcode,
  YEAR_MIN,
  yearMax,
} from "@/lib/catalog";
import { escapeCsvCell } from "@/lib/admin/csv";

// ── Limits (server enforces the same values — keep in one place) ─────────────

export const IMPORT_LIMITS = {
  /** Max upload size. Vercel server-action body limit is 1 MB by default is
   *  bypassed here because the file is parsed in the browser and sent in
   *  row batches; this limit bounds browser memory + paste size. */
  maxFileBytes: 5 * 1024 * 1024,
  maxRows: 5000,
  maxColumns: 60,
  /** Rows per server batch call (groups never span a batch). */
  batchRows: 50,
  maxCopiesPerBook: 200,
  maxKeywords: 20,
  maxKeywordLength: 50,
  maxCoverUrlLength: 2048,
  maxFieldLength: 5000, // absolute cap before per-field limits apply
} as const;

// Per-field max lengths — mirror MAX_TEXT in lib/catalog.ts.
export const FIELD_MAX: Record<string, number> = {
  title: 300, author: 200, publisher: 200, category: 100, department: 100,
  shelf_location: 60, accession_number: 60, barcode: 32, description: 5000,
};

// ── Fields & template ─────────────────────────────────────────────────────────

export const IMPORT_FIELDS = [
  "title", "author", "isbn", "publisher", "year", "language", "category",
  "department", "shelf_location", "copies_total", "description",
  "accession_number", "barcode", "cover_url", "keywords",
] as const;

export type BookImportField = (typeof IMPORT_FIELDS)[number];

export const REQUIRED_FIELDS: BookImportField[] = ["title", "author"];

export type FieldDoc = {
  field: BookImportField;
  required: boolean;
  type: string;
  example: string;
  rule: string;
};

export const FIELD_DOCS: FieldDoc[] = [
  { field: "title", required: true, type: "text ≤ 300", example: "Introduction to Law", rule: "Required. Khmer and English both supported." },
  { field: "author", required: true, type: "text ≤ 200", example: "John Smith", rule: "Required. Kept exactly as written (order preserved)." },
  { field: "isbn", required: false, type: "ISBN-10 / ISBN-13", example: "978-0-306-40615-7", rule: "Checksum-validated. Hyphens and spaces are ignored. Blank allowed." },
  { field: "publisher", required: false, type: "text ≤ 200", example: "PTEC Press", rule: "Optional free text." },
  { field: "year", required: false, type: `year ${YEAR_MIN}–${yearMax()}`, example: "2020", rule: "Whole number. Blank allowed." },
  { field: "language", required: false, type: "km | en | fr | zh | other", example: "km", rule: "Names also accepted (Khmer, English, ខ្មែរ…). Blank defaults to km." },
  { field: "category", required: false, type: "text ≤ 100", example: "Law", rule: "Matched case-insensitively against existing values; new values are flagged before import." },
  { field: "department", required: false, type: "text ≤ 100", example: "Public Law", rule: "Matched case-insensitively against existing values; new values are flagged." },
  { field: "shelf_location", required: false, type: "text ≤ 60", example: "A-1-01", rule: "Free text (e.g. shelf / rack code)." },
  { field: "copies_total", required: false, type: "integer 0–200", example: "3", rule: "Copies to create. Rows with a barcode already count as one copy each." },
  { field: "description", required: false, type: "text ≤ 5000", example: "A comprehensive intro…", rule: "Line breaks preserved. Quote the cell if it contains commas." },
  { field: "accession_number", required: false, type: "text ≤ 60", example: "ACC-001", rule: "Must be unique per physical copy. Leading zeros preserved." },
  { field: "barcode", required: false, type: "text ≤ 32", example: "33697", rule: "Letters, digits, . _ - / only. Must be unique across the whole library." },
  { field: "cover_url", required: false, type: "https URL ≤ 2048", example: "https://drive.google.com/file/d/…/view", rule: "Google Drive share links are converted automatically. https only." },
  { field: "keywords", required: false, type: "list ≤ 20", example: "law, intro, guide", rule: "Comma / semicolon / pipe separated. Duplicates removed." },
];

export const CSV_TEMPLATE_HEADER = IMPORT_FIELDS.join(",");

export const CSV_TEMPLATE_BLANK = `${CSV_TEMPLATE_HEADER}\n`;

export const CSV_TEMPLATE_EXAMPLE =
  `${CSV_TEMPLATE_HEADER}
Introduction to Law,John Smith,978-0-306-40615-7,PTEC Press,2020,en,Law,Public Law,A-1-01,1,"A comprehensive introduction to law, with case studies.",ACC-001,33697,https://drive.google.com/file/d/1QuNSZO4OMf2tTlv89GfG4PGdCK2VE2sW/view?usp=sharing,"law, intro, guide"
Introduction to Law,John Smith,978-0-306-40615-7,PTEC Press,2020,en,Law,Public Law,A-1-01,1,"A comprehensive introduction to law, with case studies.",ACC-002,33698,https://drive.google.com/file/d/1QuNSZO4OMf2tTlv89GfG4PGdCK2VE2sW/view?usp=sharing,"law, intro, guide"
ច្បាប់រដ្ឋប្បវេណី,ក សុខា,,,2019,km,Law,Civil Law,B-2-05,1,ច្បាប់រដ្ឋប្បវេណីខ្មែរ,ACC-003,33699,,ច្បាប់
`;

// ── Header aliases & auto-mapping ─────────────────────────────────────────────

const HEADER_ALIASES: Record<BookImportField, string[]> = {
  title: ["title", "book_title", "book_name", "name", "resource_title", "ចំណងជើង"],
  author: ["author", "authors", "writer", "creator", "written_by", "author_name", "អ្នកនិពន្ធ"],
  isbn: ["isbn", "isbn_10", "isbn_13", "isbn10", "isbn13", "book_isbn"],
  publisher: ["publisher", "publishing_house", "press"],
  year: ["year", "publication_year", "published_year", "pub_year", "publish_year", "date_published", "ឆ្នាំ"],
  language: ["language", "lang", "book_language", "ភាសា"],
  category: ["category", "book_category", "subject", "genre", "ប្រភេទ"],
  department: ["department", "faculty", "unit", "dept"],
  shelf_location: ["shelf_location", "shelf", "location", "rack", "shelf_no", "shelf_number"],
  copies_total: ["copies_total", "copies", "quantity", "total_copies", "qty", "no_of_copies", "number_of_copies"],
  description: ["description", "summary", "abstract", "notes", "note"],
  accession_number: ["accession_number", "accession", "accession_no", "acc_no", "acc_number"],
  barcode: ["barcode", "bar_code", "barcode_no"],
  cover_url: ["cover_url", "cover", "image_url", "photo_url", "image", "photo", "cover_image", "cover_link"],
  keywords: ["keywords", "tags", "subjects", "keyword"],
};

/** Trim, strip BOM, lowercase, spaces/hyphens → underscores, collapse repeats. */
export function normalizeHeader(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export type ColumnMapping = {
  sourceHeader: string;
  /** Position in the CSV — headers may repeat, so index is the real key. */
  sourceIndex: number;
  destination: BookImportField | "ignore";
  /** 1 exact field · 0.9 exact alias · 0.7–0.89 fuzzy · 0 unmapped. */
  confidence: number;
  manuallyChanged: boolean;
  sampleValues: string[];
};

function fuzzyMatch(header: string): { field: BookImportField; confidence: number } | null {
  // "likely" match: the normalized header contains an alias as a whole word
  // segment (e.g. "book_title_en" → title). Kept conservative on purpose.
  for (const field of IMPORT_FIELDS) {
    for (const alias of HEADER_ALIASES[field]) {
      if (alias.length < 4) continue; // "qty"-length fragments are too noisy
      const parts = header.split("_");
      if (parts.includes(alias) || header.startsWith(`${alias}_`) || header.endsWith(`_${alias}`)) {
        return { field, confidence: 0.75 };
      }
    }
  }
  return null;
}

/**
 * Auto-map CSV headers to destination fields. Never maps two columns to the
 * same destination (first wins; later ones stay unmapped for manual review).
 */
export function autoMapHeaders(headers: string[], sampleRows: string[][]): ColumnMapping[] {
  const taken = new Set<BookImportField>();
  return headers.map((raw, i) => {
    const norm = normalizeHeader(raw);
    let destination: BookImportField | "ignore" = "ignore";
    let confidence = 0;

    if (norm) {
      if ((IMPORT_FIELDS as readonly string[]).includes(norm) && !taken.has(norm as BookImportField)) {
        destination = norm as BookImportField;
        confidence = 1;
      } else {
        const exactAlias = IMPORT_FIELDS.find(
          (f) => !taken.has(f) && HEADER_ALIASES[f].includes(norm),
        );
        if (exactAlias) {
          destination = exactAlias;
          confidence = 0.9;
        } else {
          const fuzzy = fuzzyMatch(norm);
          if (fuzzy && !taken.has(fuzzy.field)) {
            destination = fuzzy.field;
            confidence = fuzzy.confidence;
          }
        }
      }
    }
    if (destination !== "ignore") taken.add(destination);

    return {
      sourceHeader: raw.replace(/^\uFEFF/, "").trim() || `Column ${i + 1}`,
      sourceIndex: i,
      destination,
      confidence,
      manuallyChanged: false,
      sampleValues: sampleRows.slice(0, 3).map((r) => (r[i] ?? "").slice(0, 80)),
    };
  });
}

/** Destinations still missing from a mapping set. */
export function missingRequiredFields(mappings: ColumnMapping[]): BookImportField[] {
  const mapped = new Set(mappings.map((m) => m.destination));
  return REQUIRED_FIELDS.filter((f) => !mapped.has(f));
}

/** Apply mappings to one raw CSV record (array form) → field record. */
export function applyMappings(
  row: string[],
  mappings: ColumnMapping[],
): Record<BookImportField, string> {
  const out = {} as Record<BookImportField, string>;
  for (const m of mappings) {
    if (m.destination === "ignore") continue;
    const v = row[m.sourceIndex];
    if (typeof v === "string" && v.length > 0) out[m.destination] = v;
  }
  return out;
}

// ── Google Drive cover conversion (centralized) ───────────────────────────────

const DRIVE_FILE_RE = /^https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/;
const DRIVE_ID_RE = /^https?:\/\/drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([a-zA-Z0-9_-]+)/;

export function convertGoogleDriveUrl(url: string): string {
  const m = url.match(DRIVE_FILE_RE) ?? url.match(DRIVE_ID_RE);
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}` : url;
}

export type CoverStatus = "none" | "valid" | "converted" | "invalid" | "insecure";

export type CoverResult = { status: CoverStatus; url: string | null; note?: string };

/**
 * Validate + normalize a cover URL. No network fetch happens here (or on the
 * server) — remote covers are rendered by the browser, so SSRF surface is
 * zero; we only gate protocol/shape.
 */
export function analyzeCoverUrl(raw: string | undefined | null): CoverResult {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return { status: "none", url: null };
  if (trimmed.length > IMPORT_LIMITS.maxCoverUrlLength) {
    return { status: "invalid", url: null, note: "Cover URL is longer than 2048 characters." };
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { status: "invalid", url: null, note: "Cover URL is not a valid URL." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { status: "invalid", url: null, note: `"${parsed.protocol}//" links are not allowed — use https://.` };
  }
  const converted = convertGoogleDriveUrl(trimmed);
  if (converted !== trimmed) {
    return { status: "converted", url: converted, note: "Google Drive share link converted to a direct image URL." };
  }
  if (parsed.protocol === "http:") {
    return { status: "insecure", url: null, note: "Covers must use https:// — the http:// link was not imported." };
  }
  return { status: "valid", url: parsed.toString() };
}

// ── Language normalization ────────────────────────────────────────────────────

export const CATALOG_LANGUAGES = ["km", "en", "fr", "zh", "other"] as const;
export type CatalogLanguage = (typeof CATALOG_LANGUAGES)[number];

const LANGUAGE_ALIASES: Record<string, CatalogLanguage> = {
  km: "km", khm: "km", khmer: "km", cambodian: "km", "ខ្មែរ": "km", "ភាសាខ្មែរ": "km", kh: "km",
  en: "en", eng: "en", english: "en", "អង់គ្លេស": "en", "ភាសាអង់គ្លេស": "en",
  fr: "fr", fra: "fr", fre: "fr", french: "fr", "បារាំង": "fr",
  zh: "zh", chi: "zh", zho: "zh", chinese: "zh", mandarin: "zh", "ចិន": "zh",
  other: "other", others: "other", "ផ្សេងៗ": "other",
};

export function normalizeLanguage(raw: string | undefined | null): { value: CatalogLanguage; known: boolean } {
  const v = raw?.trim().toLowerCase() ?? "";
  if (!v) return { value: "km", known: true }; // library default, documented in FIELD_DOCS
  const hit = LANGUAGE_ALIASES[v];
  return hit ? { value: hit, known: true } : { value: "other", known: false };
}

// ── Issues ────────────────────────────────────────────────────────────────────

export type ImportSeverity = "warning" | "error";

export type ImportIssueCode =
  | "REQUIRED_TITLE"
  | "REQUIRED_AUTHOR"
  | "INVALID_ISBN"
  | "INVALID_YEAR"
  | "INVALID_COPIES_TOTAL"
  | "INVALID_COVER_URL"
  | "INVALID_BARCODE"
  | "FIELD_TOO_LONG"
  | "UNKNOWN_LANGUAGE"
  | "NEW_CATEGORY"
  | "NEW_DEPARTMENT"
  | "TOO_MANY_KEYWORDS"
  | "COPIES_BARCODE_MISMATCH"
  | "DUPLICATE_BARCODE_IN_FILE"
  | "DUPLICATE_ACCESSION_IN_FILE"
  | "DUPLICATE_BARCODE"
  | "DUPLICATE_ACCESSION"
  | "DUPLICATE_ISBN"
  | "DUPLICATE_TITLE_AUTHOR"
  | "SERVER_VALIDATION_ERROR";

export type ImportIssue = {
  code: ImportIssueCode;
  severity: ImportSeverity;
  field?: BookImportField;
  message: string;
};

// ── Row normalization & validation ────────────────────────────────────────────

export type NormalizedRow = {
  title: string;
  author: string;
  isbn: string | null;
  publisher: string | null;
  year: number | null;
  language: CatalogLanguage;
  category: string | null;
  department: string | null;
  shelf_location: string | null;
  copies_total: number | null;
  description: string | null;
  accession_number: string | null;
  barcode: string | null;
  cover_url: string | null;
  cover_status: CoverStatus;
  keywords: string[];
};

export type RowStatus = "ready" | "warning" | "error" | "duplicate";

export type ValidatedRow = {
  /** 1-based data-row number as the admin sees it in a spreadsheet (header = row 1). */
  rowNumber: number;
  original: Partial<Record<BookImportField, string>>;
  normalized: NormalizedRow;
  issues: ImportIssue[];
  status: RowStatus;
  /** Set when the admin excludes the row in the preview step. */
  skipped?: boolean;
  duplicateMatch?: DuplicateMatch;
};

export type DuplicateMatch = {
  existingBookId: string;
  existingTitle: string;
  existingSlug: string;
  matchedBy: "isbn" | "title_author";
};

/** Collapse inner whitespace, trim. Preserves Khmer (no unicode mangling). */
function tidy(raw: string | undefined | null): string {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

/** Like tidy but keeps line breaks (descriptions). */
function tidyMultiline(raw: string | undefined | null): string {
  return (raw ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

export function normalizeKeywords(raw: string | undefined | null): string[] {
  if (!raw?.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;|]/)) {
    const k = tidy(part).slice(0, IMPORT_LIMITS.maxKeywordLength);
    if (!k) continue;
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  return out;
}

export function parseCopiesTotal(raw: string | undefined | null):
  | { ok: true; value: number | null }
  | { ok: false; error: string } {
  const v = raw?.trim() ?? "";
  if (!v) return { ok: true, value: null };
  if (!/^\d+$/.test(v)) return { ok: false, error: "Copies must be a whole number (0 or more)." };
  const n = Number(v);
  if (n > IMPORT_LIMITS.maxCopiesPerBook) {
    return { ok: false, error: `At most ${IMPORT_LIMITS.maxCopiesPerBook} copies per book per import.` };
  }
  return { ok: true, value: n };
}

export type ReferenceValues = {
  categories: string[];
  departments: string[];
};

/**
 * Normalize + validate one mapped row. Pure — DB duplicate checks are merged
 * in afterwards (client: via the duplicate-check action; server: directly).
 */
export function validateRow(
  original: Partial<Record<BookImportField, string>>,
  rowNumber: number,
  refs?: ReferenceValues,
): ValidatedRow {
  const issues: ImportIssue[] = [];
  const err = (code: ImportIssueCode, message: string, field?: BookImportField) =>
    issues.push({ code, severity: "error", message, field });
  const warn = (code: ImportIssueCode, message: string, field?: BookImportField) =>
    issues.push({ code, severity: "warning", message, field });

  // Guard against pathological cell sizes before doing anything else.
  for (const [k, v] of Object.entries(original)) {
    if (typeof v === "string" && v.length > IMPORT_LIMITS.maxFieldLength) {
      err("FIELD_TOO_LONG", `"${k}" is longer than ${IMPORT_LIMITS.maxFieldLength} characters.`, k as BookImportField);
    }
  }

  const title = tidy(original.title);
  if (!title) err("REQUIRED_TITLE", "Title is required.", "title");
  else if (title.length > FIELD_MAX.title) err("FIELD_TOO_LONG", `Title must be at most ${FIELD_MAX.title} characters.`, "title");

  const author = tidy(original.author);
  if (!author) err("REQUIRED_AUTHOR", "Author is required.", "author");
  else if (author.length > FIELD_MAX.author) err("FIELD_TOO_LONG", `Author must be at most ${FIELD_MAX.author} characters.`, "author");

  const isbnRes = validateIsbn(original.isbn ?? null);
  if (!isbnRes.ok) err("INVALID_ISBN", isbnRes.error, "isbn");

  const yearRes = validatePublicationYear(original.year?.trim() || null);
  if (!yearRes.ok) err("INVALID_YEAR", yearRes.error, "year");

  const lang = normalizeLanguage(original.language);
  if (!lang.known) {
    warn("UNKNOWN_LANGUAGE", `Language "${tidy(original.language)}" is not recognized — it will be imported as "other".`, "language");
  }

  const simpleField = (
    field: "publisher" | "category" | "department" | "shelf_location" | "accession_number",
  ): string | null => {
    const v = tidy(original[field]);
    if (!v) return null;
    if (v.length > FIELD_MAX[field]) {
      err("FIELD_TOO_LONG", `${field.replace(/_/g, " ")} must be at most ${FIELD_MAX[field]} characters.`, field);
      return v.slice(0, FIELD_MAX[field]);
    }
    return v;
  };

  const publisher = simpleField("publisher");
  const category = simpleField("category");
  const department = simpleField("department");
  const shelf = simpleField("shelf_location");
  const accession = simpleField("accession_number");

  if (refs && category && !refs.categories.some((c) => c.toLowerCase() === category.toLowerCase())) {
    warn("NEW_CATEGORY", `"${category}" is a new category value (not used by any existing book).`, "category");
  }
  if (refs && department && !refs.departments.some((d) => d.toLowerCase() === department.toLowerCase())) {
    warn("NEW_DEPARTMENT", `"${department}" is a new department value.`, "department");
  }

  const description = tidyMultiline(original.description) || null;
  if (description && description.length > FIELD_MAX.description) {
    err("FIELD_TOO_LONG", `Description must be at most ${FIELD_MAX.description} characters.`, "description");
  }

  const barcodeRes = validateBarcode(original.barcode ?? null);
  if (!barcodeRes.ok) err("INVALID_BARCODE", barcodeRes.error, "barcode");

  const copiesRes = parseCopiesTotal(original.copies_total);
  if (!copiesRes.ok) err("INVALID_COPIES_TOTAL", copiesRes.error, "copies_total");

  const cover = analyzeCoverUrl(original.cover_url);
  if (cover.status === "invalid" || cover.status === "insecure") {
    warn("INVALID_COVER_URL", cover.note ?? "Cover URL is invalid.", "cover_url");
  }

  const keywords = normalizeKeywords(original.keywords);
  if (keywords.length > IMPORT_LIMITS.maxKeywords) {
    warn("TOO_MANY_KEYWORDS", `Only the first ${IMPORT_LIMITS.maxKeywords} keywords are kept.`, "keywords");
    keywords.length = IMPORT_LIMITS.maxKeywords;
  }

  const normalized: NormalizedRow = {
    title,
    author,
    isbn: isbnRes.ok ? isbnRes.normalized : null,
    publisher,
    year: yearRes.ok ? yearRes.year : null,
    language: lang.value,
    category,
    department,
    shelf_location: shelf,
    copies_total: copiesRes.ok ? copiesRes.value : null,
    description,
    accession_number: accession,
    barcode: barcodeRes.ok ? barcodeRes.barcode : null,
    cover_url: cover.url,
    cover_status: cover.status,
    keywords,
  };

  return { rowNumber, original, normalized, issues, status: rowStatus(issues) };
}

export function rowStatus(issues: ImportIssue[], isDuplicate = false): RowStatus {
  if (issues.some((i) => i.severity === "error")) return "error";
  if (isDuplicate) return "duplicate";
  if (issues.length > 0) return "warning";
  return "ready";
}

/** Re-derive status after issues/duplicate info were merged in. */
export function refreshRowStatus(row: ValidatedRow): ValidatedRow {
  return { ...row, status: rowStatus(row.issues, !!row.duplicateMatch) };
}

// ── In-file duplicate detection (barcodes / accessions across rows) ──────────

export function markInFileDuplicates(rows: ValidatedRow[]): ValidatedRow[] {
  const seenBarcode = new Map<string, number>();
  const seenAccession = new Map<string, number>();
  return rows.map((row) => {
    const issues = [...row.issues];
    const b = row.normalized.barcode;
    if (b) {
      const first = seenBarcode.get(b);
      if (first !== undefined) {
        issues.push({
          code: "DUPLICATE_BARCODE_IN_FILE", severity: "error", field: "barcode",
          message: `Barcode "${b}" already appears in row ${first} of this file. Every copy needs its own barcode.`,
        });
      } else {
        seenBarcode.set(b, row.rowNumber);
      }
    }
    const a = row.normalized.accession_number;
    if (a) {
      const first = seenAccession.get(a);
      if (first !== undefined) {
        issues.push({
          code: "DUPLICATE_ACCESSION_IN_FILE", severity: "error", field: "accession_number",
          message: `Accession number "${a}" already appears in row ${first} of this file.`,
        });
      } else {
        seenAccession.set(a, row.rowNumber);
      }
    }
    return refreshRowStatus({ ...row, issues });
  });
}

// ── Grouping rows into books + copies ─────────────────────────────────────────

export function groupKey(n: Pick<NormalizedRow, "title" | "author" | "isbn">): string {
  return `${n.isbn ?? ""}|${n.title.toLowerCase()}|${n.author.toLowerCase()}`;
}

export type ImportCopyPlan = {
  barcode: string | null;
  accession_number: string | null;
  shelf_location: string | null;
  fromRow: number | null;
};

export type ImportGroup = {
  key: string;
  rowNumbers: number[];
  /** The book record fields, taken from the first row of the group. */
  book: NormalizedRow;
  copies: ImportCopyPlan[];
  duplicateMatch?: DuplicateMatch;
};

export type GroupingOptions = {
  /** Create one copy for rows that specify neither barcode nor copies_total. */
  defaultOneCopy: boolean;
};

/**
 * Group importable rows (errors and admin-skipped rows excluded) into book
 * groups with a concrete copy plan. Adds COPIES_BARCODE_MISMATCH warnings to
 * the returned row list when copies_total disagrees with barcoded rows.
 */
export function buildImportGroups(
  rows: ValidatedRow[],
  options: GroupingOptions,
): { groups: ImportGroup[]; rows: ValidatedRow[] } {
  const groups = new Map<string, ImportGroup>();
  const outRows = rows.map((r) => ({ ...r, issues: [...r.issues] }));

  for (const row of outRows) {
    if (row.status === "error" || row.skipped) continue;
    const key = groupKey(row.normalized);
    let g = groups.get(key);
    if (!g) {
      g = { key, rowNumbers: [], book: row.normalized, copies: [], duplicateMatch: row.duplicateMatch };
      groups.set(key, g);
    }
    g.rowNumbers.push(row.rowNumber);
    if (!g.duplicateMatch && row.duplicateMatch) g.duplicateMatch = row.duplicateMatch;

    if (row.normalized.barcode || row.normalized.accession_number) {
      g.copies.push({
        barcode: row.normalized.barcode,
        accession_number: row.normalized.accession_number,
        shelf_location: row.normalized.shelf_location,
        fromRow: row.rowNumber,
      });
    }
  }

  for (const g of groups.values()) {
    const barcoded = g.copies.length;
    // copies_total is a per-book number; take the max across the group's rows.
    const requested = Math.max(
      0,
      ...g.rowNumbers.map((rn) => outRows.find((r) => r.rowNumber === rn)?.normalized.copies_total ?? 0),
    );

    // Note: requested < barcoded is normal for multi-row imports (each row is
    // one copy and carries copies_total=1) — the barcoded count simply wins.
    if (requested > barcoded) {
      const extra = Math.min(requested, IMPORT_LIMITS.maxCopiesPerBook) - barcoded;
      if (barcoded > 0) {
        warnGroup(outRows, g, `${extra} additional cop${extra === 1 ? "y" : "ies"} will be created without a barcode (copies_total ${requested} > ${barcoded} barcoded row${barcoded === 1 ? "" : "s"}). Add barcodes later from the Copies panel.`);
      }
      for (let i = 0; i < extra; i++) {
        g.copies.push({ barcode: null, accession_number: null, shelf_location: g.book.shelf_location, fromRow: null });
      }
    }

    if (g.copies.length === 0 && options.defaultOneCopy && requested === 0 && !rowRequestedZero(outRows, g)) {
      g.copies.push({ barcode: null, accession_number: null, shelf_location: g.book.shelf_location, fromRow: null });
    }
  }

  return { groups: [...groups.values()], rows: outRows };
}

function rowRequestedZero(rows: ValidatedRow[], g: ImportGroup): boolean {
  return g.rowNumbers.some((rn) => rows.find((r) => r.rowNumber === rn)?.normalized.copies_total === 0);
}

function warnGroup(rows: ValidatedRow[], g: ImportGroup, message: string) {
  const first = rows.find((r) => r.rowNumber === g.rowNumbers[0]);
  if (first && !first.issues.some((i) => i.code === "COPIES_BARCODE_MISMATCH" && i.message === message)) {
    first.issues.push({ code: "COPIES_BARCODE_MISMATCH", severity: "warning", field: "copies_total", message });
    Object.assign(first, refreshRowStatus(first));
  }
}

// ── Import options & summary ──────────────────────────────────────────────────

export type DuplicateStrategy = "skip" | "update" | "create";

export type ImportOptions = {
  duplicateStrategy: DuplicateStrategy;
  /** Include rows that only carry warnings. */
  includeWarnings: boolean;
  /** Create one copy for rows without barcode / copies_total. */
  defaultOneCopy: boolean;
  /** Treat new category/department values as errors instead of warnings. */
  strictReferenceValues: boolean;
};

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  duplicateStrategy: "skip",
  includeWarnings: true,
  defaultOneCopy: true,
  strictReferenceValues: false,
};

export type ValidationSummary = {
  total: number;
  ready: number;
  warnings: number;
  errors: number;
  duplicates: number;
  skipped: number;
  newCategories: string[];
  newDepartments: string[];
  driveLinksConverted: number;
  books: number;
  copies: number;
};

export function summarizeValidation(rows: ValidatedRow[], groups: ImportGroup[]): ValidationSummary {
  const s: ValidationSummary = {
    total: rows.length, ready: 0, warnings: 0, errors: 0, duplicates: 0, skipped: 0,
    newCategories: [], newDepartments: [], driveLinksConverted: 0,
    books: groups.length, copies: groups.reduce((n, g) => n + g.copies.length, 0),
  };
  const cats = new Set<string>();
  const depts = new Set<string>();
  for (const r of rows) {
    if (r.skipped) { s.skipped++; continue; }
    if (r.status === "ready") s.ready++;
    else if (r.status === "warning") s.warnings++;
    else if (r.status === "error") s.errors++;
    else s.duplicates++;
    if (r.normalized.cover_status === "converted") s.driveLinksConverted++;
    for (const i of r.issues) {
      if (i.code === "NEW_CATEGORY" && r.normalized.category) cats.add(r.normalized.category);
      if (i.code === "NEW_DEPARTMENT" && r.normalized.department) depts.add(r.normalized.department);
    }
  }
  s.newCategories = [...cats].sort();
  s.newDepartments = [...depts].sort();
  return s;
}

// ── Per-row import results & reports ──────────────────────────────────────────

export type RowResultStatus = "created" | "updated" | "copies_added" | "skipped_duplicate" | "excluded" | "failed";

export type ImportRowResult = {
  rowNumber: number;
  status: RowResultStatus;
  bookId?: string;
  bookSlug?: string;
  copiesCreated?: number;
  message?: string;
};

export function buildFailedRowsCsv(
  rows: ValidatedRow[],
  results: Map<number, ImportRowResult>,
): string {
  const failed = rows.filter((r) => {
    const res = results.get(r.rowNumber);
    return r.status === "error" || res?.status === "failed";
  });
  const header = [...IMPORT_FIELDS, "import_status", "error_codes", "error_messages"] as const;
  const lines = [header.map((h) => escapeCsvCell(h)).join(",")];
  for (const r of failed) {
    const res = results.get(r.rowNumber);
    const errs = r.issues.filter((i) => i.severity === "error");
    const codes = [...errs.map((i) => i.code), ...(res?.status === "failed" ? ["SERVER_VALIDATION_ERROR"] : [])];
    const msgs = [...errs.map((i) => i.message), ...(res?.status === "failed" && res.message ? [res.message] : [])];
    lines.push([
      ...IMPORT_FIELDS.map((f) => escapeCsvCell(r.original[f] ?? "")),
      escapeCsvCell(res?.status ?? r.status),
      escapeCsvCell(codes.join("; ")),
      escapeCsvCell(msgs.join("; ")),
    ].join(","));
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

export function buildImportReportCsv(
  rows: ValidatedRow[],
  results: Map<number, ImportRowResult>,
): string {
  const header = ["row", "title", "author", "isbn", "status", "book_id", "copies_created", "issues", "message"];
  const lines = [header.map((h) => escapeCsvCell(h)).join(",")];
  for (const r of rows) {
    const res = results.get(r.rowNumber);
    lines.push([
      escapeCsvCell(r.rowNumber),
      escapeCsvCell(r.normalized.title || r.original.title || ""),
      escapeCsvCell(r.normalized.author || r.original.author || ""),
      escapeCsvCell(r.normalized.isbn ?? ""),
      escapeCsvCell(res?.status ?? (r.skipped ? "excluded" : r.status)),
      escapeCsvCell(res?.bookId ?? ""),
      escapeCsvCell(res?.copiesCreated ?? ""),
      escapeCsvCell(r.issues.map((i) => `${i.code}: ${i.message}`).join("; ")),
      escapeCsvCell(res?.message ?? ""),
    ].join(","));
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

// ── Misc helpers used by the wizard ───────────────────────────────────────────

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export const DELIMITER_LABEL: Record<string, string> = {
  ",": "Comma", ";": "Semicolon", "\t": "Tab",
};

/** Chunk book groups into batches of ≤ batchRows source rows each. */
export function chunkGroups(groups: ImportGroup[], batchRows: number = IMPORT_LIMITS.batchRows): ImportGroup[][] {
  const batches: ImportGroup[][] = [];
  let current: ImportGroup[] = [];
  let rows = 0;
  for (const g of groups) {
    const size = Math.max(1, g.rowNumbers.length);
    if (current.length > 0 && rows + size > batchRows) {
      batches.push(current);
      current = [];
      rows = 0;
    }
    current.push(g);
    rows += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
