import type { Metadata } from "next";
import { Suspense } from "react";
import SearchPageClient from "./SearchPageClient";
import { getDepartmentsCached, getLanguagesCached, getCategoriesCached } from "@/lib/books-data";

export const metadata: Metadata = {
  title: "Search",
  description: "Search PTEC Library — find books, theses, physical catalog, and posts all in one place.",
  alternates: { canonical: "/search" },
  // Internal search results shouldn't be indexed, but links found there should be crawled.
  robots: { index: false, follow: true },
};

export default async function SearchPage() {
  const [departments, languages, categories] = await Promise.all([
    getDepartmentsCached(),
    getLanguagesCached(),
    getCategoriesCached(),
  ]);

  return (
    <div className="min-h-[calc(100vh-4rem)]" style={{ background: "var(--ptec-bg-app)" }}>
      <div className="mx-auto max-w-3xl px-4 pt-14 pb-24">

        {/* ── Page header ───────────────────────────────────────────── */}
        <div className="mb-10 text-center">
          <h1
            className="mb-2 text-[36px] font-bold tracking-tight"
            style={{ color: "var(--ptec-text-heading)" }}
          >
            Library Search
          </h1>
          <p className="text-[13px]" style={{ color: "var(--ptec-text-muted)" }}>
            Books · Theses · Physical Catalog · Posts
          </p>
        </div>

        <Suspense fallback={null}>
          <SearchPageClient departments={departments} languages={languages} categories={categories} />
        </Suspense>

      </div>
    </div>
  );
}
