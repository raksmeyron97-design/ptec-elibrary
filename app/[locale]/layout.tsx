import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import RootShell from "@/components/layout/RootShell";
import { routing } from "@/i18n/routing";
import { rootMetadata, rootViewport } from "@/app/root-metadata";
import { getSiteConfig } from "@/lib/system-settings/config";
import { defaultRobots } from "@/lib/seo/indexing";

export const viewport = rootViewport;

// SEO defaults come from the PUBLISHED system settings, layered over the
// static rootMetadata baseline. getSiteConfig() is unstable_cache'd (no
// cookies/headers), so this keeps every public page prerenderable; pages
// with their own generateMetadata still override as before.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const [{ locale }, cfg] = await Promise.all([params, getSiteConfig()]);
  const description =
    locale === "km" ? cfg.seo.siteDescription.km : cfg.seo.siteDescription.en;
  const { google, bing } = cfg.seo.verification;
  return {
    ...rootMetadata,
    title: {
      default: cfg.seo.siteTitle,
      template: cfg.seo.titleTemplate,
    },
    description,
    // Identity fields — all published, none compiled in (see app/root-metadata.ts).
    applicationName: cfg.libraryName.en,
    openGraph: { ...rootMetadata.openGraph, siteName: cfg.seo.siteName },
    // Environment gate AND admin kill switch — either can force noindex,
    // neither can force indexing of a non-production deployment.
    robots: defaultRobots({ indexingEnabled: cfg.seo.indexingEnabled }),
    ...(google || bing
      ? {
          verification: {
            ...(google ? { google } : {}),
            ...(bing ? { other: { "msvalidate.01": bing } } : {}),
          },
        }
      : {}),
  };
}

// Root layout for the whole public tree. Owning <html> here (rather than in a
// single app/layout.tsx above this segment) is what lets the locale arrive as a
// plain route param instead of via headers() — the dynamic API that previously
// forced every route in the app to render on demand.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleRootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    // Seed the locale BEFORE bailing out. The 404 body (app/[locale]/not-found.tsx)
    // still calls getTranslations(), and with no locale set next-intl falls back
    // to reading the cookie — a dynamic API in a page Next prerenders, which
    // throws "changed from static to dynamic at runtime" and turns the 404 into
    // a 500. That is what unknown /books/<slug> URLs hit: middleware rewrites
    // them to /__not-found__, which lands here as an invalid locale.
    setRequestLocale(routing.defaultLocale);
    notFound();
  }

  // Hands the locale to next-intl for the rest of this render, so
  // getTranslations() in nested server components resolves it from a React
  // cache instead of reading the x-next-intl-locale header. Without this, a
  // single getTranslations() call anywhere in the tree opts the whole route
  // back into dynamic rendering.
  setRequestLocale(locale);

  return <RootShell locale={locale}>{children}</RootShell>;
}
