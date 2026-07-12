/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/oai/records.ts
// Server-only data layer for the OAI-PMH endpoint: fetches published,
// publicly-licensed books/theses/publications and normalises them into the
// common OaiRecord shape defined in lib/oai/xml.ts. Kept separate from that
// pure module so the XML-building half stays unit-testable without Supabase
// (mirrors the lib/seo/citation.ts vs. app/actions/*.ts split elsewhere).

import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/seo/site";
import { splitAuthorNames } from "@/lib/seo/citation";
import { getKeywords } from "@/lib/theses/report-fields";
import {
  academicTextToPlainText,
  normalizePublicationReferences,
} from "@/lib/publications/citations";
import {
  toOaiDatestamp,
  toDcDate,
  nowOaiDatestamp,
  normalizeDcLanguages,
  type OaiRecord,
  type OaiSetSpec,
} from "@/lib/oai/xml";

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * Books and theses use the shared license enum (migration 0062); only these
 * values count as "publicly licensed" for external harvest — the default
 * 'unknown' and the explicit 'all_rights_reserved' are deliberately excluded.
 */
const OAI_ALLOWED_LICENSES = ["public_domain", "cc_by", "cc_by_nc", "cc_by_nc_nd", "moeys_open"] as const;

/** Publications store license as free text (e.g. "CC BY 4.0"), not the enum — best-effort check instead. */
function isPubliclyLicensedFreeText(license: string | null | undefined): boolean {
  if (!license) return false;
  const trimmed = license.trim();
  if (!trimmed) return false;
  return !/all\s+rights\s+reserved/i.test(trimmed);
}

function dedupe(values: (string | null | undefined)[]): string[] {
  const clean = values.map((v) => v?.trim()).filter((v): v is string => !!v);
  return [...new Set(clean)];
}

/** Embedded to-one relations come back as an object, but PostgREST returns an
 * array when it can't prove the FK is to-one — handle both shapes (same
 * caveat documented in lib/admin/ebooks.ts). */
function relName(rel: unknown): string | null {
  if (Array.isArray(rel)) return (rel[0] as { name?: string } | undefined)?.name ?? null;
  return (rel as { name?: string } | null)?.name ?? null;
}

export interface OaiDateRange {
  from?: Date;
  until?: Date;
}

const FETCH_PAGE_SIZE = 1000; // PostgREST's per-request row cap (see app/sitemap.ts's fetchAllRows)

// ── Books ────────────────────────────────────────────────────────────────

// books.updated_at arrives with migration 0077 (confirmed live on the hosted
// DB as pre-migration drift, but the migration file itself is still pending
// formal apply) — retry without the column on 42703 and remember for the
// life of this lambda instance, mirroring lib/admin/ebooks.ts's fallback.
let booksUpdatedAtMissing = false;

function isMissingUpdatedAt(error: { code?: string; message?: string } | null): boolean {
  return !!error && error.code === "42703" && (error.message ?? "").includes("updated_at");
}

function bookSelect(withUpdatedAt: boolean): string {
  return `id, slug, title, description, language, published_at, created_at${withUpdatedAt ? ", updated_at" : ""}, tags, license,
    authors(name), categories(name), departments(name)`;
}

function mapBookRow(row: any, hasUpdatedAt: boolean): OaiRecord {
  const rawDatestamp = (hasUpdatedAt ? row.updated_at : null) ?? row.created_at;
  return {
    setSpec: "book",
    localId: row.slug,
    datestamp: toOaiDatestamp(new Date(rawDatestamp)),
    title: row.title,
    creators: dedupe([relName(row.authors)]),
    date: toDcDate(row.published_at ?? row.created_at),
    subjects: dedupe([relName(row.categories), relName(row.departments), ...((row.tags as string[]) ?? [])]),
    description: row.description ?? null,
    identifierUrl: `${SITE_URL}/books/${row.slug}`,
    languages: normalizeDcLanguages(row.language),
    type: "Book",
  };
}

async function fetchAllBookRows(supabase: ServiceClient, range: OaiDateRange, withUpdatedAt: boolean): Promise<any[]> {
  const dateColumn = withUpdatedAt ? "updated_at" : "created_at";
  const rows: any[] = [];
  let from = 0;
  for (;;) {
    let query = supabase
      .from("books")
      .select(bookSelect(withUpdatedAt))
      .eq("is_published", true)
      .in("license", OAI_ALLOWED_LICENSES)
      // Authoritative-feed contract (docs/METADATA-EXPORTS.md): only
      // librarian-verified metadata is harvestable.
      .not("verified_at", "is", null)
      .order("id", { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1);
    if (dateColumn === "updated_at") {
      if (range.from) {
        const iso = range.from.toISOString();
        query = query.or(`updated_at.gte.${iso},and(updated_at.is.null,created_at.gte.${iso})`);
      }
      if (range.until) {
        const iso = range.until.toISOString();
        query = query.or(`updated_at.lte.${iso},and(updated_at.is.null,created_at.lte.${iso})`);
      }
    } else {
      if (range.from) query = query.gte(dateColumn, range.from.toISOString());
      if (range.until) query = query.lte(dateColumn, range.until.toISOString());
    }

    const { data, error } = await query;
    if (error) {
      if (withUpdatedAt && isMissingUpdatedAt(error)) throw new MissingUpdatedAtSignal();
      throw new Error(`[oai] books query failed: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < FETCH_PAGE_SIZE) break;
    from += data.length;
  }
  return rows;
}

class MissingUpdatedAtSignal extends Error {}

async function fetchBookRecords(supabase: ServiceClient, range: OaiDateRange): Promise<OaiRecord[]> {
  const withUpdatedAt = !booksUpdatedAtMissing;
  try {
    const rows = await fetchAllBookRows(supabase, range, withUpdatedAt);
    return rows.map((row) => mapBookRow(row, withUpdatedAt));
  } catch (e) {
    if (e instanceof MissingUpdatedAtSignal) {
      booksUpdatedAtMissing = true;
      const rows = await fetchAllBookRows(supabase, range, false);
      return rows.map((row) => mapBookRow(row, false));
    }
    throw e;
  }
}

async function getBookRecord(supabase: ServiceClient, slug: string): Promise<OaiRecord | null> {
  const withUpdatedAt = !booksUpdatedAtMissing;
  let { data, error } = await supabase
    .from("books")
    .select(bookSelect(withUpdatedAt))
    .eq("slug", slug)
    .eq("is_published", true)
    .in("license", OAI_ALLOWED_LICENSES)
    .not("verified_at", "is", null)
    .maybeSingle();

  let effectiveHasUpdatedAt = withUpdatedAt;
  if (error && withUpdatedAt && isMissingUpdatedAt(error)) {
    booksUpdatedAtMissing = true;
    effectiveHasUpdatedAt = false;
    ({ data, error } = await supabase
      .from("books")
      .select(bookSelect(false))
      .eq("slug", slug)
      .eq("is_published", true)
      .in("license", OAI_ALLOWED_LICENSES)
      .not("verified_at", "is", null)
      .maybeSingle());
  }
  if (error) throw new Error(`[oai] book lookup failed: ${error.message}`);
  return data ? mapBookRow(data, effectiveHasUpdatedAt) : null;
}

// ── Theses (research_reports) ───────────────────────────────────────────

// updated_at (0075) and slug (0067) are both confirmed applied+live — no
// pre-migration fallback needed here, unlike books.updated_at above.
const THESIS_SELECT = `id, slug, title, abstract, author_names, language, subject, keywords,
  published_at, created_at, updated_at, license, departments(name)`;

function mapThesisRow(row: any): OaiRecord {
  return {
    setSpec: "thesis",
    localId: row.slug,
    datestamp: toOaiDatestamp(new Date(row.updated_at ?? row.created_at)),
    title: row.title,
    creators: splitAuthorNames(row.author_names),
    date: toDcDate(row.published_at ?? row.created_at),
    subjects: dedupe([relName(row.departments), row.subject, ...getKeywords(row)]),
    description: row.abstract ?? null,
    identifierUrl: `${SITE_URL}/theses/${row.slug}`,
    languages: normalizeDcLanguages(row.language),
    type: "Thesis",
  };
}

async function fetchThesisRecords(supabase: ServiceClient, range: OaiDateRange): Promise<OaiRecord[]> {
  const rows: any[] = [];
  let from = 0;
  for (;;) {
    let query = supabase
      .from("research_reports")
      .select(THESIS_SELECT)
      .eq("is_published", true)
      .in("license", OAI_ALLOWED_LICENSES)
      .not("verified_at", "is", null)
      .order("id", { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1);
    if (range.from) {
      const iso = range.from.toISOString();
      query = query.or(`updated_at.gte.${iso},and(updated_at.is.null,created_at.gte.${iso})`);
    }
    if (range.until) {
      const iso = range.until.toISOString();
      query = query.or(`updated_at.lte.${iso},and(updated_at.is.null,created_at.lte.${iso})`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`[oai] research_reports query failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < FETCH_PAGE_SIZE) break;
    from += data.length;
  }
  return rows.map(mapThesisRow);
}

async function getThesisRecord(supabase: ServiceClient, slug: string): Promise<OaiRecord | null> {
  const { data, error } = await supabase
    .from("research_reports")
    .select(THESIS_SELECT)
    .eq("slug", slug)
    .eq("is_published", true)
    .in("license", OAI_ALLOWED_LICENSES)
    .not("verified_at", "is", null)
    .maybeSingle();
  if (error) throw new Error(`[oai] thesis lookup failed: ${error.message}`);
  return data ? mapThesisRow(data) : null;
}

// ── Publications ─────────────────────────────────────────────────────────

// Deliberately NOT the publications_with_stats view: its `p.*` column list
// was frozen when the view was created, before migration 0056 added
// `subjects` — selecting subjects through it 42703s. The base table plus an
// embedded authorships select (ordered client-side) gets everything we need.
const PUBLICATION_SELECT = `id, slug, title, abstract, references, language, publication_date,
  published_at, created_at, updated_at, license, keywords, subjects, article_type, journal_name,
  publication_authorships(author_order, publication_authors(full_name))`;

function publicationCreators(row: any): string[] {
  const authorships = Array.isArray(row.publication_authorships) ? row.publication_authorships : [];
  return authorships
    .slice()
    .sort((a: any, b: any) => (a.author_order ?? 1) - (b.author_order ?? 1))
    .map((a: any) => (Array.isArray(a.publication_authors) ? a.publication_authors[0] : a.publication_authors))
    .map((author: any) => author?.full_name?.trim())
    .filter(Boolean);
}

const ARTICLE_TYPE_LABELS: Record<string, string> = {
  article: "Journal Article",
  review: "Review Article",
  account: "Article",
  editorial: "Editorial",
};

function mapPublicationRow(row: any): OaiRecord {
  return {
    setSpec: "publication",
    localId: row.slug,
    datestamp: toOaiDatestamp(new Date(row.updated_at ?? row.created_at)),
    title: row.title,
    creators: publicationCreators(row),
    date: toDcDate(row.publication_date ?? row.published_at ?? row.created_at),
    subjects: dedupe([row.journal_name, ...((row.keywords as string[]) ?? []), ...((row.subjects as string[]) ?? [])]),
    description: academicTextToPlainText(
      row.abstract,
      normalizePublicationReferences(row.references),
    ) || null,
    identifierUrl: `${SITE_URL}/publications/${row.slug}`,
    languages: normalizeDcLanguages(row.language),
    type: ARTICLE_TYPE_LABELS[row.article_type as string] ?? "Journal Article",
  };
}

async function fetchPublicationRecords(supabase: ServiceClient, range: OaiDateRange): Promise<OaiRecord[]> {
  const rows: any[] = [];
  let from = 0;
  for (;;) {
    let query = supabase
      .from("publications")
      .select(PUBLICATION_SELECT)
      .eq("is_published", true)
      .order("id", { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1);
    if (range.from) {
      const iso = range.from.toISOString();
      query = query.or(`updated_at.gte.${iso},and(updated_at.is.null,created_at.gte.${iso})`);
    }
    if (range.until) {
      const iso = range.until.toISOString();
      query = query.or(`updated_at.lte.${iso},and(updated_at.is.null,created_at.lte.${iso})`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`[oai] publications query failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < FETCH_PAGE_SIZE) break;
    from += data.length;
  }
  // License is free text here (no DB enum), so the "publicly licensed" check
  // happens client-side rather than via .in(...).
  return rows.filter((r) => isPubliclyLicensedFreeText(r.license)).map(mapPublicationRow);
}

async function getPublicationRecord(supabase: ServiceClient, slug: string): Promise<OaiRecord | null> {
  const { data, error } = await supabase
    .from("publications")
    .select(PUBLICATION_SELECT)
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (error) throw new Error(`[oai] publication lookup failed: ${error.message}`);
  if (!data || !isPubliclyLicensedFreeText(data.license)) return null;
  return mapPublicationRow(data);
}

// ── Cross-table fan-out ──────────────────────────────────────────────────

export interface FetchOaiRecordsParams {
  set?: OaiSetSpec;
  from?: Date;
  until?: Date;
}

/**
 * Fetches every published, publicly-licensed item matching the given filters
 * across all three content types (or just one, if `set` narrows it), then
 * merges them into one deterministically-ordered list: by datestamp, then
 * setSpec, then localId. That fixed ordering is what makes resumptionToken
 * offsets stable across paginated requests.
 */
export async function fetchOaiRecords(params: FetchOaiRecordsParams): Promise<OaiRecord[]> {
  const supabase = createServiceClient();
  const range: OaiDateRange = { from: params.from, until: params.until };
  const wantBooks = !params.set || params.set === "book";
  const wantTheses = !params.set || params.set === "thesis";
  const wantPublications = !params.set || params.set === "publication";

  const [books, theses, publications] = await Promise.all([
    wantBooks ? fetchBookRecords(supabase, range) : Promise.resolve([]),
    wantTheses ? fetchThesisRecords(supabase, range) : Promise.resolve([]),
    wantPublications ? fetchPublicationRecords(supabase, range) : Promise.resolve([]),
  ]);

  const merged = [...books, ...theses, ...publications];
  merged.sort((a, b) => {
    if (a.datestamp !== b.datestamp) return a.datestamp < b.datestamp ? -1 : 1;
    if (a.setSpec !== b.setSpec) return a.setSpec < b.setSpec ? -1 : 1;
    if (a.localId !== b.localId) return a.localId < b.localId ? -1 : 1;
    return 0;
  });
  return merged;
}

/** Single-record lookup for GetRecord — returns null if not found, unpublished, or not publicly licensed. */
export async function getOaiRecord(setSpec: OaiSetSpec, localId: string): Promise<OaiRecord | null> {
  const supabase = createServiceClient();
  if (setSpec === "book") return getBookRecord(supabase, localId);
  if (setSpec === "thesis") return getThesisRecord(supabase, localId);
  return getPublicationRecord(supabase, localId);
}

/**
 * Advisory-only lower bound for Identify's earliestDatestamp. Per the OAI-PMH
 * spec this only needs to be a safe LOWER limit, so it deliberately skips the
 * license filter (an earlier-than-strictly-necessary date is harmless; a
 * later one could make a harvester's `from=` skip real records). Fails soft
 * to "now" if every query errors — this field is not worth failing Identify
 * over.
 */
export async function computeEarliestDatestamp(): Promise<string> {
  const supabase = createServiceClient();
  const results = await Promise.all([
    supabase.from("books").select("created_at").eq("is_published", true).order("created_at", { ascending: true }).limit(1),
    supabase.from("research_reports").select("created_at").eq("is_published", true).order("created_at", { ascending: true }).limit(1),
    supabase.from("publications").select("created_at").eq("is_published", true).order("created_at", { ascending: true }).limit(1),
  ]);

  const dates = results
    .flatMap((r) => r.data ?? [])
    .map((row: any) => (row.created_at ? new Date(row.created_at) : null))
    .filter((d): d is Date => !!d && !isNaN(d.getTime()));

  if (dates.length === 0) return nowOaiDatestamp();
  const earliest = dates.reduce((min, d) => (d < min ? d : min));
  return toOaiDatestamp(earliest);
}
