// lib/seo/sitemap-entries.ts
//
// What the sitemap advertises, one child per resource type. Server-side
// (service-role reads). Served by app/sitemap.xml/route.ts (the index) and
// app/sitemaps/[file]/route.ts (the children), serialized by
// lib/seo/sitemap-xml.ts. This is the body of the former app/sitemap.ts,
// split by type (docs/seo/AUDIT-VERIFICATION.md F6, Phase 1.5); every rule
// below is the one that file carried, and the source scans that pinned it now
// read this file.

import type { MetadataRoute } from 'next';
import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';
import { sitemapLastmod } from '@/lib/seo/book-seo';
import { localeUrls } from '@/lib/seo/alternates';
import { isIndexableEnvironment } from '@/lib/seo/indexing';
import { getSiteConfig } from '@/lib/system-settings/config';
import { getIndexableSubjects } from '@/lib/subjects';
import { validateSitemapEntry } from '@/lib/seo/validate';
import { addressableAuthorSlug } from '@/lib/authors/slug';
import { getListedAuthors } from '@/lib/authors/directory';
import { authorUrlsWithWorks } from '@/lib/authors/sitemap-filter';
import { authorIsIndexable } from '@/lib/authors/indexability';
import { authorIndexMinWorks } from '@/lib/seo/seo-flags';
import { normalizeByline } from '@/lib/resources/contributor-identity';
import { articlePath } from '@/lib/journals/urls';
import { journalSitemapPaths, type SitemapIssue, type SitemapJournal } from '@/lib/journals/sitemap';
import { SITE_URL } from '@/lib/seo/site';

/** One child sitemap per type, in the order the index lists them. */
export const SITEMAP_TYPES = ['static', 'books', 'theses', 'journals', 'paths', 'subjects', 'authors', 'posts'] as const;
export type SitemapType = (typeof SITEMAP_TYPES)[number];

export function isSitemapType(value: string): value is SitemapType {
  return (SITEMAP_TYPES as readonly string[]).includes(value);
}

/** Absolute URL of a child sitemap, e.g. https://…/sitemaps/books.xml. */
export function sitemapChildUrl(type: SitemapType): string {
  return `${SITE_URL}/sitemaps/${type}.xml`;
}

// Revalidate hourly so the sitemap picks up newly published content
// without being frozen at build time.
export const SITEMAP_REVALIDATE_SECONDS = 3600;

// English stays unprefixed (the canonical entry); Khmer is exposed via the
// alternates.languages field so both locales stay discoverable without
// doubling the number of sitemap entries. `x-default` points at English, the
// same set every page head carries (lib/seo/alternates.ts localeAlternates).
function withAlternates(path: string) {
  const { en, km } = localeUrls(path);
  return {
    url: en,
    alternates: {
      languages: { en, km, 'x-default': en },
    },
  };
}

// `lastmod` must be the resource's real significant-update time — never the
// sitemap-generation/deploy time. When no trustworthy timestamp exists we OMIT
// lastModified entirely (an untruthful lastmod trains crawlers to ignore it).
type Entry = MetadataRoute.Sitemap[number];
function entry(
  path: string,
  opts: {
    lastModified?: string | null | undefined;
    changeFrequency?: Entry['changeFrequency'];
    priority?: number;
  },
): Entry {
  const lastmod = opts.lastModified ? sitemapLastmod(opts.lastModified) : undefined;
  return {
    ...withAlternates(path),
    ...(lastmod ? { lastModified: lastmod } : {}),
    ...(opts.changeFrequency ? { changeFrequency: opts.changeFrequency } : {}),
    ...(opts.priority != null ? { priority: opts.priority } : {}),
  };
}

// Collection hubs are CONDITIONAL. A hub with nothing to list renders an empty
// state ("No publications are currently available", "No learning paths
// published yet") — the same soft-404 as an empty subject page. /publications
// and /paths were both live, indexable and in this sitemap with zero rows
// behind them (verified on production 2026-09-09). The count comes from rows
// each child already fetched, so gating costs no extra query (except
// /catalogs, whose records this sitemap no longer lists — see staticEntries).
const hub = (
  path: string,
  count: number,
  opts: { changeFrequency: Entry['changeFrequency']; priority: number },
): MetadataRoute.Sitemap => (count > 0 ? [entry(path, opts)] : []);

// PostgREST caps rows at its project-configured `max_rows` (1000 here)
// regardless of how large a `.range()` is requested — a single bounded query
// would silently truncate the sitemap as soon as any table crosses that
// count. Page through by however many rows actually came back (not a fixed
// page size) so this stays correct even if that cap ever changes.
const PAGE_SIZE = 1000;

// ── Why every sweep below ends its ORDER BY on `id` ─────────────────────────
//
// A `.range()` sweep is a sequence of INDEPENDENT LIMIT/OFFSET queries.
// Postgres promises nothing about how two of them break a TIE, so a sort key
// that is not unique lets a row land on two pages (fetched twice, then dropped
// by the duplicate guard) or on none at all (never fetched). Nothing errors.
// `created_at` is not unique here: `now()` is transaction-scoped, so every row
// of a bulk import shares one timestamp to the microsecond. Measured on
// production 2026-09-16: two fetches one revalidation apart, against an
// unchanged collection, advertised 1,690 and 1,695 of 1,695 books. Ending
// every ORDER BY on the primary key makes the order total, so the same
// collection always produces the same sitemap.
//
// lib/db/paginated-sweep.test.ts enforces this on every sweep in the repo.
const TIEBREAK = 'id';

async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data } = await page(from, from + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    rows.push(...data);
    from += data.length;
  }
  return rows;
}

type Supabase = ReturnType<typeof createServiceClient>;

/**
 * Author rows, with the 0125 `slug` column when the database has it.
 *
 * Two attempts, not one: naming a column that does not exist makes PostgREST
 * fail the whole query, and fetchAllRows reports that as "no rows" — which for
 * the author tables would quietly delete a few hundred URLs from the sitemap
 * during the window between a deploy and its migration. The retry drops the
 * column and returns exactly what this file returned before 0125.
 */
async function fetchAuthorRows<T>(
  supabase: Supabase,
  table: 'authors' | 'publication_authors',
  nameColumn: 'name' | 'full_name',
): Promise<T[]> {
  const load = (columns: string) =>
    fetchAllRows<T>((from, to) =>
      supabase
        .from(table)
        .select(columns)
        .order(nameColumn, { ascending: true })
        .order(TIEBREAK, { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: T[] | null }>,
    );

  const withSlug = await load(`${nameColumn}, slug, created_at`);
  if (withSlug.length > 0) return withSlug;
  return load(`${nameColumn}, created_at`);
}

// ── static: the homepage, informational pages, the physical library, team ──

async function staticEntries(supabase: Supabase): Promise<MetadataRoute.Sitemap> {
  // CATALOGUE RECORDS ARE NOT ADVERTISED (Phase 1.5; the master prompt §4 F12).
  // A catalogue record describes a print copy on a shelf; almost every one is
  // `noindex` (lib/catalogs/indexability.ts), and a sitemap that listed the
  // few that are not asked crawlers to index shelf labels beside the e-books
  // they duplicate. The /catalogs hub stays, gated on the catalogue having
  // anything in it — a count, not a sweep, since no record URL is emitted.
  const { count: catalogCount } = await supabase
    .from('catalog_books')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  // The privacy-enforcing view already restricts this to published members
  // in active sections. Before migration 0114 the `slug` column does not
  // exist and this select errors — fetchAllRows then returns [], which is
  // exactly right: no profile pages exist yet either.
  const teamMembers = await fetchAllRows<{ slug: string | null; updated_at: string | null; created_at: string | null }>(
    (from, to) =>
      supabase
        .from('team_members_public')
        .select('slug, updated_at, created_at')
        .order('created_at', { ascending: true })
        .order(TIEBREAK, { ascending: true })
        .range(from, to),
  );

  // Members without a slug (pre-0114 rows) have no profile page to advertise.
  // updated_at (0116) is maintained by the team_members_updated_at trigger, so
  // it reflects the last real edit; created_at is the pre-0116 fallback.
  const teamUrls: MetadataRoute.Sitemap = teamMembers
    .filter(
      (m): m is { slug: string; updated_at: string | null; created_at: string | null } =>
        Boolean(m.slug),
    )
    .map((m) =>
      entry(`/about/team/${m.slug}`, {
        lastModified: sitemapLastmod(m.updated_at, m.created_at),
        changeFrequency: 'monthly',
        priority: 0.4,
      }),
    );

  // Listing/informational pages are evergreen navigation, not resources with a
  // single significant-update time — so they carry a changeFrequency/priority
  // hint but NO lastmod (a fabricated per-deploy timestamp is worse than none).
  return [
    // The canonical homepage is the locale root — /home 308s here. Always
    // advertised: it is the site, not a collection listing.
    entry('/', { changeFrequency: 'daily', priority: 1.0 }),
    ...hub('/catalogs', catalogCount ?? 0, { changeFrequency: 'weekly', priority: 0.8 }),
    // Informational pages — rarely change, and each is real content regardless
    // of how many resources the library holds, so none of them is gated.
    ...[
      '/about',
      '/about/collection',
      '/about/committee',
      '/about/our-journey',
      '/about/rules',
      '/about/team',
      '/about/timings',
      '/contact',
      '/policy',
      '/privacy',
    ].map((path) => entry(path, { changeFrequency: 'monthly', priority: 0.4 })),
    ...teamUrls,
  ];
}

// ── books ────────────────────────────────────────────────────────────────────

async function bookEntries(supabase: Supabase): Promise<MetadataRoute.Sitemap> {
  const books = await fetchAllRows<{ slug: string; published_at: string | null; created_at: string | null; updated_at: string | null }>(
    (from, to) =>
      supabase
        .from('books')
        .select('slug, published_at, created_at, updated_at')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .order(TIEBREAK, { ascending: true })
        .range(from, to),
  );
  // Books gained updated_at + a BEFORE UPDATE trigger in migration 0077, so it
  // reflects the last real admin edit; fall back to publication, then creation.
  const bookUrls: MetadataRoute.Sitemap = books.map((book) =>
    entry(`/books/${book.slug}`, {
      lastModified: sitemapLastmod(book.updated_at, book.published_at, book.created_at),
      changeFrequency: 'monthly',
      priority: 0.8,
    }),
  );
  return [...hub('/books', books.length, { changeFrequency: 'daily', priority: 0.9 }), ...bookUrls];
}

// ── theses ───────────────────────────────────────────────────────────────────

async function thesisEntries(supabase: Supabase): Promise<MetadataRoute.Sitemap> {
  type ReportRow = {
    id: string;
    slug: string | null;
    published_at: string | null;
    created_at: string | null;
    updated_at?: string | null;
  };
  const loadReports = (columns: string) =>
    fetchAllRows<ReportRow>((from, to) =>
      supabase
        .from('research_reports')
        .select(columns)
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .order(TIEBREAK, { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: ReportRow[] | null }>,
    );
  // Two attempts, like fetchAuthorRows: `updated_at` is 0075's column, and the
  // hosted database has drifted from the migration chain before. A missing
  // column must cost the lastmod, never every thesis URL.
  const withUpdated = await loadReports('id, slug, published_at, created_at, updated_at');
  const reports = withUpdated.length > 0 ? withUpdated : await loadReports('id, slug, published_at, created_at');
  // lastmod is when the RECORD last changed (updated_at, 0075), not its
  // academic publication date: `published_at` is often a year entered as
  // 1 January, and it put a placeholder `2023-01-01T00:00:00+00:00` in this
  // sitemap (docs/seo/AUDIT-VERIFICATION.md F6).
  const reportUrls: MetadataRoute.Sitemap = reports.map((r) =>
    entry(`/theses/${r.slug ?? r.id}`, {
      lastModified: sitemapLastmod(r.updated_at ?? null, r.created_at),
      changeFrequency: 'monthly',
      priority: 0.9,
    }),
  );
  // /theses/summary rides on the thesis count because it is a view over
  // exactly those rows.
  return [
    ...hub('/theses', reports.length, { changeFrequency: 'daily', priority: 0.9 }),
    ...hub('/theses/summary', reports.length, { changeFrequency: 'daily', priority: 0.6 }),
    ...reportUrls,
  ];
}

// ── journals: the hub, journals, issue lists, issues and articles ────────────

async function journalEntries(supabase: Supabase): Promise<MetadataRoute.Sitemap> {
  const publications = await fetchAllRows<{ slug: string; updated_at: string | null; created_at: string | null; journal_id?: string | null }>(
    (from, to) =>
      supabase
        .from('publications')
        .select('slug, updated_at, created_at, journal_id')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .order(TIEBREAK, { ascending: true })
        .range(from, to),
  );

  // Article URLs never depend on a journal row (/journals/articles/<slug>), so
  // a failed journal read below can drop journal URLs but never these.
  const publicationUrls: MetadataRoute.Sitemap = publications.map((p) =>
    entry(articlePath(p.slug), {
      lastModified: sitemapLastmod(p.updated_at, p.created_at),
      changeFrequency: 'monthly',
      priority: 0.9,
    }),
  );

  // Read directly, not through lib/journals/data.ts: that module is cached
  // under request-scoped React cache() and throws on failure, while here a
  // failure must degrade to "no journal URLs this run" (null), never to
  // "there are no journals". journalSitemapPaths() owns the rule.
  const [journalRows, issueRows] = await Promise.all([
    supabase
      .from('journals')
      .select('id, slug, is_published, is_indexable, updated_at')
      .eq('is_published', true)
      .then(({ data, error }) => {
        if (error) console.warn('[sitemap] journals unavailable — journal URLs omitted this run:', error.message);
        return error ? null : ((data ?? []) as SitemapJournal[]);
      }),
    supabase
      .from('journal_issues_public')
      .select('slug, journal_id')
      .then(({ data, error }) => {
        if (error) console.warn('[sitemap] journal issues unavailable — issue URLs omitted this run:', error.message);
        return error ? null : ((data ?? []) as SitemapIssue[]);
      }),
  ]);
  const journalUrls: MetadataRoute.Sitemap = journalSitemapPaths(
    journalRows,
    publications.map((p) => ({ journal_id: p.journal_id ?? null, updated_at: p.updated_at ?? p.created_at })),
    issueRows,
  ).map((j) =>
    entry(j.path, {
      lastModified: j.lastModified,
      changeFrequency: j.kind === 'issue' ? 'monthly' : 'weekly',
      priority: j.kind === 'journal' ? 0.7 : j.kind === 'issues' ? 0.5 : 0.6,
    }),
  );

  return [
    ...hub('/journals', publications.length, { changeFrequency: 'daily', priority: 0.9 }),
    ...journalUrls,
    ...publicationUrls,
  ];
}

// ── learning paths ───────────────────────────────────────────────────────────

async function pathEntries(supabase: Supabase): Promise<MetadataRoute.Sitemap> {
  const paths = await fetchAllRows<{ slug: string; updated_at: string | null; created_at: string | null }>(
    (from, to) =>
      supabase
        .from('learning_paths')
        .select('slug, updated_at, created_at')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .order(TIEBREAK, { ascending: true })
        .range(from, to),
  );
  const pathUrls: MetadataRoute.Sitemap = paths.map((p) =>
    entry(`/paths/${p.slug}`, {
      lastModified: sitemapLastmod(p.updated_at, p.created_at),
      changeFrequency: 'weekly',
      priority: 0.7,
    }),
  );
  return [...hub('/paths', paths.length, { changeFrequency: 'weekly', priority: 0.8 }), ...pathUrls];
}

// ── subjects ─────────────────────────────────────────────────────────────────

async function subjectEntries(): Promise<MetadataRoute.Sitemap> {
  // Subjects come from lib/subjects, NOT a raw `categories` scan. The raw
  // table includes subjects with no public resources attached, and their
  // pages render "No public resources are attached to this subject yet" —
  // a soft-404 (docs/SEO-V2-AUDIT.md F-1). Since SEO 3.3 the list applies the
  // §5 DEPTH gate too, and the page's robots meta is decided by the same
  // subjectVisibility() call — so this list and the set of hubs answering
  // `index, follow` are one set by construction, not two that happen to agree.
  const subjects = await getIndexableSubjects();

  // No lastmod: `categories` carries only created_at, and a subject page's
  // real significant-update time is when a resource was attached to it — which
  // that column does not record. An untruthful lastmod is worse than none.
  const subjectUrls: MetadataRoute.Sitemap = subjects.map((s) =>
    entry(`/subjects/${s.slug}`, {
      changeFrequency: 'weekly',
      priority: 0.6,
    }),
  );

  // The subject hub itself is a real destination once any subject qualifies.
  const subjectHubUrls: MetadataRoute.Sitemap =
    subjects.length > 0 ? [entry('/subjects', { changeFrequency: 'weekly', priority: 0.8 })] : [];
  return [...subjectHubUrls, ...subjectUrls];
}

// ── authors ──────────────────────────────────────────────────────────────────

async function authorEntries(supabase: Supabase): Promise<MetadataRoute.Sitemap> {
  // `slug` is optional in the select on purpose. Before migration 0125 the
  // column does not exist and the query errors, which fetchAllRows turns into
  // [] — and an empty author list would silently drop every profile URL from
  // the sitemap. fetchAuthorRows() retries without it, so the worst case is
  // the pre-0125 behaviour (slugs derived from names) rather than no entries.
  const [authors, publicationAuthors] = await Promise.all([
    fetchAuthorRows<{ name: string; slug?: string | null; created_at: string | null }>(supabase, 'authors', 'name'),
    fetchAuthorRows<{ full_name: string; slug?: string | null; created_at: string | null }>(
      supabase,
      'publication_authors',
      'full_name',
    ),
  ]);

  // The stored profile slug wins over the name-derived one: an admin who
  // corrects an author's slug must not have the sitemap keep advertising the
  // URL that no longer resolves. A row whose `slug` column exists but is NULL
  // is deliberately DROPPED rather than given a name-derived URL: middleware
  // gates /authors/<slug> on author_profiles_public (0126), which is
  // `where slug is not null`, so that URL is a hard 404 at the edge.
  // addressableAuthorSlug() owns the rule.
  //
  // A COMPOSITE byline names several people, so since 0147 each of them has
  // their own row and the shared URL answers `noindex, follow` as a
  // disambiguation page. Advertising it here would submit for indexing a URL
  // whose page declines to be indexed. The page and this file both ask
  // normalizeByline().
  const composite = (name: string | null | undefined) =>
    normalizeByline(name).contributors.length > 1;

  // A name that identifies NOBODY — an operating-system account, a program's
  // own name, a placeholder, a telephone number — is excluded here as well as
  // by the roster below, and the duplication is deliberate. The roster read
  // can fail, and when it does this file emits UNFILTERED rather than drop
  // every author URL (see `degraded`). That fallback is sound for the works
  // rule, which needs a database to answer; it is not sound for this one,
  // which needs nothing (lib/resources/contributor-trust.ts).
  const unidentified = (name: string | null | undefined) =>
    normalizeByline(name).unidentified;

  const authorSlugSet = new Map<string, string | null>();
  for (const a of authors) {
    if (composite(a.name) || unidentified(a.name)) continue;
    const slug = addressableAuthorSlug(a.slug, a.name);
    if (slug) authorSlugSet.set(slug, a.created_at ?? null);
  }
  for (const a of publicationAuthors) {
    if (composite(a.full_name) || unidentified(a.full_name)) continue;
    const slug = addressableAuthorSlug(a.slug, a.full_name);
    if (slug && !authorSlugSet.has(slug)) authorSlugSet.set(slug, a.created_at ?? null);
  }

  // An author with no public works is a soft-404. The sitemap asks the
  // DIRECTORY'S question, so the two cannot disagree. getAuthorDirectory()
  // swallows its own errors and answers [] — so an empty roster beside a
  // non-empty row set is treated as UNKNOWN and the unfiltered set is emitted.
  const listed = await getListedAuthors();
  // Phase 2.6 (D2): only pages that may be search results — enough works, or
  // an approved biography. The author page asks the same question with the
  // same directory figures, so the two cannot disagree.
  const minWorks = authorIndexMinWorks();
  const indexable = new Set(listed.filter((a) => authorIsIndexable(a, minWorks)).map((a) => a.slug));
  const { entries: withWorks, degraded } = authorUrlsWithWorks(
    authorSlugSet,
    new Set(listed.map((a) => a.slug).filter(Boolean)),
    (slug) => indexable.has(slug),
  );
  if (degraded) {
    console.warn(
      `[sitemap] author roster came back empty for ${authorSlugSet.size} author row(s) — ` +
        'emitting unfiltered rather than dropping every author URL',
    );
  }

  const authorUrls: MetadataRoute.Sitemap = withWorks.map(([slug, createdAt]) =>
    entry(`/authors/${slug}`, {
      lastModified: sitemapLastmod(createdAt),
      changeFrequency: 'monthly',
      priority: 0.5,
    }),
  );

  const authorHubUrls: MetadataRoute.Sitemap =
    authorUrls.length > 0
      ? [entry('/authors', { changeFrequency: 'weekly', priority: 0.8 })]
      : [];
  return [...authorHubUrls, ...authorUrls];
}

// ── posts ────────────────────────────────────────────────────────────────────

async function postEntries(supabase: Supabase): Promise<MetadataRoute.Sitemap> {
  const posts = await fetchAllRows<{ slug: string; created_at: string | null; updated_at: string | null }>(
    (from, to) =>
      supabase
        .from('posts')
        .select('slug, created_at, updated_at')
        .eq('is_published', true)
        // Only fully public posts belong in the sitemap. Service client
        // bypasses RLS, so 'admin_only' AND 'unlisted' (direct-link-only,
        // deliberately kept out of the public /posts index) are both excluded
        // here — matching lib/posts-data.ts's listing filter.
        .eq('visibility', 'public')
        .order('created_at', { ascending: false })
        .order(TIEBREAK, { ascending: true })
        .range(from, to),
  );
  const postUrls: MetadataRoute.Sitemap = posts.map((post) =>
    entry(`/posts/${post.slug}`, {
      lastModified: sitemapLastmod(post.updated_at, post.created_at),
      changeFrequency: 'monthly',
      priority: 0.7,
    }),
  );
  return [...hub('/posts', posts.length, { changeFrequency: 'daily', priority: 0.8 }), ...postUrls];
}

async function buildEntries(type: SitemapType): Promise<MetadataRoute.Sitemap> {
  const supabase = createServiceClient();
  switch (type) {
    case 'static':
      return staticEntries(supabase);
    case 'books':
      return bookEntries(supabase);
    case 'theses':
      return thesisEntries(supabase);
    case 'journals':
      return journalEntries(supabase);
    case 'paths':
      return pathEntries(supabase);
    case 'subjects':
      return subjectEntries();
    case 'authors':
      return authorEntries(supabase);
    case 'posts':
      return postEntries(supabase);
  }
}

// The sitemap protocol caps a single file at 50,000 URLs. The largest child
// (books) is at ~2,000; the guard exists so a runaway type can never emit an
// invalid file.
const MAX_SITEMAP_ENTRIES = 50_000;

/**
 * Validate before serving. Every rule here catches a SILENT failure: the XML
 * stays well-formed and the route still returns 200, so the only symptom is
 * weeks of confusing Search Console coverage.
 *
 * Severity is per-rule, not per-issue. A URL that must not be advertised is
 * dropped; a URL that is fine but carries an untrustworthy `lastmod` keeps its
 * place and loses the field.
 */
export function validateSitemapEntries(type: SitemapType, entries: MetadataRoute.Sitemap): MetadataRoute.Sitemap {
  const FATAL_RULES = new Set([
    'unparseable-url',
    'wrong-origin',
    'insecure-scheme',
    'canonical-has-query',
    'canonical-has-fragment',
    'trailing-slash',
    'private-url-in-sitemap',
  ]);
  const LASTMOD_RULES = new Set(['invalid-lastmod', 'future-lastmod']);

  const problems: string[] = [];
  const seen = new Set<string>();
  const validated: MetadataRoute.Sitemap = [];

  for (const item of entries) {
    if (seen.has(item.url)) {
      problems.push(`duplicate-url:${item.url}`);
      continue;
    }
    seen.add(item.url);

    const issues = validateSitemapEntry(item);
    if (issues.length === 0) {
      validated.push(item);
      continue;
    }
    for (const issue of issues) problems.push(`${issue.rule}:${item.url}`);

    if (issues.some((i) => FATAL_RULES.has(i.rule))) continue;

    if (issues.some((i) => LASTMOD_RULES.has(i.rule))) {
      const repaired = { ...item };
      delete repaired.lastModified;
      validated.push(repaired);
      continue;
    }
    // Everything else is reported but not grounds for withholding the URL.
    validated.push(item);
  }

  if (problems.length > 0) {
    console.warn(
      `sitemap/${type}: ${problems.length} issue(s) — ${problems.slice(0, 10).join(', ')}` +
        (problems.length > 10 ? ` …and ${problems.length - 10} more` : ''),
    );
  }

  if (validated.length > MAX_SITEMAP_ENTRIES) {
    console.warn(`sitemap/${type}: ${validated.length} entries exceeds ${MAX_SITEMAP_ENTRIES}; truncating.`);
    return validated.slice(0, MAX_SITEMAP_ENTRIES);
  }
  return validated;
}

/** Non-production deployments never publish a sitemap (indexing there is
 *  opt-in — lib/seo/indexing.ts), and the admin kill switch empties it too. */
export async function sitemapIsPublished(): Promise<boolean> {
  return isIndexableEnvironment() && (await getSiteConfig()).seo.indexingEnabled;
}

/**
 * The validated entries of one child, cached for the revalidate window and
 * shared by the index and the child route, so an hour's traffic costs one read
 * per type. Tagged `sitemap`.
 */
export function getSitemapEntries(type: SitemapType): Promise<MetadataRoute.Sitemap> {
  return unstable_cache(
    async () => validateSitemapEntries(type, await buildEntries(type)),
    ['sitemap-entries', type],
    { revalidate: SITEMAP_REVALIDATE_SECONDS, tags: ['sitemap'] },
  )();
}
