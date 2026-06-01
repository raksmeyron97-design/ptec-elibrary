import type { Metadata, Viewport } from "next";
import "./globals.css";
import { angkor, kantumruyPro, playfairDisplay, inter, notoSerifKhmer } from "@/app/fonts";
import JsonLd from "@/components/seo/JsonLd";
import { Suspense } from "react";
import CommandPalette from "@/components/ui/search/CommandPalette";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
    name: "Phnom Penh Teacher Education College",
    url: SITE_URL,
    logo: `${SITE_URL}/logo.png`,
  };

  return (
    <html lang="km" className={`${angkor.variable} ${kantumruyPro.variable} ${playfairDisplay.variable} ${inter.variable} ${notoSerifKhmer.variable}`}>
      <body
        suppressHydrationWarning
        className="bg-bg-app font-sans text-text-body antialiased"
      >
        <JsonLd data={websiteSchema} />
        <JsonLd data={orgSchema} />
        {children}
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
      </body>
    </html>
  );
}