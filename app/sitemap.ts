import { MetadataRoute } from 'next';
import { createServiceClient } from '@/lib/supabase/server';
import { SITE_URL } from '@/lib/seo/site';
import { slugify } from '@/lib/books';

// Revalidate hourly so the sitemap picks up newly published content
// without being frozen at build time.
export const revalidate = 3600;

// English stays unprefixed (the canonical entry); Khmer is exposed via the
// alternates.languages field so both locales stay discoverable without
// doubling the number of sitemap entries.
function withAlternates(path: string) {
  return {
    url: `${SITE_URL}${path}`,
    alternates: {
      languages: {
        en: `${SITE_URL}${path}`,
        km: `${SITE_URL}/km${path}`,
      },
    },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServiceClient();

  const [
    { data: books },
    { data: posts },
    { data: reports },
    { data: catalogBooks },
    { data: publications },
    { data: paths },
    { data: categories },
    { data: authors },
    { data: publicationAuthors },
  ] = await Promise.all([
    supabase
      .from('books')
      .select('slug, published_at, created_at')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .range(0, 4999),
    supabase
      .from('posts')
      .select('slug, created_at, updated_at')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .range(0, 4999),
    supabase
      .from('research_reports')
      .select('id, slug, published_at, created_at')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .range(0, 4999),
    supabase
      .from('catalog_books')
      .select('slug, updated_at, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .range(0, 4999),
    supabase
      .from('publications')
      .select('slug, updated_at, created_at')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .range(0, 4999),
    supabase
      .from('learning_paths')
      .select('slug, updated_at, created_at')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .range(0, 4999),
    supabase
      .from('categories')
      .select('slug, created_at')
      .order('name', { ascending: true })
      .range(0, 999),
    supabase
      .from('authors')
      .select('name, created_at')
      .order('name', { ascending: true })
      .range(0, 999),
    supabase
      .from('publication_authors')
      .select('full_name, created_at')
      .order('full_name', { ascending: true })
      .range(0, 999),
  ]);

  const bookUrls: MetadataRoute.Sitemap = (books ?? []).map((book) => ({
    ...withAlternates(`/books/${book.slug}`),
    lastModified: book.published_at ?? book.created_at ?? new Date(),
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  const postUrls: MetadataRoute.Sitemap = (posts ?? []).map((post) => ({
    ...withAlternates(`/posts/${post.slug}`),
    lastModified: post.updated_at ?? post.created_at ?? new Date(),
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const reportUrls: MetadataRoute.Sitemap = (reports ?? []).map((r) => ({
    ...withAlternates(`/theses/${r.slug ?? r.id}`),
    lastModified: r.published_at ?? r.created_at ?? new Date(),
    changeFrequency: 'monthly',
    priority: 0.9,
  }));

  const catalogUrls: MetadataRoute.Sitemap = (catalogBooks ?? []).map((b) => ({
    ...withAlternates(`/catalogs/${b.slug}`),
    lastModified: b.updated_at ?? b.created_at ?? new Date(),
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const publicationUrls: MetadataRoute.Sitemap = (publications ?? []).map((p) => ({
    ...withAlternates(`/publications/${p.slug}`),
    lastModified: p.updated_at ?? p.created_at ?? new Date(),
    changeFrequency: 'monthly',
    priority: 0.9,
  }));

  const staticUrls: MetadataRoute.Sitemap = [
    {
      ...withAlternates('/home'),
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      ...withAlternates('/books'),
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      ...withAlternates('/theses'),
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      ...withAlternates('/catalogs'),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      ...withAlternates('/posts'),
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      ...withAlternates('/publications'),
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      ...withAlternates('/paths'),
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
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
    ].map((path) => ({
      ...withAlternates(path),
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    })),
  ];

  const pathUrls: MetadataRoute.Sitemap = (paths ?? []).map((p) => ({
    ...withAlternates(`/paths/${p.slug}`),
    lastModified: p.updated_at ?? p.created_at ?? new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  const subjectUrls: MetadataRoute.Sitemap = (categories ?? []).map((c) => ({
    ...withAlternates(`/subjects/${c.slug}`),
    lastModified: c.created_at ?? new Date(),
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const authorSlugSet = new Map<string, string>();
  for (const a of authors ?? []) {
    const slug = slugify(a.name);
    if (slug) authorSlugSet.set(slug, a.created_at ?? new Date().toISOString());
  }
  for (const a of publicationAuthors ?? []) {
    const slug = slugify(a.full_name);
    if (slug && !authorSlugSet.has(slug)) authorSlugSet.set(slug, a.created_at ?? new Date().toISOString());
  }
  const authorUrls: MetadataRoute.Sitemap = [...authorSlugSet.entries()].map(([slug, createdAt]) => ({
    ...withAlternates(`/authors/${slug}`),
    lastModified: createdAt,
    changeFrequency: 'monthly',
    priority: 0.5,
  }));

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
