import { Link } from "@/i18n/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getPublications } from "@/app/actions/publications";
import { isSubscribed } from "@/app/actions/subscriptions";
import SubscribeButton from "@/components/ui/books/SubscribeButton";
import type { Publication } from "@/lib/publications";
import { academicTextToPlainText } from "@/lib/publications/citations";
import { citationYear, authorList } from "@/lib/citations";
import JsonLd from "@/components/seo/JsonLd";
import { publicationsCollectionJsonLd } from "@/lib/seo/publication-seo";
import PublicationCard from "@/components/ui/publications/PublicationCard";
import PublicationListItem from "@/components/ui/publications/PublicationListItem";
import ResultToolbar from "@/components/ui/listing/ResultToolbar";
import AppliedFilters, { type AppliedFilter } from "@/components/ui/listing/AppliedFilters";
import PublicationFilters from "@/components/ui/publications/PublicationFilters";
import PublicationsHero from "@/components/ui/publications/PublicationsHero";
import Icon from "@/components/ui/core/Icon";
import Pagination from "@/components/ui/core/Pagination";
import { ClientNavWrapper } from "@/components/ui/books/ClientNavWrapper";
import { PAGE_SIZE_OPTIONS, resolvePageSize } from "@/lib/pagination";
import { getTranslations } from "next-intl/server";
import { buildListingMetadata, parsePageParam } from "@/lib/seo/listing-metadata";
import { getOrgIdentity } from "@/lib/system-settings/config";
import { getCollectionStats } from "@/lib/collection-stats";
import { chooseCountLabel } from "@/lib/listing-count";

export const dynamic = "force-dynamic";

type SP = {
  q?: string;
  keyword?: string;
  subject?: string;
  type?: string;
  journal?: string;
  year?: string;
  language?: string;
  page?: string;
  size?: string;
  sort?: string;
  view?: string;
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
  const tSeo = await getTranslations({ locale, namespace: "publications" });
  return buildListingMetadata({
    org: await getOrgIdentity(),
    path: "/publications",
    locale,
    title: tSeo("seoTitle"),
    description: tSeo("seoDescriptionEvergreen"),
    pageLabel: tSeo("pageLabel"),
    page: parsePageParam(params.page),
    hasFilters: !!(
      params.q ||
      params.keyword ||
      params.subject ||
      params.type ||
      params.journal ||
      params.year ||
      params.language ||
      params.size ||
      params.sort ||
      params.view
    ),
  });
}

function matchesQ(pub: Publication, q: string): boolean {
  const needle = q.toLowerCase();
  const abstract = academicTextToPlainText(pub.abstract, pub.references);
  return [pub.title, pub.title_km, abstract, pub.author_names, pub.journal_name]
    .some((field) => field?.toLowerCase().includes(needle));
}

// Sort orders offered by the toolbar. The listing previously had none at all:
// results arrived in whatever order getPublications() returned, so a reader
// could not put the newest article first — the single most common thing anyone
// asks of a research repository.
const SORTERS: Record<string, (a: Publication, b: Publication) => number> = {
  newest: (a, b) => pubTime(b) - pubTime(a),
  oldest: (a, b) => pubTime(a) - pubTime(b),
  title: (a, b) => a.title.localeCompare(b.title),
  views: (a, b) => (b.view_count || 0) - (a.view_count || 0),
  downloads: (a, b) => (b.download_count || 0) - (a.download_count || 0),
};

/** The article's own date, falling back to its repository publish date. */
function pubTime(p: Publication): number {
  const raw = p.publication_date ?? p.published_at;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
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
  // AccessBadge's rights vocabulary lives in the detail namespace — the
  // listing must not invent a second wording for the same claim. Both
  // translators and both params are independent of each other, so all four
  // resolve together instead of stacking round-trips.
  const [t, tDetail, params, { locale }] = await Promise.all([
    getTranslations("publications"),
    getTranslations("publicationDetail"),
    searchParams,
    routeParams,
  ]);
  const basePath = locale === "km" ? "/km/publications" : "/publications";

  // Fetch every published article once, then facet/filter in-page —
  // same approach as the theses listing (dataset is institutional-scale).
  const [{ data }, stats] = await Promise.all([getPublications({}), getCollectionStats()]);
  const all = data ?? [];

  const publications = all.filter((pub) => {
    if (params.q && !matchesQ(pub, params.q)) return false;
    if (params.keyword && !pub.keywords.some((k) => k.toLowerCase() === params.keyword!.toLowerCase())) return false;
    if (params.subject && !pub.subjects.some((sub) => sub.toLowerCase() === params.subject!.toLowerCase())) return false;
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

  const sort = params.sort && SORTERS[params.sort] ? params.sort : "newest";
  const sorted = [...publications].sort(SORTERS[sort]);
  // List is the default and grid is opt-in: this is a research repository, and
  // a row carrying authors, source and an abstract line triages a result far
  // better than a poster whose cover is a shared journal-issue image.
  const isGrid = params.view === "grid";

  const total = sorted.length;
  const pageSize = resolvePageSize(params.size);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number(params.page) || 1), totalPages);
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const hasFilters = !!(params.q || params.keyword || params.subject || params.type || params.journal || params.year || params.language);

  const typeLabels: Record<string, string> = {
    article: t("typeArticle"),
    review: t("typeReview"),
    account: t("typeAccount"),
    editorial: t("typeEditorial"),
  };

  // Every active narrowing, named, above the results — replacing the lone
  // "Filtered by keyword: <value> ✕" line, which covered one of six facets and
  // put a raw ✕ glyph inside a link as its only remove affordance.
  const appliedFilters: AppliedFilter[] = [
    params.q ? { key: "q", label: t("searchLabel"), value: params.q } : null,
    params.type ? { key: "type", label: t("typeLabel"), value: typeLabels[params.type] ?? params.type } : null,
    params.journal ? { key: "journal", label: t("journalLabel"), value: params.journal } : null,
    params.year ? { key: "year", label: t("yearLabel"), value: params.year } : null,
    params.language
      ? { key: "language", label: t("languageLabel"), value: params.language === "km" ? "ខ្មែរ" : "English" }
      : null,
    params.keyword ? { key: "keyword", label: t("keywordLabel"), value: params.keyword } : null,
    params.subject ? { key: "subject", label: t("subjectLabel"), value: params.subject } : null,
  ].filter((f): f is AppliedFilter => f !== null);

  // `total` is the filtered count. The denominator is the canonical published
  // total from lib/collection-stats.ts — the same figure the homepage shows
  // for "Publications" — so "3 of 41" reconciles across surfaces. `all.length`
  // is the full fetched set and agrees with it by construction, but the
  // canonical service is what the page states.
  const countChoice = chooseCountLabel(total, stats?.publications ?? null, hasFilters);
  const countLabel =
    countChoice.kind === "none"
      ? t("noResults")
      : countChoice.kind === "filtered"
        ? t("resultCountFiltered", { count: countChoice.count, total: countChoice.total })
        : t("resultCount", { count: countChoice.count });

  // Locale-aware CollectionPage + ItemList for the clean (indexable) listing.
  const isCleanListing = !hasFilters && !params.size && !params.sort && !params.view;
  const collectionSchema = isCleanListing
    ? publicationsCollectionJsonLd({
        org: await getOrgIdentity(),
        locale,
        page,
        pageSize,
        total,
        name: t("collectionName"),
        description: t("collectionDescription"),
        publications: paged.map((p) => ({
          slug: p.slug,
          title: p.title,
          authors: authorList(p),
          journalName: p.journal_name,
          year: citationYear(p),
          doi: p.doi,
        })),
      })
    : null;

  return (
    <ClientNavWrapper>
      {collectionSchema && <JsonLd data={collectionSchema} />}
      <div className="min-h-screen bg-bg-body">
        <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-10 md:py-8">
          {/* ── Hero: search-first header (Scholar-style) ── */}
          <PublicationsHero
            stats={{
              // Canonical published total (lib/collection-stats.ts), not the
              // length of the fetched array — the hero states a collection
              // size, so it must be the same number the homepage states.
              publications: stats?.publications ?? all.length,
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
                typeLabel: t("typeLabel"),
                journalLabel: t("journalLabel"),
                yearLabel: t("yearLabel"),
                languageLabel: t("languageLabel"),
                types: {
                  article: t("typeArticle"),
                  review: t("typeReview"),
                  account: t("typeAccount"),
                  editorial: t("typeEditorial"),
                },
              }}
            />

            {/* What the collection has been narrowed to, and how to widen
                it — above the results, before the count. */}
            {appliedFilters.length > 0 && (
              <AppliedFilters
                filters={appliedFilters}
                params={params as Record<string, string | undefined>}
                basePath={basePath}
                heading={t("filteredBy")}
                clearAllLabel={t("clearAll")}
              />
            )}

            {/* Count + rows-per-page + sort + view. The count used to be a
                13px grey line on its own with no controls beside it: the
                listing offered no way to sort at all, and no way to switch
                between a scan-friendly list and the cover grid. */}
            <ResultToolbar
              countLabel={countLabel}
              query={params.q}
              params={params as Record<string, string | undefined>}
              isGrid={isGrid}
              sort={sort}
              pageSize={pageSize}
              pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
              basePath={basePath}
              pageSizeId="publications-page-size"
              sortOptions={[
                { value: "newest", label: t("sortNewest") },
                { value: "oldest", label: t("sortOldest") },
                { value: "title", label: t("sortTitle") },
                { value: "views", label: t("sortViews") },
                { value: "downloads", label: t("sortDownloads") },
              ]}
              sortDefaultLabel={t("sortNewest")}
              viewLabels={{ group: t("viewMode"), list: t("viewList"), grid: t("viewGrid") }}
            />

            {/* Results */}
            {total === 0 ? (
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
                {/* Card/row titles are h3s; this keeps the outline h1 → h2 → h3. */}
                <h2 className="sr-only">{t("resultsHeading")}</h2>
                {isGrid ? (
                  // Column count is capped by how many results there actually
                  // are. A five-column track holding one card left it stranded
                  // at the left edge of twelve hundred empty pixels — the
                  // repository is young, and the grid has to look deliberate
                  // at three items as well as at fifty.
                  <div
                    className={`grid gap-4 sm:gap-5 ${
                      total === 1
                        ? "grid-cols-1 sm:max-w-[280px]"
                        : total === 2
                          ? "grid-cols-2 sm:max-w-[580px]"
                          : total === 3
                            ? "grid-cols-2 sm:grid-cols-3 sm:max-w-[880px]"
                            : total < 8
                              ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
                              : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
                    }`}
                  >
                    {paged.map((pub) => (
                      <PublicationCard key={pub.id} publication={pub} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {paged.map((pub) => (
                      <PublicationListItem
                        key={pub.id}
                        publication={pub}
                        labels={{
                          openAccess: tDetail("openAccess"),
                          licensed: tDetail("accessLicensed"),
                          rightsUnstated: tDetail("accessRightsUnstated"),
                        }}
                      />
                    ))}
                  </div>
                )}
                {!hasFilters && !params.q && total < 5 && (
                  <p className="mt-6 rounded-xl border border-dashed border-divider bg-bg-surface px-4 py-3 text-center text-[13px] text-text-muted">
                    {t("growingNote")}
                  </p>
                )}
              </>
            )}

            {total > 0 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={total}
                pageSize={pageSize}
                searchParams={params as Record<string, string | undefined>}
                basePath={basePath}
                /* No pageSizeOptions here: <ResultToolbar> above already owns
                   "Rows per page". Passing it to both rendered the same
                   control twice on one screen — once where you set the view
                   up, once at the foot of it. The footer keeps page
                   navigation only, matching the theses listing. */
              />
            )}
          </div>
        </div>
      </div>
    </ClientNavWrapper>
  );
}
