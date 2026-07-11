/* eslint-disable @typescript-eslint/no-explicit-any */
// Pure, browser-safe types + row mapper for Publications (academic journal
// articles). Mirrors lib/theses.ts — no server-only imports so Client
// Components can use it freely. Fetch/mutation logic lives in
// app/actions/publications.ts.

import { normalizePublicationReferences } from "@/lib/publications/citations";

export interface PublicationAuthor {
  id: string;
  full_name: string;
  full_name_km: string | null;
  orcid: string | null;
  email: string | null;
  bio: string | null;
  bio_km: string | null;
  photo_url: string | null;
}

export interface PublicationAffiliation {
  id: string;
  name: string;
  name_km: string | null;
  city: string | null;
  country: string | null;
}

export interface PublicationAuthorship {
  author: PublicationAuthor;
  author_order: number;
  is_corresponding: boolean;
  affiliation_ids: string[];
}

export interface PublicationFile {
  id: string;
  label: string;
  file_url: string;
  file_type: string | null;
  size_bytes: number | null;
  sort_order: number;
}

export interface PublicationReference {
  /** Stable semantic identity; visible numbering is derived from array order. */
  id: string;
  index: number;
  text: string;
  doi?: string;
  url?: string;
}

export interface PublicationTocEntry {
  title: string;
  title_km?: string | null;
  page?: string | null;
}

export interface PublicationFaq {
  question: string;
  answer: string;
}

export type ArticleType = "article" | "review" | "account" | "editorial";

export interface Publication {
  id: string;
  slug: string;
  title: string;
  title_km: string | null;
  article_type: ArticleType;
  journal_name: string | null;
  volume: string | null;
  issue_no: string | null;
  page_start: string | null;
  page_end: string | null;
  article_no: string | null;
  doi: string | null;
  publication_date: string | null;
  abstract: string | null;
  abstract_km: string | null;
  keywords: string[];
  publisher: string | null;
  isbn: string | null;
  subjects: string[];
  table_of_contents: PublicationTocEntry[];
  learning_outcomes: string[];
  faqs: PublicationFaq[];
  license: string | null;
  copyright: string | null;
  language: string;
  cover_url: string | null;
  pdf_url: string | null;
  references: PublicationReference[];
  is_published: boolean;
  published_at: string | null;
  view_count: number;
  download_count: number;
  created_at: string;
  /** Comma-joined byline. From the view's aggregate, or derived from embedded authorships. */
  author_names: string | null;
  /** Present only when the query embedded publication_authorships. */
  authorships?: PublicationAuthorship[];
  /** Present only when the query embedded publication_files. */
  files?: PublicationFile[];
}

function mapAuthorship(row: any): PublicationAuthorship {
  const a = row.publication_authors ?? row.author ?? {};
  return {
    author: {
      id: a.id,
      full_name: a.full_name ?? "",
      full_name_km: a.full_name_km ?? null,
      orcid: a.orcid ?? null,
      email: a.email ?? null,
      bio: a.bio ?? null,
      bio_km: a.bio_km ?? null,
      photo_url: a.photo_url ?? null,
    },
    author_order: row.author_order ?? 1,
    is_corresponding: row.is_corresponding ?? false,
    affiliation_ids: row.affiliation_ids ?? [],
  };
}

function mapFile(row: any): PublicationFile {
  return {
    id: row.id,
    label: row.label ?? "",
    file_url: row.file_url,
    file_type: row.file_type ?? null,
    size_bytes: row.size_bytes ?? null,
    sort_order: row.sort_order ?? 0,
  };
}

/**
 * Normalise any Supabase publications row into the Publication type.
 * Supports BOTH data shapes (like mapRowToBook):
 *  (A) the `publications_with_stats` view → row.author_names is a string
 *  (B) an embedded select → row.publication_authorships = [{ ..., publication_authors: {...} }]
 */
export function mapRowToPublication(row: any): Publication {
  const embeddedAuthorships = Array.isArray(row.publication_authorships)
    ? row.publication_authorships.map(mapAuthorship)
    : null;

  const authorships = embeddedAuthorships
    ? [...embeddedAuthorships].sort((a, b) => a.author_order - b.author_order)
    : undefined;

  const authorNames =
    typeof row.author_names === "string" && row.author_names.length > 0
      ? row.author_names
      : authorships?.length
        ? authorships.map((a) => a.author.full_name).join(", ")
        : null;

  const references = normalizePublicationReferences(row.references);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    title_km: row.title_km ?? null,
    article_type: (row.article_type ?? "article") as ArticleType,
    journal_name: row.journal_name ?? null,
    volume: row.volume ?? null,
    issue_no: row.issue_no ?? null,
    page_start: row.page_start ?? null,
    page_end: row.page_end ?? null,
    article_no: row.article_no ?? null,
    doi: row.doi ?? null,
    publication_date: row.publication_date ?? null,
    abstract: row.abstract ?? null,
    abstract_km: row.abstract_km ?? null,
    keywords: row.keywords ?? [],
    publisher: row.publisher ?? null,
    isbn: row.isbn ?? null,
    subjects: row.subjects ?? [],
    table_of_contents: Array.isArray(row.table_of_contents) ? row.table_of_contents : [],
    learning_outcomes: row.learning_outcomes ?? [],
    faqs: Array.isArray(row.faqs) ? row.faqs : [],
    license: row.license ?? null,
    copyright: row.copyright ?? null,
    language: row.language ?? "en",
    cover_url: row.cover_url ?? null,
    pdf_url: row.pdf_url ?? null,
    references,
    is_published: row.is_published ?? false,
    published_at: row.published_at ?? null,
    view_count: row.view_count ?? 0,
    download_count: row.download_count ?? 0,
    created_at: row.created_at,
    author_names: authorNames,
    authorships,
    files: Array.isArray(row.publication_files)
      ? row.publication_files
          .map(mapFile)
          .sort((a: PublicationFile, b: PublicationFile) => a.sort_order - b.sort_order)
      : undefined,
  };
}

/** Embedded select fragment for detail queries (authors + files in one round trip). */
export const PUBLICATION_DETAIL_SELECT = `*,
  publication_authorships(author_order, is_corresponding, affiliation_ids,
    publication_authors(id, full_name, full_name_km, orcid, email, bio, bio_km, photo_url)),
  publication_files(id, label, file_url, file_type, size_bytes, sort_order)`;
