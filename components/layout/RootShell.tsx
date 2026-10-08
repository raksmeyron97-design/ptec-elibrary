import { Suspense } from "react";
import { getMessages, getTranslations } from "next-intl/server";

// The site stylesheet. This used to be imported by app/layout.tsx; when that
// file was split into the three root layouts, the import has to live HERE —
// the one component they all render — or it belongs to none of them. Losing it
// does not fail the build or throw: every page just renders completely
// unstyled, with images at their intrinsic size. Do not remove.
import "@/app/globals.css";

import { angkor, inter, hanuman, crimsonPro, koulen } from "@/app/fonts";
import SearchModal from "@/components/ui/search/SearchModalLazy";
import NavigationProgress from "@/components/ui/NavigationProgress";
import PushNotificationOnboarding from "@/components/ui/notifications/PushNotificationOnboarding";
import IntlProvider from "@/components/providers/IntlProvider";
import { pickMessages, ROOT_NAMESPACES } from "@/i18n/pick-messages";
import PTECBootScreen, {
  PTECBootStyles,
  PTECShellReadyMarker,
} from "@/components/pwa/PTECBootScreen";
import UpdateAvailable from "@/components/pwa/UpdateAvailable";
import EntryClassMarker from "@/components/analytics/EntryClassMarker";
import { iosLaunchLinks } from "@/lib/pwa/launch";
import { THEME_INIT_SCRIPT } from "@/lib/csp";
import { getSiteConfig } from "@/lib/system-settings/config";

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

// The institutional identity (the college, the library, the website) is no
// longer emitted here. Since SEO Phase 4 every public page renders ONE JSON-LD
// block holding those nodes and its own (components/seo/PageJsonLd.tsx,
// lib/seo/jsonld.ts); a second, layout-level block is what made each page two
// to four separate documents.

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
  const [messages, siteConfig, t] = await Promise.all([
    getMessages({ locale }).then((m) => pickMessages(m, ROOT_NAMESPACES)),
    getSiteConfig(),
    // Server-side lookup, deliberately: the skip link is plain markup rendered
    // here, so it does NOT need "nav" in ROOT_NAMESPACES (which would ship the
    // whole navigation catalogue to /admin and /auth clients for one string).
    getTranslations({ locale, namespace: "nav" }),
  ]);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${angkor.variable} ${inter.variable} ${hanuman.variable} ${crimsonPro.variable} ${koulen.variable}`}
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
        {/* Plain inline <script>, deliberately NOT next/script: on nonce-CSP
            routes (admin/auth) next/script gets the nonce auto-injected
            server-side, and browsers hide nonce values from the DOM ("" vs
            undefined) — a dev-only hydration warning on every admin page.
            A raw script gets no nonce (it is sha256-allowlisted in the nonce
            policy, see lib/csp.ts) and, sitting in <head>, still runs before
            paint — FOUC prevention is unchanged. */}
        <script
          id="theme-init"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        {/* iOS gives an installed PWA no generated splash screen. Without a
            startup image whose media query matches the device exactly, iPhone
            shows a blank (black in dark mode) screen for the WHOLE cold launch
            — the worst of the reported startup symptoms, and pure config.
            Android ignores these and uses the manifest instead. */}
        {iosLaunchLinks().map(({ href, media }) => (
          <link key={href} rel="apple-touch-startup-image" href={href} media={media} />
        ))}
        <PTECBootStyles />
      </head>
      <body
        suppressHydrationWarning
        className="bg-bg-app font-sans text-text-body antialiased"
      >
        {/* FIRST child of <body> on purpose — the parser must reach it before
            anything else. See components/pwa/PTECBootScreen.tsx for why this is
            markup + one CSS rule rather than a stateful component. */}
        <PTECBootScreen
          libraryName={siteConfig.libraryName.en}
          organizationName={siteConfig.name.en}
          organizationNameKm={siteConfig.name.km}
        />
        <IntlProvider locale={locale} messages={messages}>
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-contrast"
          >
            {t("skipToContent")}
          </a>
          {children}
          {/* Dismisses <PTECBootScreen/>. Sits after {children} and outside any
              Suspense boundary, so during a streamed response the parser
              reaches it only once the shell above it exists — and once it is in
              the DOM it never leaves. */}
          <PTECShellReadyMarker />
          <EntryClassMarker />
          <UpdateAvailable />
          <PushNotificationOnboarding />
          <Suspense fallback={null}>
            <SearchModal />
          </Suspense>
        </IntlProvider>
      </body>
    </html>
  );
}
