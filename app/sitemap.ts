import { MetadataRoute } from 'next';
import { createServiceClient } from '@/lib/supabase/server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createServiceClient();

  const [{ data: books }, { data: posts }] = await Promise.all([
    supabase
      .from('books')
      .select('slug, published_at, updated_at')
      .eq('is_published', true),
    supabase
      .from('posts')
      .select('slug, created_at, updated_at')
      .eq('is_published', true),
  ]);

  const bookUrls: MetadataRoute.Sitemap = (books || []).map((book) => ({
    url: `${SITE_URL}/books/${book.slug}`,
    lastModified: book.updated_at || book.published_at || new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const postUrls: MetadataRoute.Sitemap = (posts || []).map((post) => ({
    url: `${SITE_URL}/posts/${post.slug}`,
    lastModified: post.updated_at || post.created_at || new Date(),
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const staticUrls: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}`,
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
      url: `${SITE_URL}/catalogs`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/posts`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];

  return [...staticUrls, ...bookUrls, ...postUrls];
}
