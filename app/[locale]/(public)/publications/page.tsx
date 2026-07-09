import { Link } from "@/i18n/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getPublications } from "@/app/actions/publications";
import { isSubscribed } from "@/app/actions/subscriptions";
import SubscribeButton from "@/components/ui/books/SubscribeButton";
import type { Publication } from "@/lib/publications";
import { citationYear } from "@/lib/citations";
import PublicationCard from "@/components/ui/publications/PublicationCard";
import PublicationFilters from "@/components/ui/publications/PublicationFilters";
import PublicationsHero from "@/components/ui/publications/PublicationsHero";
import Icon from "@/components/ui/core/Icon";
import Pagination from "@/components/ui/core/Pagination";
import { ClientNavWrapper } from "@/components/ui/books/ClientNavWrapper";
import { PAGE_SIZE_OPTIONS, resolvePageSize } from "@/lib/pagination";
import { getTranslations } from "next-intl/server";
import { buildListingMetadata, parsePageParam } from "@/lib/seo/listing-metadata";

export const dynamic = "force-dynamic";

type SP = {
  q?: string;
  keyword?: string;
  type?: string;
  journal?: string;
  year?: string;
  language?: string;
  page?: string;
  size?: string;
};

export async function generateMetadata({
  searchParams,
  params: routeParams,
}: {
  searchParams: Promise<SP>;
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const { locale } = await routeParams;
  return buildListingMetadata({
    path: "/publications",
    locale,
    title: "Publications",
    description:
      "Browse academic journal articles published through the Phnom Penh Teacher Education College (PTEC). Search by journal, year, keywords, and article type.",
    page: parsePageParam(params.page),
    hasFilters: !!(
      params.q ||
      params.keyword ||
      params.type ||
      params.journal ||
      params.year ||
      params.language ||
      params.size
    ),
  });
}

function matchesQ(pub: Publication, q: string): boolean {
  const needle = q.toLowerCase();
  return [pub.title, pub.title_km, pub.abstract, pub.author_names, pub.journal_name]
    .some((field) => field?.toLowerCase().includes(needle));
}

// Streamed after the shell — the only place this route reads user state.
// Hidden for anonymous visitors (mirrors HeroSubscribeBadge on books).
async function SubscribeBadge() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const subscribed = await isSubscribed("publications", "all");
  return (
    <SubscribeButton
      filterType="publications"
      filterValue="all"
      displayLabel="Publications"
      initialSubscribed={subscribed}
      tooltipSubscribed="ឈប់ទទួលការជូនដំណឹងអំពីអត្ថបទសិក្សាថ្មីៗ"
      tooltipUnsubscribed="ទទួលបានការជូនដំណឹងពេលមានអត្ថបទសិក្សាថ្មីៗ"
    />
  );
}

export default async function PublicationsPage({
  searchParams,
  params: routeParams,
}: {
  searchParams: Promise<SP>;
  params: Promise<{ locale: string }>;
}) {
  const t = await getTranslations("publications");
  const params = await searchParams;
  const { locale } = await routeParams;
  const basePath = locale === "km" ? "/km/publications" : "/publications";

  // Fetch every published article once, then facet/filter in-page —
  // same approach as the theses listing (dataset is institutional-scale).
  const { data } = await getPublications({});
  const all = data ?? [];

  const publications = all.filter((pub) => {
    if (params.q && !matchesQ(pub, params.q)) return false;
    if (params.keyword && !pub.keywords.some((k) => k.toLowerCase() === params.keyword!.toLowerCase())) return false;
    if (params.type && pub.article_type !== params.type) return false;
    if (params.journal && pub.journal_name !== params.journal) return false;
    if (params.year && citationYear(pub) !== params.year) return false;
    if (params.language && pub.language !== params.language) return false;
    return true;
  });

  // Facet options derived from the full published set
  const journals = [...new Set(all.map((p) => p.journal_name).filter(Boolean))] as string[];
  const years = [...new Set(all.map((p) => citationYear(p)).filter(Boolean))].sort().reverse() as string[];

  // Hero: repository stats + most-used keywords across the published set
  const totalDownloads = all.reduce((sum, p) => sum + (p.download_count || 0), 0);
  const keywordCounts = new Map<string, number>();
  for (const p of all) {
    for (const kw of p.keywords ?? []) {
      const key = kw.trim();
      if (key) keywordCounts.set(key, (keywordCounts.get(key) ?? 0) + 1);
    }
  }
  const popularKeywords = [...keywordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([kw]) => kw);

  const total = publications.length;
  const pageSize = resolvePageSize(params.size);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number(params.page) || 1), totalPages);
  const paged = publications.slice((page - 1) * pageSize, page * pageSize);

  const hasFilters = !!(params.q || params.keyword || params.type || params.journal || params.year || params.language);

  return (
    <ClientNavWrapper>
      <div className="min-h-screen bg-bg-body">
        <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-10 md:py-8">
          {/* ── Hero: search-first header (Scholar-style) ── */}
          <PublicationsHero
            stats={{
              publications: all.length,
              journals: journals.length,
              years: years.length,
              downloads: totalDownloads,
            }}
            popularKeywords={popularKeywords}
            currentQuery={params.q ?? ""}
            preservedParams={{
              keyword: params.keyword,
              type: params.type,
              journal: params.journal,
              year: params.year,
              language: params.language,
            }}
            labels={{
              eyebrow: t("heroEyebrow"),
              title: t("title"),
              subtitle: t("subtitle"),
              searchPlaceholder: t("searchPlaceholder"),
              searchButton: t("heroSearchButton"),
              popular: t("heroPopular"),
              statPublications: t("statPublications"),
              statJournals: t("statJournals"),
              statYears: t("statYears"),
              statDownloads: t("statDownloads"),
            }}
            badge={
              <Suspense fallback={null}>
                <SubscribeBadge />
              </Suspense>
            }
          />

          <div className="mt-5 space-y-4">
            <PublicationFilters
              filters={{
                q: params.q ?? "",
                type: params.type ?? "",
                journal: params.journal ?? "",
                year: params.year ?? "",
                language: params.language ?? "",
                keyword: params.keyword ?? "",
              }}
              journals={journals}
              years={years}
              labels={{
                searchPlaceholder: t("searchPlaceholder"),
                allTypes: t("allTypes"),
                allJournals: t("allJournals"),
                allYears: t("allYears"),
                allLanguages: t("allLanguages"),
                clear: t("clearFilters"),
                types: {
                  article: t("typeArticle"),
                  review: t("typeReview"),
                  account: t("typeAccount"),
                  editorial: t("typeEditorial"),
                },
              }}
            />

            {/* Active keyword chip */}
            {params.keyword && (
              <p className="text-[13px] text-text-muted">
                {t("filteredByKeyword")}{" "}
                <Link
                  href="/publications"
                  className="inline-flex items-center gap-1 rounded-full border border-brand/20 bg-brand/5 px-3 py-1 font-medium text-brand transition-colors hover:bg-brand/10"
                >
                  {params.keyword} ✕
                </Link>
              </p>
            )}

            {/* Result count */}
            <p className="text-[13px] text-text-muted">
              {total > 0 ? t("resultCount", { count: total }) : t("noResults")}
              {params.q && <> {t("resultsFor", { q: params.q })}</>}
            </p>

            {/* Results */}
            {publications.length === 0 ? (
              <div className="flex min-h-[280px] sm:min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-divider bg-bg-surface p-6 sm:p-10 text-center">
                <Icon name="search-off" className="mb-3 text-4xl sm:text-5xl text-text-muted" />
                <h2 className="text-lg sm:text-xl font-bold text-text-body">{t("noResults")}</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-text-muted">
                  {hasFilters ? t("noResultsFiltered") : t("noResultsEmpty")}
                </p>
                {hasFilters && (
                  <Link
                    href="/publications"
                    className="mt-5 inline-flex h-10 items-center rounded-full bg-brand px-6 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover"
                  >
                    {t("clearFilters")}
                  </Link>
                )}
              </div>
            ) : (
              <>
                <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 sm:gap-5">
                  {paged.map((pub) => (
                    <PublicationCard key={pub.id} publication={pub} />
                  ))}
                </div>
                {!hasFilters && !params.q && total < 5 && (
                  <p className="mt-6 rounded-xl border border-dashed border-divider bg-bg-surface px-4 py-3 text-center text-[13px] text-text-muted">
                    {t("growingNote")}
                  </p>
                )}
              </>
            )}

            {publications.length > 0 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={total}
                pageSize={pageSize}
                searchParams={params as Record<string, string | undefined>}
                basePath={basePath}
                pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
              />
            )}
          </div>
        </div>
      </div>
    </ClientNavWrapper>
  );
}
