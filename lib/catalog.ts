// lib/catalog.ts
import Papa from "papaparse";
// ── Types & helpers for the physical-book catalogue ──────────────────────────
//
// This file is the single source of truth for the catalog domain:
//   • copy statuses (labels, tones, borrowability, public visibility)
//   • availability calculation (always derived from copy rows, never stored)
//   • field validation (ISBN, year, barcode, call number)
//   • barcode / accession sequence generation for bulk-add
//
// `copies_total` / `copies_available` on catalog_books are DERIVED columns —
// kept in sync by recountCatalogBook() in copy-actions and (after migration
// 0095) a DB trigger. Nothing may write them from a form.

export type CatalogBook = {
  id:               string;
  title:            string;
  slug:             string;
  author:           string;
  description:      string | null;
  cover_url:        string | null;
  isbn:             string | null;
  publisher:        string | null;
  year:             number | null;
  language:         string;
  category:         string | null;
  department:       string | null;
  shelf_location:   string | null;
  copies_total:     number;
  copies_available: number;
  accession_number: string | null;
  cover_color:      string;
  is_active:        boolean;
  created_at:       string;
  updated_at:       string;
  keywords:         string[];
};

export type CopiesLogEntry = {
  id:              string;
  catalog_book_id: string;
  admin_id:        string;
  action:          "check_in" | "check_out" | "adjustment";
  delta:           number;
  note:            string | null;
  created_at:      string;
};

// ── Copy statuses ─────────────────────────────────────────────────────────────

export const COPY_STATUS_VALUES = [
  "available",
  "on_loan",
  "reserved",
  "reference_only",
  "processing",
  "in_repair",
  "damaged",
  "lost",
  "missing",
  "withdrawn",
] as const;

export type CopyStatus = (typeof COPY_STATUS_VALUES)[number];

/** Old stored values still readable from pre-0095 rows. */
const LEGACY_STATUS_MAP: Record<string, CopyStatus> = {
  checked_out: "on_loan",
  on_order:    "processing",
};

export function normalizeCopyStatus(raw: string | null | undefined): CopyStatus {
  if (!raw) return "available"; // historical column default
  if ((COPY_STATUS_VALUES as readonly string[]).includes(raw)) return raw as CopyStatus;
  return LEGACY_STATUS_MAP[raw] ?? "processing"; // unknown ⇒ not borrowable, not alarming
}

type Tone = "positive" | "warning" | "danger" | "info" | "neutral";

export type CopyStatusMeta = {
  /** Staff-facing label (admin UI is English). */
  label: string;
  /** Reader-facing label key inside the `catalogs.copyStatus` i18n namespace. */
  publicKey: string;
  tone: Tone;
  /** Counts toward "available to borrow". */
  borrowable: boolean;
  /** Usable inside the library but not borrowable. */
  referenceOnly?: boolean;
  /** Withdrawn copies are excluded from public pages and from totals. */
  retired?: boolean;
};

export const COPY_STATUS: Record<CopyStatus, CopyStatusMeta> = {
  available:      { label: "Available",       publicKey: "available",     tone: "positive", borrowable: true },
  on_loan:        { label: "On Loan",         publicKey: "onLoan",        tone: "warning",  borrowable: false },
  reserved:       { label: "Reserved",        publicKey: "reserved",      tone: "warning",  borrowable: false },
  reference_only: { label: "Reference Only",  publicKey: "referenceOnly", tone: "info",     borrowable: false, referenceOnly: true },
  processing:     { label: "Processing",      publicKey: "processing",    tone: "info",     borrowable: false },
  in_repair:      { label: "In Repair",       publicKey: "inRepair",      tone: "warning",  borrowable: false },
  damaged:        { label: "Damaged",         publicKey: "unavailable",   tone: "danger",   borrowable: false },
  lost:           { label: "Lost",            publicKey: "unavailable",   tone: "danger",   borrowable: false },
  missing:        { label: "Missing",         publicKey: "unavailable",   tone: "danger",   borrowable: false },
  withdrawn:      { label: "Withdrawn",       publicKey: "unavailable",   tone: "neutral",  borrowable: false, retired: true },
};

/** Statuses librarians can pick when adding/editing a copy (withdrawn is set via Archive). */
export const COPY_STATUS_OPTIONS: { value: CopyStatus; label: string }[] =
  COPY_STATUS_VALUES.filter((s) => s !== "withdrawn").map((s) => ({ value: s, label: COPY_STATUS[s].label }));

/** Tailwind classes per tone — one place so every badge looks the same. */
export const TONE_BADGE: Record<Tone, string> = {
  positive: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-500/25 dark:text-emerald-400",
  warning:  "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-500/10 dark:border-amber-500/25 dark:text-amber-400",
  danger:   "bg-red-50 border-red-200 text-red-600 dark:bg-red-500/10 dark:border-red-500/25 dark:text-red-400",
  info:     "bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-500/10 dark:border-sky-500/25 dark:text-sky-400",
  neutral:  "bg-paper border-divider text-text-muted",
};

export const TONE_DOT: Record<Tone, string> = {
  positive: "bg-emerald-500",
  warning:  "bg-amber-400",
  danger:   "bg-red-500",
  info:     "bg-sky-500",
  neutral:  "bg-slate-400",
};

export function copyStatusBadgeClass(status: CopyStatus): string {
  return TONE_BADGE[COPY_STATUS[status].tone];
}
export function copyStatusDotClass(status: CopyStatus): string {
  return TONE_DOT[COPY_STATUS[status].tone];
}

// ── Availability (always computed from copy rows) ─────────────────────────────

export type CopyStatusRow = { status: string | null; };

export type CopyStats = {
  /** Copies that exist for readers (withdrawn excluded). */
  total: number;
  available: number;
  onLoan: number;
  reserved: number;
  referenceOnly: number;
  processing: number;
  /** damaged + lost + missing + in_repair */
  unavailable: number;
};

export function computeCopyStats(copies: CopyStatusRow[] | null | undefined): CopyStats {
  const stats: CopyStats = { total: 0, available: 0, onLoan: 0, reserved: 0, referenceOnly: 0, processing: 0, unavailable: 0 };
  for (const c of copies ?? []) {
    const s = normalizeCopyStatus(c.status);
    if (COPY_STATUS[s].retired) continue;
    stats.total += 1;
    switch (s) {
      case "available":      stats.available += 1;      break;
      case "on_loan":        stats.onLoan += 1;         break;
      case "reserved":       stats.reserved += 1;       break;
      case "reference_only": stats.referenceOnly += 1;  break;
      case "processing":     stats.processing += 1;     break;
      default:               stats.unavailable += 1;    break;
    }
  }
  return stats;
}

/**
 * Reader-level summary for a whole record. Priority: something borrowable →
 * in-library use → on loan/reserved → processing → unavailable. `no_copies`
 * means the record has no (non-withdrawn) copy rows at all.
 */
export type CatalogAvailability =
  | "available"
  | "reference_only"
  | "on_loan"
  | "processing"
  | "unavailable"
  | "no_copies";

export function getCatalogAvailability(stats: CopyStats): CatalogAvailability {
  if (stats.total === 0)                       return "no_copies";
  if (stats.available > 0)                     return "available";
  if (stats.referenceOnly > 0)                 return "reference_only";
  if (stats.onLoan > 0 || stats.reserved > 0)  return "on_loan";
  if (stats.processing > 0)                    return "processing";
  return "unavailable";
}

/**
 * Fallback when copy rows are not loaded (e.g. legacy callers): derive stats
 * from the denormalised book counters.
 */
export function statsFromCounters(book: Pick<CatalogBook, "copies_total" | "copies_available">): CopyStats {
  const total = Math.max(0, book.copies_total ?? 0);
  const available = Math.min(total, Math.max(0, book.copies_available ?? 0));
  return { total, available, onLoan: total - available, reserved: 0, referenceOnly: 0, processing: 0, unavailable: 0 };
}

/** i18n keys inside `catalogs.avail.*` — reader-friendly, never "Limited". */
export const AVAILABILITY_KEY: Record<CatalogAvailability, string> = {
  available:      "available",
  reference_only: "referenceOnly",
  on_loan:        "onLoan",
  processing:     "processing",
  unavailable:    "unavailable",
  no_copies:      "noCopies",
};

export const AVAILABILITY_TONE: Record<CatalogAvailability, Tone> = {
  available:      "positive",
  reference_only: "info",
  on_loan:        "warning",
  processing:     "info",
  unavailable:    "danger",
  no_copies:      "neutral",
};

/** Staff-facing English labels (admin panel). */
export const AVAILABILITY_ADMIN_LABEL: Record<CatalogAvailability, string> = {
  available:      "Available",
  reference_only: "Reference only",
  on_loan:        "All on loan",
  processing:     "Processing",
  unavailable:    "Unavailable",
  no_copies:      "No copies",
};

// ── Validation ────────────────────────────────────────────────────────────────

export const YEAR_MIN = 1400;
export function yearMax(now = new Date()): number {
  return now.getFullYear() + 1; // allow forthcoming titles
}

export function validatePublicationYear(value: unknown): { ok: true; year: number | null } | { ok: false; error: string } {
  if (value === null || value === undefined || value === "") return { ok: true, year: null };
  const n = Number(value);
  if (!Number.isInteger(n)) return { ok: false, error: "Publication year must be a whole number." };
  if (n < YEAR_MIN || n > yearMax()) {
    return { ok: false, error: `Publication year must be between ${YEAR_MIN} and ${yearMax()}.` };
  }
  return { ok: true, year: n };
}

/** Strip spaces/hyphens; uppercase the ISBN-10 check digit X. */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}

export function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(isbn[i]);
  sum += isbn[9] === "X" ? 10 : Number(isbn[9]);
  return sum % 11 === 0;
}

export function isValidIsbn13(isbn: string): boolean {
  if (!/^\d{13}$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(isbn[12]);
}

export type IsbnResult =
  | { ok: true; normalized: string | null; kind: "isbn10" | "isbn13" | null }
  | { ok: false; error: string };

export function validateIsbn(raw: string | null | undefined): IsbnResult {
  const trimmed = raw?.trim();
  if (!trimmed) return { ok: true, normalized: null, kind: null };
  const n = normalizeIsbn(trimmed);
  if (n.length === 10) {
    return isValidIsbn10(n)
      ? { ok: true, normalized: n, kind: "isbn10" }
      : { ok: false, error: "Invalid ISBN-10 — the checksum does not match. Check for typos." };
  }
  if (n.length === 13) {
    return isValidIsbn13(n)
      ? { ok: true, normalized: n, kind: "isbn13" }
      : { ok: false, error: "Invalid ISBN-13 — the checksum does not match. Check for typos." };
  }
  return { ok: false, error: "An ISBN must have 10 or 13 digits (hyphens and spaces are ignored)." };
}

/** Display form: hyphenate ISBN-13 loosely (978-x-xxxx-xxxx-x is registrant-dependent; keep simple prefix split). */
export function formatIsbn(normalized: string | null): string | null {
  if (!normalized) return null;
  if (normalized.length === 13) return `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
  return normalized;
}

const BARCODE_RE = /^[A-Za-z0-9][A-Za-z0-9._\-\/]{0,31}$/;

export function validateBarcode(raw: string | null | undefined): { ok: true; barcode: string | null } | { ok: false; error: string } {
  const b = raw?.trim().replace(/\s+/g, "");
  if (!b) return { ok: true, barcode: null };
  if (!BARCODE_RE.test(b)) {
    return { ok: false, error: "Barcodes may use letters, digits, dots, dashes, slashes or underscores (max 32 characters)." };
  }
  return { ok: true, barcode: b };
}

const MAX_TEXT: Record<string, number> = {
  title: 300, author: 200, publisher: 200, category: 100, department: 100,
  shelf_location: 60, call_number: 80, accession_number: 60, description: 5000,
  notes: 500, holding_library: 120, condition: 60, edition: 60,
};

export function cleanText(raw: FormDataEntryValue | null, field: keyof typeof MAX_TEXT): { ok: true; value: string | null } | { ok: false; error: string } {
  const v = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!v) return { ok: true, value: null };
  const max = MAX_TEXT[field];
  if (v.length > max) return { ok: false, error: `${String(field).replace(/_/g, " ")} must be at most ${max} characters.` };
  return { ok: true, value: v };
}

/** Multi-line variant (descriptions keep paragraph breaks). */
export function cleanLongText(raw: FormDataEntryValue | null, field: keyof typeof MAX_TEXT): { ok: true; value: string | null } | { ok: false; error: string } {
  const v = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (!v) return { ok: true, value: null };
  const max = MAX_TEXT[field];
  if (v.length > max) return { ok: false, error: `${String(field).replace(/_/g, " ")} must be at most ${max} characters.` };
  return { ok: true, value: v };
}

// ── Bulk-add sequence generation ──────────────────────────────────────────────

/**
 * "PTEC-", 1250, i=1 → "PTEC-001251". The pad length follows the start
 * number's digits (min 4) so sequences sort naturally on shelves and labels.
 */
export function sequenceValue(prefix: string, start: number, offset: number, pad?: number): string {
  const n = start + offset;
  const width = Math.max(pad ?? String(start).length, 4);
  return `${prefix}${String(n).padStart(width, "0")}`;
}

export type BulkCopySpec = {
  count: number;
  barcodePrefix?: string;
  barcodeStart?: number | null;
  accessionPrefix?: string;
  accessionStart?: number | null;
  callNumberBase?: string | null;
  shelfLocation?: string | null;
  holdingLibrary?: string | null;
  status?: CopyStatus;
  condition?: string | null;
  notes?: string | null;
  /** First copy number to assign (1-based; pass existingCount + 1). */
  copyNumberStart?: number;
};

export type GeneratedCopy = {
  copy_number: number;
  barcode: string | null;
  accession_number: string | null;
  call_number: string | null;
  shelf_location: string | null;
  holding_library: string;
  status: CopyStatus;
  condition: string | null;
  notes: string | null;
};

export const DEFAULT_HOLDING_LIBRARY = "PTEC Library";

/** Deterministic generation shared by the client preview and the server action. */
export function generateCopies(spec: BulkCopySpec): GeneratedCopy[] {
  const count = Math.min(Math.max(1, Math.floor(spec.count)), 100);
  const startNo = Math.max(1, spec.copyNumberStart ?? 1);
  const rows: GeneratedCopy[] = [];
  for (let i = 0; i < count; i++) {
    const copyNo = startNo + i;
    const barcode = spec.barcodeStart != null && spec.barcodeStart >= 0
      ? sequenceValue(spec.barcodePrefix ?? "", spec.barcodeStart, i)
      : null;
    const accession = spec.accessionStart != null && spec.accessionStart >= 0
      ? sequenceValue(spec.accessionPrefix ?? "", spec.accessionStart, i)
      : null;
    const call = spec.callNumberBase?.trim()
      ? `${spec.callNumberBase.trim()} C.${copyNo}`
      : null;
    rows.push({
      copy_number: copyNo,
      barcode,
      accession_number: accession,
      call_number: call,
      shelf_location: spec.shelfLocation?.trim() || null,
      holding_library: spec.holdingLibrary?.trim() || DEFAULT_HOLDING_LIBRARY,
      status: spec.status ?? "available",
      condition: spec.condition?.trim() || null,
      notes: spec.notes?.trim() || null,
    });
  }
  return rows;
}

/** Duplicate values inside one submission (before hitting the DB). */
export function findInternalDuplicates(values: (string | null)[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    if (seen.has(v)) dupes.add(v);
    seen.add(v);
  }
  return [...dupes];
}

// ── Slug helper ───────────────────────────────────────────────────────────────

export function catalogSlugify(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

// ── Cover colors (consistent with E-Resources) ───────────────────────────────

const COVER_COLORS = [
  "bg-[#0f766e]", "bg-[#2563eb]", "bg-[#7c3aed]", "bg-[#16a34a]",
  "bg-[#db2777]", "bg-[#0891b2]", "bg-[#ca8a04]", "bg-[#ea580c]",
  "bg-[#dc2626]", "bg-[#4f46e5]",
];

export function pickCatalogColor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COVER_COLORS[Math.abs(hash) % COVER_COLORS.length];
}

// ── CSV parse helper (client-side) ───────────────────────────────────────────

export type CsvCatalogRow = {
  title:             string;
  author:            string;
  isbn?:             string;
  publisher?:        string;
  year?:             string;
  language?:         string;
  category?:         string;
  department?:       string;
  shelf_location?:   string;
  copies_total?:     string;
  description?:      string;
  accession_number?: string;
  barcode?:          string;
  cover_url?:        string;
  keywords?:         string;
};

export function parseCatalogCsv(text: string): CsvCatalogRow[] {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
    transform: (v) => v.trim()
  });
  return parsed.data.filter((r) => r.title && r.author) as CsvCatalogRow[];
}
