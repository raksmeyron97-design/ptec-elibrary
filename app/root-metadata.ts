import type { Metadata, Viewport } from "next";
import { SITE_URL } from "@/lib/seo/site";
import { defaultRobots } from "@/lib/seo/indexing";
import { getSiteConfig } from "@/lib/system-settings/config";

// Shared by every root layout (see components/layout/RootShell.tsx for why
// there is more than one). Page-level generateMetadata still overrides these.
//
// IDENTITY-FREE ON PURPOSE. The title, description, application name and Open
// Graph site name all come from the PUBLISHED system settings — they used to
// be string literals here, which is why publishing a new library name changed
// the footer but left every social share card and browser tab reading the
// compiled-in value. Use `identityMetadata()` below to layer them on; the
// only things that stay hard-coded are asset paths and the robots policy.
export const rootMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
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
    locale: "en_US",
    alternateLocale: "km_KH",
    images: ["/og-default.png"],
  },
  twitter: {
    card: "summary_large_image",
  },
  // Environment-aware: hard noindex on previews/dev/staging, index only on
  // real production (lib/seo/indexing.ts). The public layout layers the
  // admin-managed kill switch on top; (admin)/(auth) layouts override to a
  // permanent noindex.
  robots: defaultRobots(),
  manifest: "/manifest.webmanifest",
};

/**
 * rootMetadata + the published organization identity, for the root layouts
 * that are dynamic anyway (auth, admin, offline shell, global 404).
 *
 * `locale` picks the site description; pass a `titleSuffix`-free title to use
 * the published site title as-is, or a `title` to render "<title> · <library>".
 */
export async function identityMetadata(
  locale: "en" | "km" = "en",
  title?: string,
): Promise<Metadata> {
  const cfg = await getSiteConfig();
  return {
    ...rootMetadata,
    title: title ? `${title} · ${cfg.libraryName.en}` : cfg.seo.siteTitle,
    description:
      locale === "km"
        ? cfg.seo.siteDescription.km
        : cfg.seo.siteDescription.en,
    applicationName: cfg.libraryName.en,
    openGraph: { ...rootMetadata.openGraph, siteName: cfg.seo.siteName },
  };
}

export const rootViewport: Viewport = {
  themeColor: "#172554",
  // Edge-to-edge on notched phones (esp. the installed PWA). Every fixed
  // surface must pad with env(safe-area-inset-*): navbar top, mobile drawer,
  // MobileBottomNav (already does).
  viewportFit: "cover",
};
