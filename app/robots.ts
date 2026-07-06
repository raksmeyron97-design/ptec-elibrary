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
];

const publicLibraryPaths = [
  '/',
  '/llms.txt',
  '/books/',
  '/catalogs/',
  '/theses/',
  '/publications/',
  '/paths/',
  '/about/',
  '/contact',
  '/policy',
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
