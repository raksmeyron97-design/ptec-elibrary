import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo/site';

const privatePaths = [
  '/admin/',
  '/api/',
  '/dashboard/',
  '/auth/',
  '/login',
  '/offline-books',
  '/lists',
  // Khmer locale-prefixed equivalents — /dashboard etc. also resolve under /km.
  '/km/dashboard/',
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
  '/km/subjects/',
  '/km/authors/',
  '/km/paths/',
  '/km/about/',
  '/km/contact',
  '/km/policy',
];

export default function robots(): MetadataRoute.Robots {
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
