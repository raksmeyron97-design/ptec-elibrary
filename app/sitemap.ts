import { MetadataRoute } from 'next';
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
import { normalizeByline } from '@/lib/resources/contributor-identity';
import { articlePath } from '@/lib/journals/urls';
import { journalSitemapPaths, type SitemapIssue, type SitemapJournal } from '@/lib/journals/sitemap';

// Revalidate hourly so the sitemap picks up newly published content
// without being frozen at build time.
export const revalidate = 3600;

// English stays unprefixed (the canonical entry); Khmer is exposed via the
// alternates.languages field so both locales stay discoverable without
// doubling the number of sitemap entries.
function withAlternates(path: string) {
  const { en, km } = localeUrls(path);
  return {
    url: en,
    alternates: {
      languages: { en, km },
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
// by the `seen` guard below) or on none at all (never fetched). Nothing errors.
// The sitemap just answers a different question each time it revalidates.
//
// `created_at` is not unique here: `now()` is transaction-scoped, so every row
// of a bulk import shares one timestamp to the microsecond — and this library
// is bulk-imported. The symptom only appears once a table crosses PAGE_SIZE,
// which `books` did as the collection grew past 1,000.
//
// Measured on production 2026-09-16, two fetches of /sitemap.xml one
// revalidation apart, against a collection that did not change:
//
//   fetch 1   2,045 URLs — 1,690 of 1,695 books
//   fetch 2   2,048 URLs — 1,695 of 1,695 books
//
// The five books missing from fetch 1 (`/books/chicken-raising` among them)
// each answered 200 with `index, follow` and a self-canonical, and each was
// listed on /books. No rule in this file excludes them and no validation rule
// below drops them, which leaves the sweep as the only remaining explanation.
// Adding `id` — the primary
// key, unique by definition — as the LAST ordering term makes the total order
// deterministic, so the same collection always produces the same sitemap.
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
  supabase: ReturnType<typeof createServiceClient>,
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

// The sitemap protocol caps a single file at 50,000 URLs. The library is
// nowhere near that (a few hundred entries today), and `generateSitemaps()`
// would move this route from /sitemap.xml to /sitemap/0.xml — breaking the
// robots.ts reference — so we keep the single-file export and just guard
// against ever emitting an invalid oversized file.
const MAX_SITEMAP_ENTRIES = 50_000;

async function buildEntries(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServiceClient();

  const [
    books,
    posts,
    reports,
    catalogBooks,
    publications,
    paths,
    subjects,
    authors,
    publicationAuthors,
    teamMembers,
  ] = await Promise.all([
    fetchAllRows<{ slug: string; published_at: string | null; created_at: string | null; updated_at: string | null }>(
      (from, to) =>
        supabase
          .from('books')
          .select('slug, published_at, created_at, updated_at')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .order(TIEBREAK, { ascending: true })
          .range(from, to),
    ),
    fetchAllRows<{ slug: string; created_at: string | null; updated_at: string | null }>(
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
    ),
    fetchAllRows<{ id: string; slug: string | null; published_at: string | null; created_at: string | null }>(
      (from, to) =>
        supabase
          .from('research_reports')
          .select('id, slug, published_at, created_at')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .order(TIEBREAK, { ascending: true })
          .range(from, to),
    ),
    fetchAllRows<{ slug: string; updated_at: string | null; created_at: string | null }>(
      (from, to) =>
        supabase
          .from('catalog_books')
          .select('slug, updated_at, created_at')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .order(TIEBREAK, { ascending: true })
          .range(from, to),
    ),
    fetchAllRows<{ slug: string; updated_at: string | null; created_at: string | null; journal_id?: string | null }>(
      (from, to) =>
        supabase
          .from('publications')
          .select('slug, updated_at, created_at, journal_id')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .order(TIEBREAK, { ascending: true })
          .range(from, to),
    ),
    fetchAllRows<{ slug: string; updated_at: string | null; created_at: string | null }>(
      (from, to) =>
        supabase
          .from('learning_paths')
          .select('slug, updated_at, created_at')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .order(TIEBREAK, { ascending: true })
          .range(from, to),
    ),
    // Subjects come from lib/subjects, NOT a raw `categories` scan. The raw
    // table includes subjects with no public resources attached, and their
    // pages render "No public resources are attached to this subject yet" —
    // a soft-404. Ten such URLs were live in this sitemap before V2
    // (docs/SEO-V2-AUDIT.md F-1). getIndexableSubjects() applies the same
    // matching rule the page itself uses, so the sitemap can never advertise a
    // URL the page will render empty.
    //
    // Since SEO 3.3 it applies the §5 DEPTH gate too, and the page's robots
    // meta is decided by the same subjectVisibility() call — so this list and
    // the set of hubs answering `index, follow` are one set by construction,
    // not two that happen to agree. A one-book hub was in both before.
    getIndexableSubjects(),
    // `slug` is optional in the select on purpose. Before migration 0125 the
    // column does not exist and the query errors, which fetchAllRows turns into
    // [] — and an empty author list would silently drop every profile URL from
    // the sitemap. fetchAuthorRows() retries without it, so the worst case is
    // the pre-0125 behaviour (slugs derived from names) rather than no entries.
    fetchAuthorRows<{ name: string; slug?: string | null; created_at: string | null }>(
      supabase,
      'authors',
      'name',
    ),
    fetchAuthorRows<{ full_name: string; slug?: string | null; created_at: string | null }>(
      supabase,
      'publication_authors',
      'full_name',
    ),
    // The privacy-enforcing view already restricts this to published members
    // in active sections. Before migration 0114 the `slug` column does not
    // exist and this select errors — fetchAllRows then returns [], which is
    // exactly right: no profile pages exist yet either.
    fetchAllRows<{ slug: string | null; updated_at: string | null; created_at: string | null }>(
      (from, to) =>
        supabase
          .from('team_members_public')
          .select('slug, updated_at, created_at')
          .order('created_at', { ascending: true })
          .order(TIEBREAK, { ascending: true })
          .range(from, to),
    ),
  ]);

  // Books gained updated_at + a BEFORE UPDATE trigger in migration 0077, so it
  // reflects the last real admin edit; fall back to publication, then creation.
  const bookUrls: MetadataRoute.Sitemap = books.map((book) =>
    entry(`/books/${book.slug}`, {
      lastModified: sitemapLastmod(book.updated_at, book.published_at, book.created_at),
      changeFrequency: 'monthly',
      priority: 0.8,
    }),
  );

  const postUrls: MetadataRoute.Sitemap = posts.map((post) =>
    entry(`/posts/${post.slug}`, {
      lastModified: sitemapLastmod(post.updated_at, post.created_at),
      changeFrequency: 'monthly',
      priority: 0.7,
    }),
  );

  const reportUrls: MetadataRoute.Sitemap = reports.map((r) =>
    entry(`/theses/${r.slug ?? r.id}`, {
      lastModified: sitemapLastmod(r.published_at, r.created_at),
      changeFrequency: 'monthly',
      priority: 0.9,
    }),
  );

  const catalogUrls: MetadataRoute.Sitemap = catalogBooks.map((b) =>
    entry(`/catalogs/${b.slug}`, {
      lastModified: sitemapLastmod(b.updated_at, b.created_at),
      changeFrequency: 'weekly',
      priority: 0.6,
    }),
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

  // Listing/informational pages are evergreen navigation, not resources with a
  // single significant-update time — so they carry a changeFrequency/priority
  // hint but NO lastmod (a fabricated per-deploy timestamp is worse than none).
  //
  // COLLECTION HUBS ARE CONDITIONAL. A hub with nothing to list renders an
  // empty state ("No publications are currently available", "No learning paths
  // published yet") — the same soft-404 as an empty subject page, and the same
  // reason subjectHubUrls/authorHubUrls below are already gated on their
  // contents. /publications and /paths were both live, indexable and in this
  // sitemap with zero rows behind them (verified on production 2026-09-09);
  // they sat in this array rather than being gated because the rule had only
  // ever been applied to the two hubs that were added after it was learned.
  //
  // The counts come from the arrays this function already fetched, so gating
  // every hub costs no additional query. /theses/summary rides on the thesis
  // count because it is a view over exactly those rows.
  const hub = (
    path: string,
    count: number,
    opts: { changeFrequency: Entry['changeFrequency']; priority: number },
  ): MetadataRoute.Sitemap => (count > 0 ? [entry(path, opts)] : []);

  const staticUrls: MetadataRoute.Sitemap = [
    // The canonical homepage is the locale root — /home 308s here. Always
    // advertised: it is the site, not a collection listing.
    entry('/', { changeFrequency: 'daily', priority: 1.0 }),
    ...hub('/books', books.length, { changeFrequency: 'daily', priority: 0.9 }),
    ...hub('/theses', reports.length, { changeFrequency: 'daily', priority: 0.9 }),
    ...hub('/theses/summary', reports.length, { changeFrequency: 'daily', priority: 0.6 }),
    ...hub('/catalogs', catalogBooks.length, { changeFrequency: 'weekly', priority: 0.8 }),
    ...hub('/posts', posts.length, { changeFrequency: 'daily', priority: 0.8 }),
    ...hub('/journals', publications.length, { changeFrequency: 'daily', priority: 0.9 }),
    ...hub('/paths', paths.length, { changeFrequency: 'weekly', priority: 0.8 }),
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
  ];

  const pathUrls: MetadataRoute.Sitemap = paths.map((p) =>
    entry(`/paths/${p.slug}`, {
      lastModified: sitemapLastmod(p.updated_at, p.created_at),
      changeFrequency: 'weekly',
      priority: 0.7,
    }),
  );

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

  // The stored profile slug wins over the name-derived one: an admin who
  // corrects an author's slug must not have the sitemap keep advertising the
  // URL that no longer resolves.
  //
  // A row whose `slug` column exists but is NULL is deliberately DROPPED
  // rather than given a name-derived URL: middleware gates /authors/<slug> on
  // author_profiles_public (0126), which is `where slug is not null`, so that
  // URL is a hard 404 at the edge. 154 of the 157 author URLs this file
  // emitted were exactly that (measured 2026-09-07). addressableAuthorSlug()
  // owns the rule, including why a MISSING column still gets the fallback.
  // A COMPOSITE byline names several people, so since 0147 each of them has
  // their own row and the shared URL answers `noindex, follow` as a
  // disambiguation page. Advertising it here would submit for indexing a URL
  // whose page declines to be indexed — the same contradiction the subject
  // gate exists to prevent, and exactly what this sitemap did for empty
  // subjects before V2. The page and this file must agree, so both ask
  // normalizeByline().
  const composite = (name: string | null | undefined) =>
    normalizeByline(name).contributors.length > 1;

  const authorSlugSet = new Map<string, string | null>();
  for (const a of authors) {
    if (composite(a.name)) continue;
    const slug = addressableAuthorSlug(a.slug, a.name);
    if (slug) authorSlugSet.set(slug, a.created_at ?? null);
  }
  for (const a of publicationAuthors) {
    if (composite(a.full_name)) continue;
    const slug = addressableAuthorSlug(a.slug, a.full_name);
    if (slug && !authorSlugSet.has(slug)) authorSlugSet.set(slug, a.created_at ?? null);
  }

  // An author with no public works is a soft-404, exactly as an empty subject
  // is, and this file emitted one: /authors/kenneth-n-berk-patrick-carey was
  // advertised here while /authors omitted it and the page still answered
  // `index, follow` (docs/SEO-3.3-FINAL-REPORT.md §5.5). Three rules had never
  // met — the sitemap emitted every row, the directory listed only
  // workCount > 0, and the page sent `noindex` only for a slug that does not
  // resolve. The sitemap now asks the DIRECTORY'S question, so the two cannot
  // disagree again.
  //
  // getAuthorDirectory() swallows its own errors and answers [] — so an empty
  // roster is ambiguous: it means "no author has works" OR "the read failed".
  // Filtering on the second reading would drop all 157 author URLs to remove
  // one, which is far worse than the defect. An empty roster beside a
  // non-empty row set is therefore treated as UNKNOWN and the unfiltered set
  // is emitted, the pre-existing behaviour. Same rule as a contributor read
  // reporting `unavailable` rather than an empty byline.
  const listed = await getListedAuthors();
  const { entries: withWorks, degraded } = authorUrlsWithWorks(
    authorSlugSet,
    new Set(listed.map((a) => a.slug).filter(Boolean)),
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

  // Hub pages are advertised only when they have something to list — an empty
  // hub is the same soft-404 as an empty subject page.
  // ── Journals, issue lists and issues (0148) ──
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

  const authorHubUrls: MetadataRoute.Sitemap =
    authorUrls.length > 0
      ? [entry('/authors', { changeFrequency: 'weekly', priority: 0.8 })]
      : [];

  return [
    ...staticUrls,
    ...subjectHubUrls,
    ...authorHubUrls,
    ...reportUrls,
    ...publicationUrls,
    ...journalUrls,
    ...bookUrls,
    ...postUrls,
    ...catalogUrls,
    ...pathUrls,
    ...subjectUrls,
    ...authorUrls,
    ...teamUrls,
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Non-production deployments never publish a sitemap (indexing there is
  // opt-in — lib/seo/indexing.ts), and the admin kill switch empties it too.
  const indexable = isIndexableEnvironment() && (await getSiteConfig()).seo.indexingEnabled;
  if (!indexable) return [];

  const entries = await buildEntries();

  // Validate before serving. Every rule here catches a SILENT failure: the XML
  // stays well-formed and the route still returns 200, so the only symptom is
  // weeks of confusing Search Console coverage. Ten empty subject URLs shipped
  // in this sitemap for exactly that reason (docs/SEO-V2-AUDIT.md F-1).
  //
  // Severity is per-rule, not per-issue. A URL that must not be advertised is
  // dropped; a URL that is fine but carries an untrustworthy `lastmod` keeps
  // its place and loses the field. Dropping a legitimate resource because a
  // timestamp failed to parse would be a worse outcome than the bad timestamp.
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

  for (const entry of entries) {
    if (seen.has(entry.url)) {
      problems.push(`duplicate-url:${entry.url}`);
      continue;
    }
    seen.add(entry.url);

    const issues = validateSitemapEntry(entry);
    if (issues.length === 0) {
      validated.push(entry);
      continue;
    }
    for (const issue of issues) problems.push(`${issue.rule}:${entry.url}`);

    if (issues.some((i) => FATAL_RULES.has(i.rule))) continue;

    if (issues.some((i) => LASTMOD_RULES.has(i.rule))) {
      const repaired = { ...entry };
      delete repaired.lastModified;
      validated.push(repaired);
      continue;
    }
    // Everything else (e.g. a missing locale alternate) is reported but not
    // grounds for withholding the URL from crawlers.
    validated.push(entry);
  }

  if (problems.length > 0) {
    console.warn(
      `sitemap: ${problems.length} issue(s) — ${problems.slice(0, 10).join(', ')}` +
        (problems.length > 10 ? ` …and ${problems.length - 10} more` : ''),
    );
  }

  if (validated.length > MAX_SITEMAP_ENTRIES) {
    console.warn(
      `sitemap: ${validated.length} entries exceeds the ${MAX_SITEMAP_ENTRIES} sitemap-file limit; ` +
        `truncating. Switch to generateSitemaps() chunking (see git history for the prior attempt).`,
    );
    return validated.slice(0, MAX_SITEMAP_ENTRIES);
  }
  return validated;
}
