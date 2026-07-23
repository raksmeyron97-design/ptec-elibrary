import "server-only";

// Server half of the metadata exports (roadmap Task 4): fetches and gates
// the rows that lib/exports/scholarly.ts formats.
//
// Gating — the authoritative-feed contract (docs/METADATA-EXPORTS.md):
//   books/theses:  is_published AND verified_at IS NOT NULL. Unverified
//                  records never appear in exports (they can still be cited
//                  from their landing page, which carries an "unverified"
//                  notice).
//   publications:  is_published only — the publication authoring workspace
//                  has its own mandatory review flow (publication_reviews),
//                  so a published publication has by definition been
//                  reviewed; the table has no verified_at column.
//
// Unlike OAI (whose harvest implies redistribution rights, hence its
// license allow-list), these exports carry *metadata only* — the same facts
// the public landing pages already serve — so license does not gate
// inclusion; it is exported as dc:rights for the consumer to evaluate.

import { createServiceClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/seo/site";
import {
  academicTextToPlainText,
  normalizePublicationReferences,
} from "@/lib/publications/citations";
import type { ScholarlyWork, ScholarlyWorkType } from "@/lib/exports/scholarly";
import { getOrgIdentity } from "@/lib/system-settings/config";

export const EXPORT_TYPES: Record<string, ScholarlyWorkType> = {
  books: "book",
  theses: "thesis",
  publications: "publication",
};

// Row mappers are pure and synchronous, so they leave `institution` null; the
// fetchers below stamp the PUBLISHED institution name onto every work. Keeping
// it out of the mappers is what stops a compiled-in name from leaking into
// BibTeX/RIS/CSV/Dublin-Core exports.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function yearFrom(...candidates: (string | null | undefined)[]): string | null {
  for (const c of candidates) {
    const match = typeof c === "string" ? c.match(/\b(1[89]|20)\d{2}\b/) : null;
    if (match) return match[0];
  }
  return null;
}

function dateFrom(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

const BOOK_SELECT = `id, slug, title, description, language, published_at, created_at, tags, license,
  isbn, pages, verified_at, authors(name), categories(name), departments(name)`;

function mapBook(row: Row): ScholarlyWork {
  const author = (Array.isArray(row.authors) ? row.authors[0]?.name : row.authors?.name)?.trim();
  return {
    type: "book",
    slug: row.slug,
    title: row.title,
    creators: author ? [author] : [],
    contributors: [],
    institution: null,
    department: row.departments?.name ?? null,
    program: null,
    date: dateFrom(row.published_at),
    year: yearFrom(row.published_at),
    language: row.language ?? null,
    abstract: row.description ?? null,
    keywords: [...new Set([row.categories?.name, ...strArray(row.tags)].filter(Boolean))] as string[],
    landingUrl: `${SITE_URL}/books/${row.slug}`,
    fileUrl: `${SITE_URL}/api/books/${row.slug}/download`,
    format: "application/pdf",
    doi: null,
    isbn: row.isbn ?? null,
    rights: row.license ?? null,
    journal: null,
    volume: null,
    issue: null,
    pageStart: null,
    pageEnd: null,
    modified: row.created_at ?? null,
    verifiedAt: row.verified_at ?? null,
  };
}

const THESIS_SELECT = `id, slug, title, abstract, author_names, advisor_name, language, subject,
  keywords, published_at, created_at, updated_at, license, doi, academic_year, program, faculty,
  file_url, verified_at, departments(name)`;

function splitNames(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[,;]| and | និង /)
    .map((s) => s.trim())
    .filter(Boolean);
}

function mapThesis(row: Row): ScholarlyWork {
  return {
    type: "thesis",
    slug: row.slug,
    title: row.title,
    creators: splitNames(row.author_names),
    contributors: splitNames(row.advisor_name),
    institution: null,
    department: row.departments?.name ?? null,
    program: row.program ?? null,
    date: dateFrom(row.published_at),
    year: yearFrom(row.published_at, row.academic_year),
    language: row.language ?? null,
    abstract: row.abstract ?? null,
    keywords: [...new Set([row.subject, ...strArray(row.keywords)].filter(Boolean))] as string[],
    landingUrl: `${SITE_URL}/theses/${row.slug}`,
    fileUrl: row.file_url ? `${SITE_URL}/api/theses/${row.id}/download` : null,
    format: row.file_url ? "application/pdf" : null,
    doi: row.doi ?? null,
    isbn: null,
    rights: row.license ?? null,
    journal: null,
    volume: null,
    issue: null,
    pageStart: null,
    pageEnd: null,
    modified: row.updated_at ?? row.created_at ?? null,
    verifiedAt: row.verified_at ?? null,
  };
}

const PUBLICATION_SELECT = `id, slug, title, abstract, references, language, publication_date,
  published_at, created_at, updated_at, license, keywords, subjects, article_type, journal_name,
  volume, issue_no, page_start, page_end, doi, pdf_url,
  publication_authorships(author_order, publication_authors(full_name))`;

function publicationCreators(row: Row): string[] {
  const authorships = Array.isArray(row.publication_authorships) ? row.publication_authorships : [];
  return authorships
    .slice()
    .sort((a: Row, b: Row) => (a.author_order ?? 1) - (b.author_order ?? 1))
    .map((a: Row) => (Array.isArray(a.publication_authors) ? a.publication_authors[0] : a.publication_authors))
    .map((author: Row) => author?.full_name?.trim())
    .filter(Boolean);
}

function mapPublication(row: Row): ScholarlyWork {
  return {
    type: "publication",
    slug: row.slug,
    title: row.title,
    creators: publicationCreators(row),
    contributors: [],
    institution: null,
    department: null,
    program: null,
    date: dateFrom(row.publication_date ?? row.published_at),
    year: yearFrom(row.publication_date, row.published_at),
    language: row.language ?? null,
    abstract:
      academicTextToPlainText(row.abstract, normalizePublicationReferences(row.references)) || null,
    keywords: [...new Set([...strArray(row.keywords), ...strArray(row.subjects)])],
    landingUrl: `${SITE_URL}/publications/${row.slug}`,
    fileUrl: row.pdf_url ? `${SITE_URL}/publications/${row.slug}` : null,
    format: row.pdf_url ? "application/pdf" : null,
    doi: row.doi ?? null,
    isbn: null,
    rights: row.license ?? null,
    journal: row.journal_name ?? null,
    volume: row.volume ?? null,
    issue: row.issue_no ?? null,
    pageStart: row.page_start ?? null,
    pageEnd: row.page_end ?? null,
    modified: row.updated_at ?? row.created_at ?? null,
    verifiedAt: row.published_at ?? row.created_at ?? null, // reviewed via publication workspace
  };
}

const TABLE_FOR: Record<ScholarlyWorkType, { table: string; select: string; map: (r: Row) => ScholarlyWork; verifiedColumn: boolean }> = {
  book: { table: "books", select: BOOK_SELECT, map: mapBook, verifiedColumn: true },
  thesis: { table: "research_reports", select: THESIS_SELECT, map: mapThesis, verifiedColumn: true },
  publication: { table: "publications", select: PUBLICATION_SELECT, map: mapPublication, verifiedColumn: false },
};

export interface WorksPage {
  works: ScholarlyWork[];
  total: number;
}

/** Paginated, verified-only export page (deterministic slug ordering). */
export async function fetchExportWorks(
  type: ScholarlyWorkType,
  page: number,
  pageSize: number,
): Promise<WorksPage> {
  const spec = TABLE_FOR[type];
  const db = createServiceClient();
  const from = (page - 1) * pageSize;

  let query = db
    .from(spec.table)
    .select(spec.select, { count: "exact" })
    .eq("is_published", true)
    .order("slug", { ascending: true })
    .range(from, from + pageSize - 1);
  if (spec.verifiedColumn) query = query.not("verified_at", "is", null);

  const [{ data, error, count }, org] = await Promise.all([query, getOrgIdentity()]);
  if (error) throw new Error(`[export] ${spec.table} query failed: ${error.message}`);
  const works = (data ?? []).map(spec.map).map((w) => ({ ...w, institution: org.siteName }));
  return { works, total: count ?? 0 };
}

/** Single verified work by slug; null when absent, unpublished, or unverified. */
export async function fetchExportWork(
  type: ScholarlyWorkType,
  slug: string,
): Promise<ScholarlyWork | null> {
  const spec = TABLE_FOR[type];
  const db = createServiceClient();

  let query = db.from(spec.table).select(spec.select).eq("slug", slug).eq("is_published", true);
  if (spec.verifiedColumn) query = query.not("verified_at", "is", null);

  const [{ data, error }, org] = await Promise.all([query.maybeSingle(), getOrgIdentity()]);
  if (error) throw new Error(`[export] ${spec.table} lookup failed: ${error.message}`);
  return data ? { ...spec.map(data), institution: org.siteName } : null;
}
