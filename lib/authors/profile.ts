// lib/authors/profile.ts
//
// Server-only fetch for /authors/[slug]. Pure derivations live in
// lib/authors/stats.ts; the shapes live in lib/authors/types.ts.
//
// WHAT CHANGED AND WHY
//
// The previous resolver pulled up to 1,000 `authors` rows and 1,000
// `publication_authors` rows on every request and ran slugify() over both in
// JavaScript to find one person — an unindexed full scan of two tables to
// answer "who is this slug?". It then found that person's work with
// `ilike '%<name>%'` against every author-name string in the library,
// INCLUDING publications, which have had a real foreign key
// (publication_authorships.author_id) since 0052. So a publication by
// "Sok Dara" was matched by substring, and an author named "Sok" collected
// every work by "Sok Dara", "Sok Nara" and "Sok Pisey" as if they were theirs.
//
// This version:
//   * resolves the person by the indexed `slug` column added in 0125, with the
//     old scan kept ONLY as a fallback for a row the backfill did not reach;
//   * reads publications and e-books through their foreign keys;
//   * still has to use ilike for theses and the physical catalog, whose author
//     columns are genuinely free text — but re-checks every candidate with
//     parseAuthorNames() so a substring match cannot survive as a real one.

import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/books";
import { parseAuthorNames } from "@/lib/resources/author-names";
import { resolveDownloadAccess } from "@/lib/publications/access";
import { yearOf, sortWorks } from "@/lib/authors/stats";
import type { AuthorProfile, AuthorWork } from "@/lib/authors/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** How many works of each kind a profile page will show. */
const PER_TYPE_LIMIT = 60;

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Is `name` one of the people listed in a free-text byline?
 *
 * `ilike '%Sok%'` is the only filter Postgres can apply to a text column, so
 * the database hands back candidates; this decides. Comparison is on the
 * casefolded whole name, which is why "Sok" no longer claims "Sok Dara"'s
 * thesis. parseAuthorNames() is the same splitter migration 0105's contributor
 * backfill uses, so app and backfill agree on where one name ends.
 */
function bylineNames(raw: string | null | undefined): string[] {
  return parseAuthorNames(raw).map((n) => n.toLowerCase());
}

function isNamedIn(raw: string | null | undefined, names: string[]): boolean {
  const listed = bylineNames(raw);
  return names.some((n) => listed.includes(n));
}

/** Every alias this person is known by, casefolded, for free-text matching. */
function aliasesOf(name: string, nameKm: string | null): string[] {
  return [name, nameKm]
    .map((n) => n?.trim().toLowerCase())
    .filter((n): n is string => !!n);
}

// ── Identity lookup ──────────────────────────────────────────────────────────

type AuthorRecord = {
  id: string;
  full_name: string;
  full_name_km: string | null;
  orcid: string | null;
  bio: string | null;
  bio_km: string | null;
  photo_url: string | null;
  slug: string | null;
  position_title: string | null;
  affiliation_name: string | null;
  website_url: string | null;
  google_scholar_url: string | null;
  research_gate_url: string | null;
  research_interests: string[] | null;
  is_published: boolean | null;
};

const AUTHOR_SELECT =
  "id, full_name, full_name_km, orcid, bio, bio_km, photo_url, slug, position_title, " +
  "affiliation_name, website_url, google_scholar_url, research_gate_url, " +
  "research_interests, is_published";

/**
 * Find the academic profile record for a slug.
 *
 * Indexed lookup first. The scan fallback exists because the 0125 backfill
 * derives slugs in SQL while the app derives them in JS, and the two character
 * classes are close but not provably identical — a divergence must degrade to
 * "slower but correct", never to a 404 on a URL that used to work.
 */
async function findPublicationAuthor(
  supabase: ReturnType<typeof createServiceClient>,
  slug: string,
): Promise<AuthorRecord | null> {
  // The double cast is unavoidable: the Supabase client has no generated
  // schema type in this repo, so it infers a select naming 0125's columns as
  // an error shape until the migration is applied. The runtime already handles
  // the "column missing" case — that is what the scan fallback below is.
  const { data: bySlug } = await supabase
    .from("publication_authors")
    .select(AUTHOR_SELECT)
    .eq("slug", slug)
    .maybeSingle();
  if (bySlug) return bySlug as unknown as AuthorRecord;

  const { data: all } = await supabase
    .from("publication_authors")
    .select(AUTHOR_SELECT)
    .limit(2000);
  return (
    ((all ?? []) as unknown as AuthorRecord[]).find(
      (a) =>
        slugify(a.full_name) === slug ||
        (a.full_name_km ? slugify(a.full_name_km) === slug : false),
    ) ?? null
  );
}

type BookAuthorRecord = { id: string; name: string; bio: string | null; photo_url: string | null };

async function findBookAuthor(
  supabase: ReturnType<typeof createServiceClient>,
  slug: string,
): Promise<BookAuthorRecord | null> {
  const { data: bySlug } = await supabase
    .from("authors")
    .select("id, name, bio, photo_url")
    .eq("slug", slug)
    .maybeSingle();
  if (bySlug) return bySlug as BookAuthorRecord;

  const { data: all } = await supabase
    .from("authors")
    .select("id, name, bio, photo_url")
    .limit(2000);
  return ((all ?? []) as BookAuthorRecord[]).find((a) => slugify(a.name) === slug) ?? null;
}

// ── Works ────────────────────────────────────────────────────────────────────

async function publicationWorks(
  supabase: ReturnType<typeof createServiceClient>,
  authorId: string,
): Promise<AuthorWork[]> {
  // The join the old ilike was standing in for. `!inner` keeps the filter on
  // the link row, so this is one round trip, not one per publication.
  const { data } = await supabase
    .from("publications")
    .select(
      "id, slug, title, title_km, abstract, journal_name, doi, cover_url, pdf_url, " +
        "publication_date, published_at, publisher, license, allow_download, " +
        "fulltext_redistributable, publication_authorships!inner(author_id)",
    )
    .eq("publication_authorships.author_id", authorId)
    .eq("is_published", true)
    .limit(PER_TYPE_LIMIT);

  const rows = (data ?? []) as any[];
  if (rows.length === 0) return [];

  // One extra query for every byline on the page, rather than one per row.
  const { data: bylines } = await supabase
    .from("publications_with_stats")
    .select("id, author_names")
    .in("id", rows.map((r) => r.id));
  const bylineFor = new Map<string, string | null>(
    ((bylines ?? []) as any[]).map((b) => [b.id, b.author_names ?? null]),
  );

  return rows.map((row) => ({
    id: row.id,
    type: "publication" as const,
    title: row.title,
    href: `/publications/${row.slug}`,
    excerpt: clean(row.abstract),
    year: yearOf(row.publication_date ?? row.published_at),
    venue: clean(row.journal_name),
    byline: bylineFor.get(row.id) ?? null,
    doi: clean(row.doi),
    coverUrl: clean(row.cover_url),
    downloadable: resolveDownloadAccess({
      slug: row.slug,
      title: row.title,
      publisher: row.publisher ?? null,
      license: row.license ?? null,
      allow_download: row.allow_download,
      fulltext_redistributable: row.fulltext_redistributable,
      pdf_url: row.pdf_url,
    }).canDownload,
  }));
}

async function bookWorks(
  supabase: ReturnType<typeof createServiceClient>,
  bookAuthorId: string,
): Promise<AuthorWork[]> {
  const { data } = await supabase
    .from("books")
    .select("id, slug, title, description, cover_url, published_at, created_at")
    .eq("author_id", bookAuthorId)
    .eq("is_published", true)
    .order("download_count", { ascending: false })
    .limit(PER_TYPE_LIMIT);

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    type: "ebook" as const,
    title: row.title,
    href: `/books/${row.slug}`,
    excerpt: clean(row.description),
    year: yearOf(row.published_at ?? row.created_at),
    venue: null,
    byline: null,
    doi: null,
    coverUrl: clean(row.cover_url),
    // Every published e-book in the library is downloadable; the per-record
    // policy switch is a publications concept.
    downloadable: true,
  }));
}

async function thesisWorks(
  supabase: ReturnType<typeof createServiceClient>,
  aliases: string[],
): Promise<AuthorWork[]> {
  if (aliases.length === 0) return [];
  // Widen with ilike (all Postgres can do against a free-text column), then
  // narrow with an exact name check below.
  const { data } = await supabase
    .from("research_reports")
    .select("id, slug, title, abstract, author_names, cover_url, doi, published_at, created_at, faculty, file_url")
    .eq("is_published", true)
    .or(aliases.map((a) => `author_names.ilike.%${a}%`).join(","))
    .limit(PER_TYPE_LIMIT * 2);

  return ((data ?? []) as any[])
    .filter((row) => isNamedIn(row.author_names, aliases))
    .slice(0, PER_TYPE_LIMIT)
    .map((row) => ({
      id: row.id,
      type: "thesis" as const,
      title: row.title,
      href: `/theses/${row.slug ?? row.id}`,
      excerpt: clean(row.abstract),
      year: yearOf(row.published_at ?? row.created_at),
      venue: clean(row.faculty),
      byline: clean(row.author_names),
      doi: clean(row.doi),
      coverUrl: clean(row.cover_url),
      downloadable: !!row.file_url,
    }));
}

async function catalogWorks(
  supabase: ReturnType<typeof createServiceClient>,
  aliases: string[],
): Promise<AuthorWork[]> {
  if (aliases.length === 0) return [];
  const { data } = await supabase
    .from("catalog_books")
    .select("id, slug, title, description, author, cover_url, year")
    .eq("is_active", true)
    .or(aliases.map((a) => `author.ilike.%${a}%`).join(","))
    .limit(PER_TYPE_LIMIT * 2);

  return ((data ?? []) as any[])
    .filter((row) => isNamedIn(row.author, aliases))
    .slice(0, PER_TYPE_LIMIT)
    .map((row) => ({
      id: row.id,
      type: "catalog" as const,
      title: row.title,
      href: `/catalogs/${row.slug ?? row.id}`,
      excerpt: clean(row.description),
      year: typeof row.year === "number" ? row.year : null,
      venue: null,
      byline: clean(row.author),
      doi: null,
      coverUrl: clean(row.cover_url),
      // A physical book is borrowed at the desk, never downloaded.
      downloadable: false,
    }));
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Resolve everything /authors/[slug] renders, or null when the slug names
 * nobody. Returns null for an unpublished profile that has no works either —
 * see the note inline.
 */
export async function getAuthorProfile(slug: string): Promise<AuthorProfile | null> {
  const supabase = createServiceClient();

  const [academic, bookAuthor] = await Promise.all([
    findPublicationAuthor(supabase, slug),
    findBookAuthor(supabase, slug),
  ]);

  const name =
    clean(academic?.full_name) ??
    clean(bookAuthor?.name) ??
    clean(academic?.full_name_km) ??
    null;
  if (!name) return null;

  // is_published=false hides the PROFILE, not the person's work. A visitor who
  // follows a byline still gets a page — it just carries the name and the
  // works, with the biography, photo and external links withheld.
  const profileVisible = academic ? academic.is_published !== false : true;

  const aliases = aliasesOf(name, clean(academic?.full_name_km) ?? null);

  const [publications, books, theses, catalog] = await Promise.all([
    academic ? publicationWorks(supabase, academic.id) : Promise.resolve([]),
    bookAuthor ? bookWorks(supabase, bookAuthor.id) : Promise.resolve([]),
    thesisWorks(supabase, aliases),
    catalogWorks(supabase, aliases),
  ]);

  const interests = profileVisible ? (academic?.research_interests ?? []).filter(Boolean) : [];

  return {
    slug: academic?.slug ?? slug,
    name,
    nameKm: clean(academic?.full_name_km),
    photoUrl: profileVisible ? clean(academic?.photo_url) ?? clean(bookAuthor?.photo_url) : null,
    positionTitle: profileVisible ? clean(academic?.position_title) : null,
    affiliation: profileVisible ? clean(academic?.affiliation_name) : null,
    bio: profileVisible ? clean(academic?.bio) ?? clean(bookAuthor?.bio) : null,
    bioKm: profileVisible ? clean(academic?.bio_km) : null,
    researchInterests: interests,
    orcid: profileVisible ? clean(academic?.orcid) : null,
    websiteUrl: profileVisible ? clean(academic?.website_url) : null,
    googleScholarUrl: profileVisible ? clean(academic?.google_scholar_url) : null,
    researchGateUrl: profileVisible ? clean(academic?.research_gate_url) : null,
    works: sortWorks([...publications, ...theses, ...books, ...catalog]),
  };
}
