// Pure SEO/bibliographic completeness scoring for the admin book editor.
// Browser-safe and unit-tested (lib/admin/book-seo-score.test.ts).
//
// The score measures FACTUAL completeness — whether the record carries the
// bibliographic fields that make a strong, honest search result — NOT keyword
// density. It never rewards stuffing, and it treats an unknown field as
// "missing", never as a reason to invent a value.

import { languageCode } from "@/lib/seo/book-seo";

export type BookSeoFields = {
  title: string;
  summary: string;
  author: string;
  language: string;
  isbn: string;
  publisher: string;
  year: number | null;
  pages: number | null;
  tags: string[];
  coverPresent: boolean;
};

export type SeoCheckStatus = "ok" | "warn" | "missing";

export type SeoCheck = {
  id: string;
  label: string;
  status: SeoCheckStatus;
  hint: string;
  /** Whether this check counts toward the completeness score. */
  weighted: boolean;
};

const MIN_GOOD_DESCRIPTION = 70;

function isKnownAuthor(author: string): boolean {
  const a = author.trim().toLowerCase();
  return !!a && a !== "unknown" && a !== "unknown author";
}

function plausibleYear(year: number | null): boolean {
  if (!year || year <= 0) return false;
  return year >= 1400 && year <= new Date().getFullYear() + 1;
}

export function scoreBookSeo(fields: BookSeoFields): {
  checks: SeoCheck[];
  score: number;
  max: number;
  percent: number;
} {
  const summary = fields.summary.trim();
  const checks: SeoCheck[] = [
    {
      id: "title",
      label: "Title",
      status: fields.title.trim() ? "ok" : "missing",
      hint: "Every book needs a unique, descriptive title.",
      weighted: true,
    },
    {
      id: "description",
      label: "Description",
      status: !summary ? "missing" : summary.length < MIN_GOOD_DESCRIPTION ? "warn" : "ok",
      hint:
        !summary
          ? "Add a factual summary — a branded fallback is used until then."
          : summary.length < MIN_GOOD_DESCRIPTION
            ? "Aim for 120–250 characters of real detail for stronger long-tail results."
            : "Good length for a search snippet.",
      weighted: true,
    },
    {
      id: "cover",
      label: "Cover image",
      status: fields.coverPresent ? "ok" : "missing",
      hint: "Used as the social-sharing (Open Graph) image; a branded default is used otherwise.",
      weighted: true,
    },
    {
      id: "author",
      label: "Author",
      status: isKnownAuthor(fields.author) ? "ok" : "missing",
      hint: "A known author enriches structured data and citations. Leave blank if genuinely unknown — don't guess.",
      weighted: true,
    },
    {
      id: "language",
      label: "Language",
      status: languageCode(fields.language) ? "ok" : fields.language.trim() ? "warn" : "missing",
      hint: "A recognized language (English/Khmer) maps to a machine-readable code in structured data.",
      weighted: true,
    },
    {
      id: "year",
      label: "Publication year",
      status: plausibleYear(fields.year) ? "ok" : "missing",
      hint: "A real publication year. Leave blank rather than inventing one — schema omits unknown dates.",
      weighted: true,
    },
    {
      id: "pages",
      label: "Page count",
      status: fields.pages && fields.pages > 1 ? "ok" : "missing",
      hint: "The real page count (>1). The legacy default of 1 is treated as unknown and omitted from schema.",
      weighted: true,
    },
    {
      id: "isbn",
      label: "ISBN",
      status: fields.isbn.trim() && fields.isbn.trim() !== "N/A" ? "ok" : "warn",
      hint: "Optional but valuable — a valid ISBN strengthens Book structured data.",
      weighted: false,
    },
    {
      id: "publisher",
      label: "Publisher (not PTEC)",
      status: fields.publisher.trim() ? "ok" : "warn",
      hint: "The book's ACTUAL publisher, if known. PTEC is the provider, not the publisher — leave blank when unknown.",
      weighted: false,
    },
    {
      id: "tags",
      label: "Keywords / tags",
      status: fields.tags.filter(Boolean).length > 0 ? "ok" : "warn",
      hint: "A few subject keywords help topical relevance (no stuffing).",
      weighted: false,
    },
  ];

  const weighted = checks.filter((c) => c.weighted);
  const score = weighted.filter((c) => c.status === "ok").length;
  const max = weighted.length;
  const percent = max > 0 ? Math.round((score / max) * 100) : 0;
  return { checks, score, max, percent };
}
