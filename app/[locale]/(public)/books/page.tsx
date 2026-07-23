/* eslint-disable @typescript-eslint/no-explicit-any */
import { Suspense } from "react";
import type { Metadata } from "next";
import BookCard from "@/components/ui/books/BookCard";
import Pagination from "@/components/ui/core/Pagination";
import SearchBar from "@/components/ui/search/SearchBar";
import Icon from "@/components/ui/core/Icon";
import {
  getBooksPage,
  getDepartmentsCached,
  getLanguagesCached,
  getFormatsCached,
  type BooksListParams,
} from "@/lib/books-data";
import { PAGE_SIZE_OPTIONS, resolvePageSize } from "@/lib/pagination";
import { ClientNavWrapper, FilterLink, FilterSelect, SortSelect } from "@/components/ui/books/ClientNavWrapper";
import { buttonClasses } from "@/components/ui/core/Button";
import BookRequestForm from "@/components/ui/books/BookRequestForm";
import MobileFilterSheet from "@/components/ui/books/MobileFilterSheet";
import { getTranslations } from 'next-intl/server';
import { buildListingMetadata, parsePageParam } from "@/lib/seo/listing-metadata";
import { booksCollectionJsonLd, FALLBACK_OG_IMAGE } from "@/lib/seo/book-seo";
import JsonLd from "@/components/seo/JsonLd";
import { getOrgIdentity } from "@/lib/system-settings/config";
import { getCollectionStats } from "@/lib/collection-stats";
import { chooseCountLabel } from "@/lib/listing-count";

// The route renders per-request (it reads searchParams), but every Supabase
// read is served from unstable_cache in lib/books-data.ts (tag: "books"),
// invalidated by admin mutations via revalidateTag.

type SearchParams = {
  q?: string;
  dept?: string;
  format?: string;
  language?: string;
  page?: string;
  sort?: string;
  size?: string;
};

export async function generateMetadata({
  searchParams,
  params: routeParams,
}: {
  searchParams: Promise<SearchParams>;
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const { locale } = await routeParams;
  const t = await getTranslations({ locale, namespace: "books" });
  const page = parsePageParam(params.page);
  const hasFilters = !!(
    params.q ||
    params.dept ||
    params.format ||
    params.language ||
    params.sort ||
    params.size
  );

  // Clean (indexable) listing pages get the live collection count in the
  // description and noindex past the last page. Served from the same
  // unstable_cache entry the page render uses, so this adds no extra query.
  let total = 0;
  let onPageCount = -1;
  if (!hasFilters) {
    const res = await getBooksPage({}, page, resolvePageSize(undefined));
    total = res.total;
    onPageCount = res.books.length;
  }

  return buildListingMetadata({
    org: await getOrgIdentity(),
    path: "/books",
    locale,
    title: t("seoTitle"),
    description:
      total > 0
        ? t("seoDescription", { count: total })
        : t("seoDescriptionEvergreen"),
    page,
    hasFilters,
    image: FALLBACK_OG_IMAGE,
    imageAlt: t("seoTitle"),
    pageLabel: t("pageLabel"),
    outOfRange: page > 1 && onPageCount === 0,
  });
}

export default async function BooksPage({
  searchParams,
  params: routeParams,
}: {
  searchParams: Promise<SearchParams>;
  params: Promise<{ locale: string }>;
}) {
  const t = await getTranslations('books');
  const params = await searchParams;
  const { locale } = await routeParams;
  const basePath = locale === "km" ? "/km/books" : "/books";

  // Fixed key order → stable unstable_cache key.
  const listParams: BooksListParams = {
    q: params.q,
    dept: params.dept,
    format: params.format,
    language: params.language,
    sort: params.sort,
  };
  const requestedPage = Math.max(1, Number(params.page) || 1);
  const pageSize = resolvePageSize(params.size);

  const [{ books, total }, departments, languages, formats, stats] = await Promise.all([
    getBooksPage(listParams, requestedPage, pageSize),
    getDepartmentsCached(),
    getLanguagesCached(),
    getFormatsCached(),
    getCollectionStats(),
  ]);

  const hasFilters = !!(
    params.q ||
    params.dept ||
    params.language ||
    params.format
  );
  const categoryPills = ["All", ...departments];

  // `total` is the exact DB count for the ACTIVE filters — never books.length,
  // which is only the current page. `stats.books` is the canonical published
  // e-book total (identical predicate to the listing query, so the unfiltered
  // listing and the homepage "E-books" figure are the same number by
  // construction). With filters on, both are shown: "24 of 116 e-books".
  const countChoice = chooseCountLabel(total, stats?.books ?? null, hasFilters);
  const countLabel =
    countChoice.kind === "none"
      ? t("noResults")
      : countChoice.kind === "filtered"
        ? t("resourcesFiltered", { count: countChoice.count, total: countChoice.total })
        : t(countChoice.count === 1 ? "resources" : "resourcesPlural", { count: countChoice.count });

  // Structured data only for the clean, indexable listing (no filter/search/
  // sort params): the schema URL must equal the page's canonical URL, and
  // filtered variants are noindex anyway.
  const isCleanListing = !(
    params.q ||
    params.dept ||
    params.format ||
    params.language ||
    params.sort ||
    params.size
  );
  const collectionSchema = isCleanListing
    ? booksCollectionJsonLd({
        org: await getOrgIdentity(),
        locale,
        page: requestedPage,
        pageSize,
        total,
        name: t("seoTitle"),
        description:
          total > 0
            ? t("seoDescription", { count: total })
            : t("seoDescriptionEvergreen"),
        books: books.map((b) => ({ slug: b.slug, title: b.title })),
      })
    : null;

  return (
    <ClientNavWrapper>
    {collectionSchema && <JsonLd data={collectionSchema} />}
    <div className="min-h-screen bg-bg-body">
      {/* ── Header ── */}
      <div className="border-b border-divider bg-bg-surface px-4 py-4 md:px-12 md:py-7">
        <div className="mx-auto max-w-[1400px]">
          {/* Title row */}
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-khmer-serif text-2xl font-bold text-text-heading">{t('h1')}</h1>
              <p className="mt-0.5 text-sm text-text-muted">{t('subtitle')}</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Hidden on mobile — the MobileFilterSheet toolbar owns the
                  count there (and announces updates via aria-live). */}
              <p className="hidden shrink-0 text-sm text-text-muted md:block">
                {countLabel}
                {params.q && <> {t('resultsFor')} &ldquo;{params.q}&rdquo;</>}
              </p>
              <BookRequestForm />
            </div>
          </div>
          {/* Search bar */}
          <div className="mb-5">
            <Suspense
              fallback={<div className="h-11 rounded-xl bg-paper" />}
            >
              <SearchBar />
            </Suspense>
          </div>

          {/* Mobile toolbar + filter sheet (md:hidden inside the component) */}
          <MobileFilterSheet
            basePath={basePath}
            total={total}
            countLabel={countLabel}
            dept={params.dept}
            language={params.language}
            format={params.format}
            sort={params.sort}
            departments={departments}
            languages={languages}
            formats={formats}
            sortOptions={[
              { value: "newest", label: t('sortNewest') },
              { value: "oldest", label: t('sortOldest') },
              { value: "title_asc", label: t('sortTitleAsc') },
              { value: "downloads", label: t('sortDownloads') },
            ]}
          />

          {/* Desktop filters row */}
          <div className="hidden flex-col gap-2 min-w-0 w-full md:flex">
            {/* Category pills — horizontal scroll */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none min-w-0 w-full">
              {categoryPills.map((cat) => {
                const isAll = cat === "All";
                const isActive = isAll ? !params.dept : params.dept === cat;
                const href = isAll
                  ? buildHref(basePath, params, { dept: undefined, page: undefined })
                  : buildHref(basePath, params, { dept: cat, page: undefined });
                return (
                  <FilterLink
                    key={cat}
                    href={href}
                    className={`shrink-0 rounded-full px-3.5 py-[6px] text-[12px] font-medium whitespace-nowrap transition-all border sm:px-4 sm:text-[13px] ${
                      isActive
                        ? "bg-brand text-brand-contrast border-brand shadow-sm shadow-brand/20"
                        : "bg-paper text-text-muted border-divider hover:bg-brand/5 hover:text-brand hover:border-brand/30"
                    }`}
                  >
                    {cat}
                  </FilterLink>
                );
              })}
            </div>

            {/* Sort & Filters — single row, horizontally scrollable on mobile */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none w-full">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] text-text-muted font-medium uppercase tracking-wider">
                  {t('sortLabel')}
                </span>
                <SortSelect
                  value={params.sort || "newest"}
                  options={[
                    { value: "newest", label: t('sortNewest') },
                    { value: "oldest", label: t('sortOldest') },
                    { value: "title_asc", label: t('sortTitleAsc') },
                    { value: "downloads", label: t('sortDownloads') },
                  ]}
                  defaultLabel={t('sortLabel')}
                  paramKey="sort"
                  basePath={basePath}
                />
              </div>
              <div className="w-px h-4 bg-divider shrink-0" />
              <div className="shrink-0">
                <FilterSelect
                  value={params.language || ""}
                  options={languages}
                  defaultLabel={t('filterLanguage')}
                  paramKey="language"
                  basePath={basePath}
                />
              </div>
              <div className="shrink-0">
                <FilterSelect
                  value={params.format || ""}
                  options={formats}
                  defaultLabel={t('filterFormat')}
                  paramKey="format"
                  basePath={basePath}
                />
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Grid ── */}
      <div className="mx-auto max-w-[1400px] px-4 py-5 md:px-12 md:py-8">
        {/* Active filter chips */}
        {hasFilters && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {params.dept && (
              <ActiveChip
                label={params.dept}
                paramKey="dept"
                searchParams={params}
                basePath={basePath}
              />
            )}
            {params.language && (
              <ActiveChip
                label={t('activeFilterLanguage', { value: params.language })}
                paramKey="language"
                searchParams={params}
                basePath={basePath}
              />
            )}
            {params.format && (
              <ActiveChip
                label={t('activeFilterFormat', { value: params.format })}
                paramKey="format"
                searchParams={params}
                basePath={basePath}
              />
            )}
            {params.q && (
              <ActiveChip
                label={`"${params.q}"`}
                paramKey="q"
                searchParams={params}
                basePath={basePath}
              />
            )}
          </div>
        )}

        {books.length === 0 ? (
          <EmptyState hasFilters={hasFilters} query={params.q} t={t} basePath={basePath} />
        ) : (
          <>
            {/* Card titles are h3s; this keeps the h1 → h2 → h3 outline intact */}
            <h2 className="sr-only">{total > 0 ? countLabel : t('title')}</h2>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-4">
              {books.map((book, i) => (
                <BookCard key={book.slug} book={book} priority={i < 6} />
              ))}
            </div>
            <Pagination
              currentPage={requestedPage}
              totalPages={Math.ceil(total / pageSize)}
              totalItems={total}
              pageSize={pageSize}
              searchParams={params}
              basePath={basePath}
              pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
            />
          </>
        )}
      </div>
    </div>
    </ClientNavWrapper>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildHref(
  basePath: string,
  searchParams: SearchParams,
  overrides: Partial<SearchParams>
): string {
  const merged = { ...searchParams, ...overrides };
  const p = new URLSearchParams();
  Object.entries(merged).forEach(([k, v]) => {
    if (v) p.set(k, v);
  });
  const qs = p.toString();
  return `${basePath}${qs ? `?${qs}` : ""}`;
}

function ActiveChip({
  label,
  paramKey,
  searchParams,
  basePath,
}: {
  label: string;
  paramKey: keyof SearchParams;
  searchParams: SearchParams;
  basePath: string;
}) {
  return (
    <FilterLink
      href={buildHref(basePath, searchParams, {
        [paramKey]: undefined,
        page: undefined,
      })}
      className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/5 py-1.5 pl-3.5 pr-2.5 text-[12px] font-medium text-brand transition hover:bg-brand/10"
    >
      <span className="truncate break-words min-w-0 max-w-[200px] sm:max-w-[300px]">
        {label}
      </span>
      <span
        aria-hidden
        className="flex h-4 w-4 items-center justify-center rounded-full bg-brand/10 text-[11px] leading-none text-brand"
      >
        ×
      </span>
    </FilterLink>
  );
}

function EmptyState({
  hasFilters,
  query,
  t,
  basePath,
}: {
  hasFilters: boolean;
  query?: string;
  t: any;
  basePath: string;
}) {
  return (
    <div className="flex min-h-[280px] sm:min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-divider bg-bg-surface p-6 sm:p-10 text-center">
      <Icon name="search-off" className="mb-3 text-4xl sm:text-5xl text-text-muted" />
      <h2 className="text-lg sm:text-xl font-bold text-text-body">{t('emptyTitle')}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-text-muted">
        {query
          ? t('emptyHintQuery', { query })
          : hasFilters
            ? t('emptyHintFilters')
            : t('emptyHintEmpty')}
      </p>
      {hasFilters && (
        <FilterLink href={basePath} className={buttonClasses("primary", "md", "mt-5")}>
          {t('clearFilters')}
        </FilterLink>
      )}
    </div>
  );
}