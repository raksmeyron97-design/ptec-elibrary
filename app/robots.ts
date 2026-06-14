// app/robots.ts
import { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://library.ptec.edu.kh";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/admin', '/auth', '/login'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}