// lib/catalog.ts
import Papa from "papaparse";
// ── Types & helpers for the physical-book catalogue ──────────────────────────

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

// ── Availability helpers ───────────────────────────────────────────────────────

export type AvailabilityStatus = "available" | "limited" | "unavailable";

export function getAvailability(book: Pick<CatalogBook, "copies_available" | "copies_total">): AvailabilityStatus {
  if (book.copies_available === 0)                                    return "unavailable";
  if (book.copies_available <= Math.ceil(book.copies_total * 0.25))  return "limited";
  return "available";
}

export const AVAILABILITY_LABEL: Record<AvailabilityStatus, string> = {
  available:   "Available",
  limited:     "Limited",
  unavailable: "Unavailable",
};

export const AVAILABILITY_COLOR: Record<AvailabilityStatus, string> = {
  available:   "text-emerald-600 dark:text-emerald-400",
  limited:     "text-amber-500 dark:text-amber-400",
  unavailable: "text-red-500 dark:text-red-400",
};

export const AVAILABILITY_BG: Record<AvailabilityStatus, string> = {
  available:   "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800",
  limited:     "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800",
  unavailable: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800",
};

export const AVAILABILITY_DOT: Record<AvailabilityStatus, string> = {
  available:   "bg-emerald-500",
  limited:     "bg-amber-400",
  unavailable: "bg-red-500",
};

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
  cover_url?:        string;  // ✅ fix: was typed as literal `null`; now optional string
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