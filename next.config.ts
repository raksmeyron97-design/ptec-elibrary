import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb", // ដំឡើងទៅ 50MB
    },
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
      // Cloudflare R2 bucket
      {
        protocol: "https",
        hostname: "pub-a07b6a3e6c63466392999efa42558aed.r2.dev",
      },
    ],
  },
};





export default nextConfig;