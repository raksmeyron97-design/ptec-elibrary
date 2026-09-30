import type { Metadata } from "next";
import { Suspense } from "react";
import { headers } from "next/headers";
import SearchPageClient, { type InitialSearch } from "./SearchPageClient";
import { getDepartmentsCached, getLanguagesCached, getCategoriesCached } from "@/lib/books-data";
import { localeAlternates, dropHreflangWhenNoindex } from "@/lib/seo/alternates";
import { getTranslations } from "next-intl/server";
import { ServerTiming } from "@/lib/search/server-timing";
import { serveNativeSearch } from "@/lib/search/serve-search";

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "search" });
  return dropHreflangWhenNoindex({
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: localeAlternates("/search", locale),
    // Internal search results shouldn't be indexed, but links found there should be crawled.
    robots: { index: false, follow: true },
  });
}

function toSearchParams(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, v);
  }
  return params;
}

/**
 * The first page of results, rendered on the server (Phase 9.3,
 * docs/UNIFIED-DISCOVERY.md): a reader whose app bundle is slow or never
 * arrives still gets results, and a phone paints them without first
 * downloading, hydrating and then fetching.
 *
 * Only for a DOCUMENT request. Everything the page does after it has loaded —
 * a new query, a scope, a facet, Back — is a client-side navigation, and the
 * client searches through /api/search/native as it always has; running the
 * search here as well would do every search twice. The flight headers that
 * mark such a request (`rsc`, `next-router-prefetch`) are hidden from
 * headers() in this Next version, so the page asks the browser's own
 * Sec-Fetch-Dest instead: a navigation is `document`, the router's fetch() is
 * `empty`, and neither can be set by page script. When the header is absent
 * (an older browser, a plain-http LAN address, curl, a crawler) the page
 * renders the results — the direction that can only cost a duplicate search,
 * never a reader an empty page.
 */
async function firstPage(searchParams: SearchPageProps["searchParams"]): Promise<InitialSearch | null> {
  const [record, requestHeaders] = await Promise.all([searchParams, headers()]);
  const params = toSearchParams(record);
  if (!params.get("q")?.trim()) return null;
  const dest = requestHeaders.get("sec-fetch-dest");
  if (dest && dest !== "document" && dest !== "iframe") return null;

  // The same door as the JSON route: metered, classified and logged alike.
  // Rate-limited, invalid or failed, the reader is told the search failed —
  // what the client says when the route answers 429, 400 or 500.
  try {
    const served = await serveNativeSearch(params, requestHeaders, "/search", new ServerTiming());
    if (served.status === "ok") return { state: "served", response: served.outcome.response };
  } catch (err) {
    console.error("[search page] first page failed:", err);
  }
  return { state: "failed" };
}

async function FirstPage({
  first,
  lists,
}: {
  first: Promise<InitialSearch | null>;
  lists: Promise<[departments: string[], languages: string[], categories: string[]]>;
}) {
  const [initial, [departments, languages, categories]] = await Promise.all([first, lists]);
  return <SearchPageClient departments={departments} languages={languages} categories={categories} initial={initial} />;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  // Neither is awaited here: the heading and the search field go out in the
  // first flush, while the search and the advanced-search lists load behind
  // the boundary below. Awaiting the lists here put the route's generic
  // loading skeleton in front of the page on every document load.
  const first = firstPage(searchParams);
  const lists = Promise.all([getDepartmentsCached(), getLanguagesCached(), getCategoriesCached()]);
  const t = await getTranslations("search");

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

        {/* The fallback is the same page, searching: the field already holds
            the query and the result skeleton stands where the results land.
            It never fetches — the server is already on it — and its advanced
            search is empty until the real one arrives. On a client-side
            navigation `first` settles to null at once, and the element the
            router commits is the same SearchPageClient in the same place, so
            its state (an open filter sheet, say) survives. */}
        <Suspense fallback={<SearchPageClient departments={[]} languages={[]} categories={[]} initial={{ state: "pending" }} />}>
          <FirstPage first={first} lists={lists} />
        </Suspense>

      </div>
    </div>
  );
}
