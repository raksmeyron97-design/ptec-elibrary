import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { angkor, inter, hanuman, crimsonPro } from "@/app/fonts";
import JsonLd from "@/components/seo/JsonLd";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/react";
import CommandPalette from "@/components/ui/search/CommandPalette";
import NavigationProgress from "@/components/ui/NavigationProgress";
import { getLocale, getMessages } from 'next-intl/server';
import IntlProvider from '@/components/providers/IntlProvider';
import { SITE_URL } from '@/lib/seo/site';
import { PTEC } from '@/lib/ptec';
const THEME_INIT_SCRIPT = `
(() => {
  try {
    const root = document.documentElement;
    const path = window.location.pathname;
    const isAdmin = path === "/admin" || path.startsWith("/admin/");
    const storedTheme = localStorage.getItem("ptec.theme");
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = isAdmin
      ? "light"
      : storedTheme === "light" || storedTheme === "dark"
        ? storedTheme
        : systemDark
          ? "dark"
          : "light";

    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", theme === "dark" ? "#0B1530" : "#172554");
    }
  } catch (_) {}
})();
`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "PTEC Digital Teaching Library",
    template: "%s · PTEC Library",
  },
  description:
    "Access free teaching resources, books, and educational materials from the Phnom Penh Teacher Education College (PTEC).",
  applicationName: "PTEC Library",
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

export const viewport: Viewport = {
  themeColor: "#172554",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") || undefined;
  
  const locale = await getLocale();
  const messages = await getMessages();
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "PTEC Library",
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/books?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  const orgSchema = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: PTEC.name.en,
    alternateName: PTEC.name.short,
    url: PTEC.links.website,
    logo: `${SITE_URL}/logo.png`,
    telephone: PTEC.phone,
    email: PTEC.email,
    sameAs: PTEC.sameAs,
    description: "Phnom Penh Teacher Education College (PTEC) is a public teacher training institution in Cambodia providing free digital teaching resources and research materials.",
    address: {
      "@type": "PostalAddress",
      streetAddress: PTEC.address.streetAddress,
      addressLocality: PTEC.address.city,
      addressCountry: PTEC.address.country,
    },
  };

  const librarySchema = {
    "@context": "https://schema.org",
    "@type": "Library",
    name: "PTEC Digital Library",
    url: SITE_URL,
    image: `${SITE_URL}/logo.png`,
    telephone: PTEC.phone,
    description: "Free digital library for Phnom Penh Teacher Education College — teaching resources, textbooks, and research reports in Khmer and English.",
    inLanguage: ["km", "en"],
    isAccessibleForFree: true,
    openingHours: PTEC.hours.openingHoursSpec,
    address: {
      "@type": "PostalAddress",
      streetAddress: PTEC.address.streetAddress,
      addressLocality: PTEC.address.city,
      addressCountry: PTEC.address.country,
    },
    parentOrganization: {
      "@type": "EducationalOrganization",
      name: PTEC.name.en,
      url: PTEC.links.website,
    },
  };

  return (
    <html lang={locale} suppressHydrationWarning className={`${angkor.variable} ${inter.variable} ${hanuman.variable} ${crimsonPro.variable}`}>
      <head>
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: THEME_INIT_SCRIPT,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        className="bg-bg-app font-sans text-text-body antialiased"
      >
        <IntlProvider locale={locale} messages={messages}>
          <JsonLd data={websiteSchema} />
          <JsonLd data={orgSchema} />
          <JsonLd data={librarySchema} />
          <Suspense fallback={null}>
            <NavigationProgress />
          </Suspense>
          <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-contrast">
            Skip to content
          </a>
          {children}
          <Analytics />
          <Suspense fallback={null}>
            <CommandPalette />
          </Suspense>
        </IntlProvider>
      </body>
    </html>
  );
}
