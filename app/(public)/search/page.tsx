import type { Metadata } from "next";
import { Suspense } from "react";
import SearchPageClient from "./SearchPageClient";

export const metadata: Metadata = {
  title: "Search",
  description: "Search PTEC Library — find books, theses, physical catalog, and posts all in one place.",
};

export default function SearchPage() {
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
          <SearchPageClient />
        </Suspense>

      </div>
    </div>
  );
}
