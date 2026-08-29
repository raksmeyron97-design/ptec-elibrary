/* eslint-disable @typescript-eslint/no-explicit-any */
// Pure, browser-safe types + row mapper for Publications (academic journal
// articles). Mirrors lib/theses.ts — no server-only imports so Client
// Components can use it freely. Fetch/mutation logic lives in
// app/actions/publications.ts.

import { normalizePublicationReferences } from "@/lib/publications/citations";
import type { StructuredReferenceMetadata } from "@/lib/publications/reference-metadata";

export interface PublicationAuthor {
  id: string;
  full_name: string;
  full_name_km: string | null;
  orcid: string | null;
  email: string | null;
  bio: string | null;
  bio_km: string | null;
  photo_url: string | null;
  /**
   * Academic profile fields (migration 0125). All optional in the TYPE as well
   * as in the data: a query written before 0125 — or a select that deliberately
   * asks for less — simply omits them, and every consumer treats absent as
   * "not recorded" rather than crashing.
   */
  slug?: string | null;
  position_title?: string | null;
  affiliation_name?: string | null;
  website_url?: string | null;
  google_scholar_url?: string | null;
  research_gate_url?: string | null;
  research_interests?: string[];
  is_published?: boolean;
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

/**
 * One figure from the article's visual content (migration 0125).
 *
 * `caption` and `alt_text` are separate because they do different jobs:
 * the caption is the printed "Figure 1. …" line every reader sees, the alt
 * text is what a screen reader announces in place of the image. A caption read
 * aloud as alt text describes the figure's role, not its content.
 */
export interface PublicationFigure {
  id: string;
  image_url: string;
  caption: string | null;
  caption_km: string | null;
  alt_text: string | null;
  credit: string | null;
  sort_order: number;
}

export interface PublicationReference {
  /** Stable semantic identity; visible numbering is derived from array order. */
  id: string;
  index: number;
  text: string;
  doi?: string;
  url?: string;
  /**
   * Optional structured academic metadata (additive JSONB keys). `text`
   * remains the canonical display string so pre-existing readers keep
   * working; `meta` powers structured editing and DOI import.
   */
  meta?: StructuredReferenceMetadata;
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
  /** Journal ISSN (migration 0092). Distinct from a reviewed book's ISBN. */
  issn: string | null;
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
  /**
   * Library-policy download switch (migration 0125). Optional in the type
   * because a row read before the migration has no such column; every reader
   * must treat `undefined` as "allowed", which is the column's default and the
   * behaviour every existing record already had.
   */
  allow_download?: boolean;
  download_disabled_reason?: string | null;
  /**
   * Rights flag from 0092 — whether we may redistribute the full text at all.
   * Distinct from allow_download; a download needs both. Carried on the type so
   * the page can resolve access without a second query.
   */
  fulltext_redistributable?: boolean;
  /** Admin SEO overrides (migration 0112). Null → auto-generated metadata. */
  seo_title: string | null;
  seo_description: string | null;
  og_image: string | null;
  references: PublicationReference[];
  is_published: boolean;
  published_at: string | null;
  view_count: number;
  download_count: number;
  created_at: string;
  /**
   * Optimistic-concurrency token (migration 0085). Undefined until the
   * migration is applied — callers must treat that as "no revision guard".
   */
  content_revision?: number;
  /** Comma-joined byline. From the view's aggregate, or derived from embedded authorships. */
  author_names: string | null;
  /** Present only when the query embedded publication_authorships. */
  authorships?: PublicationAuthorship[];
  /** Present only when the query embedded publication_files. */
  files?: PublicationFile[];
  /**
   * Present only when the caller loaded them (getPublicationFigures). Kept OUT
   * of PUBLICATION_DETAIL_SELECT on purpose — see the note on that constant.
   */
  figures?: PublicationFigure[];
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
      // Spread only what the select actually returned: a pre-0125 query has no
      // `slug` key at all, and writing `slug: null` there would tell callers
      // "this author has no slug" when the truth is "we did not ask".
      ...("slug" in a ? { slug: a.slug ?? null } : {}),
      ...("position_title" in a ? { position_title: a.position_title ?? null } : {}),
      ...("affiliation_name" in a ? { affiliation_name: a.affiliation_name ?? null } : {}),
      ...("website_url" in a ? { website_url: a.website_url ?? null } : {}),
      ...("google_scholar_url" in a ? { google_scholar_url: a.google_scholar_url ?? null } : {}),
      ...("research_gate_url" in a ? { research_gate_url: a.research_gate_url ?? null } : {}),
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
    issn: row.issn ?? null,
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
    // Same rule as the author profile fields: only carry what was selected.
    ...(typeof row.allow_download === "boolean" ? { allow_download: row.allow_download } : {}),
    ...("download_disabled_reason" in row
      ? { download_disabled_reason: row.download_disabled_reason ?? null }
      : {}),
    ...(typeof row.fulltext_redistributable === "boolean"
      ? { fulltext_redistributable: row.fulltext_redistributable }
      : {}),
    seo_title: row.seo_title ?? null,
    seo_description: row.seo_description ?? null,
    og_image: row.og_image ?? null,
    references,
    is_published: row.is_published ?? false,
    published_at: row.published_at ?? null,
    view_count: row.view_count ?? 0,
    download_count: row.download_count ?? 0,
    created_at: row.created_at,
    ...(typeof row.content_revision === "number"
      ? { content_revision: row.content_revision }
      : {}),
    author_names: authorNames,
    authorships,
    files: Array.isArray(row.publication_files)
      ? row.publication_files
          .map(mapFile)
          .sort((a: PublicationFile, b: PublicationFile) => a.sort_order - b.sort_order)
      : undefined,
  };
}

/**
 * Embedded select fragment for detail queries (authors + files in one round
 * trip).
 *
 * `*` on the parent picks up 0125's allow_download / download_disabled_reason
 * automatically. The AUTHOR columns from 0125 are named explicitly and are
 * therefore the one thing here that can fail against a database where the
 * migration has not landed yet — getPublicationBySlug retries with
 * PUBLICATION_DETAIL_SELECT_LEGACY when that happens, so a deploy that reaches
 * the box before the migration does degrades to the old byline instead of
 * 404ing every article.
 *
 * publication_figures is deliberately NOT embedded: it is needed by exactly one
 * section of one page, and a failed embed would take the whole record with it.
 * getPublicationFigures() fetches it separately and returns [] on error.
 */
export const PUBLICATION_DETAIL_SELECT = `*,
  publication_authorships(author_order, is_corresponding, affiliation_ids,
    publication_authors(id, full_name, full_name_km, orcid, email, bio, bio_km, photo_url,
      slug, position_title, affiliation_name, website_url, google_scholar_url,
      research_gate_url, research_interests, is_published)),
  publication_files(id, label, file_url, file_type, size_bytes, sort_order)`;

/** The pre-0125 shape, used only as the retry when the enriched select fails. */
export const PUBLICATION_DETAIL_SELECT_LEGACY = `*,
  publication_authorships(author_order, is_corresponding, affiliation_ids,
    publication_authors(id, full_name, full_name_km, orcid, email, bio, bio_km, photo_url)),
  publication_files(id, label, file_url, file_type, size_bytes, sort_order)`;

/** publication_authors columns as they existed before migration 0125. */
export const AUTHOR_SELECT_LEGACY =
  "id, full_name, full_name_km, orcid, email, bio, bio_km, photo_url";

/** …and the same plus 0125's academic-profile columns. */
export const AUTHOR_SELECT_FULL =
  `${AUTHOR_SELECT_LEGACY}, slug, position_title, affiliation_name, website_url, ` +
  "google_scholar_url, research_gate_url, research_interests, is_published";

/**
 * True when a PostgREST error is "you named a column this database has not
 * got". Every enriched select in this codebase pairs with a legacy retry on
 * this predicate, so a deploy that lands before its migration degrades instead
 * of erroring.
 */
export function isMissingColumnError(error: { message?: string } | null | undefined): boolean {
  return !!error && /column|does not exist|schema cache/i.test(error.message ?? "");
}

/** Normalise a publication_figures row. */
export function mapRowToFigure(row: any): PublicationFigure {
  return {
    id: row.id,
    image_url: row.image_url,
    caption: row.caption ?? null,
    caption_km: row.caption_km ?? null,
    alt_text: row.alt_text ?? null,
    credit: row.credit ?? null,
    sort_order: row.sort_order ?? 0,
  };
}
