import type { Metadata } from "next";
import { Suspense } from "react";
import SearchPageClient from "./SearchPageClient";
import { getDepartmentsCached, getLanguagesCached, getCategoriesCached } from "@/lib/books-data";
import { localeAlternates } from "@/lib/seo/alternates";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: "Search",
    description: "Search PTEC Library — find books, theses, physical catalog, and posts all in one place.",
    alternates: localeAlternates("/search", locale),
    // Internal search results shouldn't be indexed, but links found there should be crawled.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage() {
  const [departments, languages, categories, t] = await Promise.all([
    getDepartmentsCached(),
    getLanguagesCached(),
    getCategoriesCached(),
    getTranslations("search"),
  ]);

  return (
    <div className="min-h-[calc(100vh-4rem)]" style={{ background: "var(--ptec-bg-app)" }}>
      {/* Wide enough for the facet sidebar + results grid; the search bar and
          idle state re-center themselves at max-w-3xl inside the client. */}
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-24 sm:pt-14">

        {/* ── Page header ───────────────────────────────────────────────
            Compact on phones: the field is the page, and ~250px of heading
            used to sit above it. Both strings were hard-coded English, so a
            Khmer reader saw "Library Search"; the subtitle also left out two
            of the six types search covers (publications, learning paths). */}
        <div className="mb-5 text-center sm:mb-10">
          <h1
            className="mb-1 text-[26px] font-bold leading-tight tracking-tight sm:mb-2 sm:text-[36px]"
            style={{ color: "var(--ptec-text-heading)" }}
          >
            {t("pageTitle")}
          </h1>
          <p className="text-[12.5px] leading-relaxed sm:text-[13px]" style={{ color: "var(--ptec-text-muted)" }}>
            {t("pageSubtitle")}
          </p>
        </div>

        <Suspense fallback={null}>
          <SearchPageClient departments={departments} languages={languages} categories={categories} />
        </Suspense>

      </div>
    </div>
  );
}
