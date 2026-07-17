import { MetadataRoute } from 'next';
import { createServiceClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/books';
import { sitemapLastmod } from '@/lib/seo/book-seo';
import { localeUrls } from '@/lib/seo/alternates';
import { isIndexableEnvironment } from '@/lib/seo/indexing';
import { getSiteConfig } from '@/lib/system-settings/config';

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
    categories,
    authors,
    publicationAuthors,
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
          // Service client bypasses RLS, so the 'admin_only' visibility tier
          // (internal-only posts) must be excluded explicitly here — the
          // anon client gets this for free via the posts RLS policy.
          .neq('visibility', 'admin_only')
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
    fetchAllRows<{ slug: string; created_at: string | null }>(
      (from, to) =>
        supabase
          .from('categories')
          .select('slug, created_at')
          .order('name', { ascending: true })
          .range(from, to),
    ),
    fetchAllRows<{ name: string; created_at: string | null }>(
      (from, to) =>
        supabase
          .from('authors')
          .select('name, created_at')
          .order('name', { ascending: true })
          .range(from, to),
    ),
    fetchAllRows<{ full_name: string; created_at: string | null }>(
      (from, to) =>
        supabase
          .from('publication_authors')
          .select('full_name, created_at')
          .order('full_name', { ascending: true })
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

  const subjectUrls: MetadataRoute.Sitemap = categories.map((c) =>
    entry(`/subjects/${c.slug}`, {
      lastModified: sitemapLastmod(c.created_at),
      changeFrequency: 'weekly',
      priority: 0.6,
    }),
  );

  const authorSlugSet = new Map<string, string | null>();
  for (const a of authors) {
    const slug = slugify(a.name);
    if (slug) authorSlugSet.set(slug, a.created_at ?? null);
  }
  for (const a of publicationAuthors) {
    const slug = slugify(a.full_name);
    if (slug && !authorSlugSet.has(slug)) authorSlugSet.set(slug, a.created_at ?? null);
  }
  const authorUrls: MetadataRoute.Sitemap = [...authorSlugSet.entries()].map(([slug, createdAt]) =>
    entry(`/authors/${slug}`, {
      lastModified: sitemapLastmod(createdAt),
      changeFrequency: 'monthly',
      priority: 0.5,
    }),
  );

  return [
    ...staticUrls,
    ...reportUrls,
    ...publicationUrls,
    ...bookUrls,
    ...postUrls,
    ...catalogUrls,
    ...pathUrls,
    ...subjectUrls,
    ...authorUrls,
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Non-production deployments never publish a sitemap (indexing there is
  // opt-in — lib/seo/indexing.ts), and the admin kill switch empties it too.
  const indexable = isIndexableEnvironment() && (await getSiteConfig()).seo.indexingEnabled;
  if (!indexable) return [];

  const entries = await buildEntries();
  if (entries.length > MAX_SITEMAP_ENTRIES) {
    console.warn(
      `sitemap: ${entries.length} entries exceeds the ${MAX_SITEMAP_ENTRIES} sitemap-file limit; ` +
        `truncating. Switch to generateSitemaps() chunking (see git history for the prior attempt).`,
    );
    return entries.slice(0, MAX_SITEMAP_ENTRIES);
  }
  return entries;
}
