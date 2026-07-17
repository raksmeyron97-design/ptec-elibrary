import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo/site';
import { isIndexableEnvironment } from '@/lib/seo/indexing';
import { getSiteConfig } from '@/lib/system-settings/config';

// Re-evaluate hourly so the admin indexing kill switch propagates without a
// redeploy (same cadence as the sitemap).
export const revalidate = 3600;

const privatePaths = [
  '/admin/',
  '/api/',
  '/dashboard/',
  '/auth/',
  '/login',
  '/profile',
  '/offline-books',
  '/lists',
  // Khmer locale-prefixed equivalents — /dashboard etc. also resolve under /km.
  '/km/dashboard/',
  '/km/profile',
  '/km/offline-books',
  '/km/lists',
];

const publicLibraryPaths = [
  '/',
  '/llms.txt',
  '/books/',
  '/catalogs/',
  '/theses/',
  '/publications/',
  '/posts/',
  '/subjects/',
  '/authors/',
  '/paths/',
  '/about/',
  '/contact',
  '/policy',
  // Khmer locale-prefixed equivalents (localePrefix: "as-needed" — English
  // stays unprefixed above, Khmer lives under /km).
  '/km',
  '/km/books/',
  '/km/catalogs/',
  '/km/theses/',
  '/km/publications/',
  '/km/posts/',
  '/km/subjects/',
  '/km/authors/',
  '/km/paths/',
  '/km/about/',
  '/km/contact',
  '/km/policy',
];

export default async function robots(): Promise<MetadataRoute.Robots> {
  // Non-production deployments (and the admin kill switch) discourage
  // crawling here, but the PRIMARY protection is the X-Robots-Tag header +
  // metadata robots set by lib/seo/indexing.ts — robots.txt is never the
  // only mechanism. No sitemap reference is advertised in either case.
  const indexable = isIndexableEnvironment() && (await getSiteConfig()).seo.indexingEnabled;
  if (!indexable) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: privatePaths,
      },
      {
        userAgent: [
          'GPTBot',
          'ChatGPT-User',
          'OAI-SearchBot',
          'ClaudeBot',
          'Claude-User',
          'anthropic-ai',
          'Google-Extended',
          'PerplexityBot',
          'Perplexity-User',
          'CCBot',
        ],
        allow: publicLibraryPaths,
        disallow: privatePaths,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
