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
  BOOKS_PAGE_SIZE,
  type BooksListParams,
} from "@/lib/books-data";
import { ClientNavWrapper, FilterLink, FilterSelect, SortSelect } from "@/components/ui/books/ClientNavWrapper";
import BookRequestForm from "@/components/ui/books/BookRequestForm";
import { getTranslations } from 'next-intl/server';
import { SITE_URL } from "@/lib/seo/site";
import JsonLd from "@/components/seo/JsonLd";

// The route renders per-request (it reads searchParams), but every Supabase
// read is served from unstable_cache in lib/books-data.ts (tag: "books"),
// invalidated by admin mutations via revalidateTag.

export const metadata: Metadata = {
  title: "Books",
  description: "Browse the PTEC digital library collection — teaching resources, textbooks, and educational materials available to read online or download.",
  alternates: {
    canonical: `${SITE_URL}/books`,
  },
  openGraph: {
    title: "Books | PTEC Library",
    description: "Browse the PTEC digital library collection of teaching resources and textbooks.",
    url: `${SITE_URL}/books`,
    type: "website",
  },
};

type SearchParams = {
  q?: string;
  dept?: string;
  format?: string;
  language?: string;
  page?: string;
  sort?: string;
};

export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('books');
  const params = await searchParams;

  // Fixed key order → stable unstable_cache key.
  const listParams: BooksListParams = {
    q: params.q,
    dept: params.dept,
    format: params.format,
    language: params.language,
    sort: params.sort,
  };
  const requestedPage = Math.max(1, Number(params.page) || 1);

  const [{ books, total }, departments, languages, formats] = await Promise.all([
    getBooksPage(listParams, requestedPage),
    getDepartmentsCached(),
    getLanguagesCached(),
    getFormatsCached(),
  ]);

  const hasFilters = !!(
    params.q ||
    params.dept ||
    params.language ||
    params.format
  );
  const categoryPills = ["All", ...departments];

  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Books — PTEC Digital Library",
    description: "Browse free teaching resources, textbooks, and educational materials from Phnom Penh Teacher Education College.",
    url: `${SITE_URL}/books`,
    isAccessibleForFree: true,
    inLanguage: ["km", "en"],
    hasPart: books.slice(0, 10).map((b) => ({
      "@type": "Book",
      name: b.title,
      url: `${SITE_URL}/books/${b.slug}`,
      isAccessibleForFree: true,
      bookFormat: "https://schema.org/EBook",
    })),
  };

  return (
    <ClientNavWrapper>
    <JsonLd data={collectionSchema} />
    <div className="min-h-screen bg-bg-body">
      {/* ── Header ── */}
      <div className="border-b border-divider bg-bg-surface px-4 py-4 md:px-12 md:py-7">
        <div className="mx-auto max-w-[1400px]">
          {/* Title row */}
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-khmer-serif text-2xl font-bold text-text-heading">{t('title')}</h1>
              <p className="mt-0.5 text-sm text-text-muted">{t('subtitle')}</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="shrink-0 text-sm text-text-muted">
                {total > 0
                  ? t(total === 1 ? 'resources' : 'resourcesPlural', { count: total })
                  : t('noResults')}
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

          {/* Filters row */}
          <div className="flex flex-col gap-2 min-w-0 w-full">
            {/* Category pills — horizontal scroll */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none min-w-0 w-full">
              {categoryPills.map((cat) => {
                const isAll = cat === "All";
                const isActive = isAll ? !params.dept : params.dept === cat;
                const href = isAll
                  ? buildHref(params, { dept: undefined, page: undefined })
                  : buildHref(params, { dept: cat, page: undefined });
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
                />
              </div>
              <div className="w-px h-4 bg-divider shrink-0" />
              <div className="shrink-0">
                <FilterSelect
                  value={params.language || ""}
                  options={languages}
                  defaultLabel={t('filterLanguage')}
                  paramKey="language"
                />
              </div>
              <div className="shrink-0">
                <FilterSelect
                  value={params.format || ""}
                  options={formats}
                  defaultLabel={t('filterFormat')}
                  paramKey="format"
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
            {params.language && (
              <ActiveChip
                label={t('activeFilterLanguage', { value: params.language })}
                paramKey="language"
                searchParams={params}
              />
            )}
            {params.format && (
              <ActiveChip
                label={t('activeFilterFormat', { value: params.format })}
                paramKey="format"
                searchParams={params}
              />
            )}
            {params.q && (
              <ActiveChip
                label={`"${params.q}"`}
                paramKey="q"
                searchParams={params}
              />
            )}
          </div>
        )}

        {books.length === 0 ? (
          <EmptyState hasFilters={hasFilters} query={params.q} t={t} />
        ) : (
          <>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-4">
              {books.map((book, i) => (
                <BookCard key={book.slug} book={book} priority={i < 6} />
              ))}
            </div>
            <Pagination
              currentPage={requestedPage}
              totalPages={Math.ceil(total / BOOKS_PAGE_SIZE)}
              totalItems={total}
              pageSize={BOOKS_PAGE_SIZE}
              searchParams={params}
              basePath="/books"
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
  searchParams: SearchParams,
  overrides: Partial<SearchParams>
): string {
  const merged = { ...searchParams, ...overrides };
  const p = new URLSearchParams();
  Object.entries(merged).forEach(([k, v]) => {
    if (v) p.set(k, v);
  });
  const qs = p.toString();
  return `/books${qs ? `?${qs}` : ""}`;
}

function sortPillClass(
  current: string | undefined,
  value: string,
  isDefault: boolean
): string {
  const active = current === value || (isDefault && !current);
  return `rounded-full border px-3 py-[5px] text-[11px] font-medium whitespace-nowrap transition-all sm:text-[12px] ${
    active
      ? "bg-brand text-brand-contrast border-brand shadow-sm shadow-brand/20"
      : "bg-paper text-text-muted border-divider hover:bg-brand/5 hover:text-brand hover:border-brand/30"
  }`;
}

function ActiveChip({
  label,
  paramKey,
  searchParams,
}: {
  label: string;
  paramKey: keyof SearchParams;
  searchParams: SearchParams;
}) {
  return (
    <FilterLink
      href={buildHref(searchParams, {
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
}: {
  hasFilters: boolean;
  query?: string;
  t: any;
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
        <FilterLink
          href="/books"
          className="mt-5 inline-flex h-10 items-center rounded-full bg-brand px-6 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover"
        >
          {t('clearFilters')}
        </FilterLink>
      )}
    </div>
  );
}