import { Suspense } from "react";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getMessages } from "next-intl/server";

// The site stylesheet. This used to be imported by app/layout.tsx; when that
// file was split into the three root layouts, the import has to live HERE —
// the one component they all render — or it belongs to none of them. Losing it
// does not fail the build or throw: every page just renders completely
// unstyled, with images at their intrinsic size. Do not remove.
import "@/app/globals.css";

import { angkor, inter, hanuman, crimsonPro } from "@/app/fonts";
import JsonLd from "@/components/seo/JsonLd";
import SearchModal from "@/components/ui/search/SearchModalLazy";
import NavigationProgress from "@/components/ui/NavigationProgress";
import PushNotificationOnboarding from "@/components/ui/notifications/PushNotificationOnboarding";
import IntlProvider from "@/components/providers/IntlProvider";
import { pickMessages, ROOT_NAMESPACES } from "@/i18n/pick-messages";
import { THEME_INIT_SCRIPT } from "@/lib/csp";
import { SITE_URL } from "@/lib/seo/site";
import { getSiteConfig } from "@/lib/system-settings/config";
import type { SiteConfig } from "@/lib/system-settings/types";

// ─────────────────────────────────────────────────────────────────────────────
// The <html>/<body> shell, shared by every root layout.
//
// This app has THREE root layouts, not one, because `app/[locale]/layout.tsx`
// must be able to read `params.locale` to set `<html lang>`. A single
// `app/layout.tsx` sits above the [locale] segment and can only reach the
// locale through `headers()`/`cookies()` — a dynamic API, which de-opted every
// route in the app to `ƒ Dynamic` and made public HTML uncacheable. Splitting
// the root lets the public tree take the locale as a plain route param and
// prerender.
//
//   app/[locale]/layout.tsx  → public tree   (static / ISR, locale from params)
//   app/(admin)/layout.tsx   → admin panel   (dynamic, locale from cookie)
//   app/(auth)/layout.tsx    → auth flows    (dynamic, locale from cookie)
//   app/~offline/layout.tsx  → PWA fallback  (static, English)
//
// The theme-init script deliberately carries NO nonce attribute: the root
// layout must stay free of `headers()`. It is allowlisted by sha256 in the
// nonce policy and rides 'unsafe-inline' in the public policy — see lib/csp.ts.
// ─────────────────────────────────────────────────────────────────────────────

// One canonical institutional identity, emitted site-wide as a single @graph
// with stable @id anchors. Nothing else may declare an Organization/Library/
// WebSite node — duplicates with diverging names/URLs read as conflicting
// entities to search engines (the home page used to).
//
// Values come from the PUBLISHED system settings (cached under "site-config"
// — no cookies/headers, so the public tree keeps prerendering).
function buildSiteGraph(cfg: SiteConfig) {
  const address = {
    "@type": "PostalAddress",
    streetAddress: cfg.address.streetAddress,
    addressLocality: cfg.address.city,
    addressCountry: cfg.address.country,
  };

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "EducationalOrganization",
        "@id": `${SITE_URL}/#organization`,
        name: cfg.name.en,
        alternateName: cfg.name.short,
        url: cfg.links.website,
        logo: `${SITE_URL}/logo.png`,
        telephone: cfg.phone,
        email: cfg.email,
        sameAs: cfg.sameAs,
        description:
          "Phnom Penh Teacher Education College (PTEC) is a public teacher training institution in Cambodia providing free digital teaching resources and research materials.",
        address,
      },
      {
        "@type": "Library",
        "@id": `${SITE_URL}/#library`,
        name: cfg.seo.siteName,
        url: SITE_URL,
        image: `${SITE_URL}/logo.png`,
        telephone: cfg.phone,
        email: cfg.email,
        description:
          "Free digital library for Phnom Penh Teacher Education College — teaching resources, textbooks, and research reports in Khmer and English.",
        inLanguage: ["km", "en"],
        isAccessibleForFree: true,
        openingHours: cfg.hours.openingHoursSpec,
        address,
        parentOrganization: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: cfg.seo.siteName,
        url: SITE_URL,
        inLanguage: ["km", "en"],
        publisher: { "@id": `${SITE_URL}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: `${SITE_URL}/search?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

export default async function RootShell({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  // Passing `locale` explicitly keeps next-intl off `headers()` — see
  // i18n/request.ts. Root provider carries only what root-level client
  // components use; each root layout adds its own namespace set below it.
  const [messages, siteConfig] = await Promise.all([
    getMessages({ locale }).then((m) => pickMessages(m, ROOT_NAMESPACES)),
    getSiteConfig(),
  ]);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${angkor.variable} ${inter.variable} ${hanuman.variable} ${crimsonPro.variable}`}
    >
      <head>
        {/* Client-side data (covers, suggestions, auth refresh) hits these
            origins on nearly every page; warming DNS+TLS early saves a
            round-trip on slow mobile connections. */}
        <link
          rel="preconnect"
          href={process.env.NEXT_PUBLIC_SUPABASE_URL}
          crossOrigin="anonymous"
        />
        <link rel="preconnect" href="https://storage-ptec.online" />
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body
        suppressHydrationWarning
        className="bg-bg-app font-sans text-text-body antialiased"
      >
        <IntlProvider locale={locale} messages={messages}>
          <JsonLd data={buildSiteGraph(siteConfig)} />
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-contrast"
          >
            Skip to content
          </a>
          {children}
          <PushNotificationOnboarding />
          <Analytics />
          <SpeedInsights />
          <Suspense fallback={null}>
            <SearchModal />
          </Suspense>
        </IntlProvider>
      </body>
    </html>
  );
}
