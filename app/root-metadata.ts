import type { Metadata, Viewport } from "next";
import { SITE_URL } from "@/lib/seo/site";

// Shared by every root layout (see components/layout/RootShell.tsx for why
// there is more than one). Page-level generateMetadata still overrides these.
export const rootMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PTEC Digital Teaching Library",
    template: "%s · PTEC Library",
  },
  description:
    "Access free teaching resources, books, and educational materials from the Phnom Penh Teacher Education College (PTEC).",
  applicationName: "PTEC Library",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [
      { url: "/favicon/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  openGraph: {
    type: "website",
    siteName: "PTEC Library",
    locale: "en_US",
    alternateLocale: "km_KH",
    images: ["/og-default.png"],
  },
  twitter: {
    card: "summary_large_image",
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/manifest.webmanifest",
};

export const rootViewport: Viewport = {
  themeColor: "#172554",
  // Edge-to-edge on notched phones (esp. the installed PWA). Every fixed
  // surface must pad with env(safe-area-inset-*): navbar top, mobile drawer,
  // MobileBottomNav (already does).
  viewportFit: "cover",
};
