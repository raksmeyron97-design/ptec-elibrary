import { MetadataRoute } from 'next';
import { createServiceClient } from '@/lib/supabase/server';
import { SITE_URL } from '@/lib/seo/site';

// Revalidate hourly so the sitemap picks up newly published content
// without being frozen at build time.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServiceClient();

  const [
    { data: books },
    { data: posts },
    { data: reports },
    { data: catalogBooks },
    { data: publications },
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
      .select('id, published_at, created_at')
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
  ]);

  const bookUrls: MetadataRoute.Sitemap = (books ?? []).map((book) => ({
    url: `${SITE_URL}/books/${book.slug}`,
    lastModified: book.published_at ?? book.created_at ?? new Date(),
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  const postUrls: MetadataRoute.Sitemap = (posts ?? []).map((post) => ({
    url: `${SITE_URL}/posts/${post.slug}`,
    lastModified: post.updated_at ?? post.created_at ?? new Date(),
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const reportUrls: MetadataRoute.Sitemap = (reports ?? []).map((r) => ({
    url: `${SITE_URL}/theses/${r.id}`,
    lastModified: r.published_at ?? r.created_at ?? new Date(),
    changeFrequency: 'monthly',
    priority: 0.9,
  }));

  const catalogUrls: MetadataRoute.Sitemap = (catalogBooks ?? []).map((b) => ({
    url: `${SITE_URL}/catalogs/${b.slug}`,
    lastModified: b.updated_at ?? b.created_at ?? new Date(),
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  const publicationUrls: MetadataRoute.Sitemap = (publications ?? []).map((p) => ({
    url: `${SITE_URL}/publications/${p.slug}`,
    lastModified: p.updated_at ?? p.created_at ?? new Date(),
    changeFrequency: 'monthly',
    priority: 0.9,
  }));

  const staticUrls: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/home`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/books`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/theses`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/catalogs`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/posts`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/publications`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
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
      url: `${SITE_URL}${path}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    })),
  ];

  return [
    ...staticUrls,
    ...reportUrls,
    ...publicationUrls,
    ...bookUrls,
    ...postUrls,
    ...catalogUrls,
  ];
}
