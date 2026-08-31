import { MetadataRoute } from 'next';
import { createServiceClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/books';
import { sitemapLastmod } from '@/lib/seo/book-seo';
import { localeUrls } from '@/lib/seo/alternates';
import { isIndexableEnvironment } from '@/lib/seo/indexing';
import { getSiteConfig } from '@/lib/system-settings/config';
import { getIndexableSubjects } from '@/lib/subjects';
import { validateSitemapEntry } from '@/lib/seo/validate';

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
          .range(from, to),
    ),
    fetchAllRows<{ id: string; slug: string | null; published_at: string | null; created_at: string | null }>(
      (from, to) =>
        supabase
          .from('research_reports')
          .select('id, slug, published_at, created_at')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .range(from, to),
    ),
    fetchAllRows<{ slug: string; updated_at: string | null; created_at: string | null }>(
      (from, to) =>
        supabase
          .from('catalog_books')
          .select('slug, updated_at, created_at')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .range(from, to),
    ),
    fetchAllRows<{ slug: string; updated_at: string | null; created_at: string | null }>(
      (from, to) =>
        supabase
          .from('publications')
          .select('slug, updated_at, created_at')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .range(from, to),
    ),
    fetchAllRows<{ slug: string; updated_at: string | null; created_at: string | null }>(
      (from, to) =>
        supabase
          .from('learning_paths')
          .select('slug, updated_at, created_at')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .range(from, to),
    ),
    // Subjects come from lib/subjects, NOT a raw `categories` scan. The raw
    // table includes subjects with no public resources attached, and their
    // pages render "No public resources are attached to this subject yet" —
    // a soft-404. Ten such URLs were live in this sitemap before V2
    // (docs/SEO-V2-AUDIT.md F-1). getIndexableSubjects() applies the same
    // matching rule the page itself uses, so the sitemap can never advertise a
    // URL the page will render empty.
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

  const publicationUrls: MetadataRoute.Sitemap = publications.map((p) =>
    entry(`/publications/${p.slug}`, {
      lastModified: sitemapLastmod(p.updated_at, p.created_at),
      changeFrequency: 'monthly',
      priority: 0.9,
    }),
  );

  // Listing/informational pages are evergreen navigation, not resources with a
  // single significant-update time — so they carry a changeFrequency/priority
  // hint but NO lastmod (a fabricated per-deploy timestamp is worse than none).
  const staticUrls: MetadataRoute.Sitemap = [
    // The canonical homepage is the locale root — /home 308s here.
    entry('/', { changeFrequency: 'daily', priority: 1.0 }),
    entry('/books', { changeFrequency: 'daily', priority: 0.9 }),
    entry('/theses', { changeFrequency: 'daily', priority: 0.9 }),
    entry('/theses/summary', { changeFrequency: 'daily', priority: 0.6 }),
    entry('/catalogs', { changeFrequency: 'weekly', priority: 0.8 }),
    entry('/posts', { changeFrequency: 'daily', priority: 0.8 }),
    entry('/publications', { changeFrequency: 'daily', priority: 0.9 }),
    entry('/paths', { changeFrequency: 'weekly', priority: 0.8 }),
    // Informational pages — rarely change
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
  const authorSlugSet = new Map<string, string | null>();
  for (const a of authors) {
    const slug = a.slug || slugify(a.name);
    if (slug) authorSlugSet.set(slug, a.created_at ?? null);
  }
  for (const a of publicationAuthors) {
    const slug = a.slug || slugify(a.full_name);
    if (slug && !authorSlugSet.has(slug)) authorSlugSet.set(slug, a.created_at ?? null);
  }
  const authorUrls: MetadataRoute.Sitemap = [...authorSlugSet.entries()].map(([slug, createdAt]) =>
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
