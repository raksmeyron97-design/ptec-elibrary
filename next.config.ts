import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import withNextIntl from 'next-intl/plugin';

const withNextIntlPlugin = withNextIntl('./i18n/request.ts');

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  turbopack: {},
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      // Supabase Storage
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      // Google Drive direct image CDN (lh3.googleusercontent.com/d/{FILE_ID})
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      // Google avatars
      {
        protocol: "https",
        hostname: "avatars.googleusercontent.com",
      },
      // Google Drive domains
      {
        protocol: "https",
        hostname: "drive.google.com",
      },
      // GitHub avatars
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      // Open Library covers
      {
        protocol: "https",
        hostname: "covers.openlibrary.org",
      },
      // Amazon covers
      {
        protocol: "https",
        hostname: "images-na.ssl-images-amazon.com",
      },
      // Cloudflare R2 public buckets (legacy books bucket)
      {
        protocol: "https",
        hostname: "pub-a07b6a3e6c63466392999efa42558aed.r2.dev",
      },
      // Cloudflare R2 covers bucket
      {
        protocol: "https",
        hostname: "pub-859a15e085144721b664647523d5ccff.r2.dev",
      },
      // Vercel Blob
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};





export default withNextIntlPlugin(withSerwist(nextConfig));