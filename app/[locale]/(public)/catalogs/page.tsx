/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// app/catalogs/page.tsx
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { CatalogBook } from "@/lib/catalog";
import { getAvailability } from "@/lib/catalog";
import CatalogCard from "@/components/ui/books/CatalogCard";
import CatalogSearchBar from "@/components/ui/search/CatalogSearchBar";
import Pagination from "@/components/ui/core/Pagination";
import { ClientNavWrapper } from "@/components/ui/books/ClientNavWrapper";
import { PAGE_SIZE_OPTIONS, resolvePageSize } from "@/lib/pagination";
import { getTranslations } from 'next-intl/server';
import { buildListingMetadata, parsePageParam } from "@/lib/seo/listing-metadata";

export const revalidate = 3600;

type SearchParams = {
  q?:           string;
  category?:    string;
  language?:    string;
  availability?:string;   // "available" | "all"
  page?:        string;
  sort?:        string;
  size?:        string;
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
  return buildListingMetadata({
    path: "/catalogs",
    locale,
    title: "Books In Library",
    description:
      "Browse physical books available in the PTEC library. Check availability, shelf location, and borrow status for each title.",
    page: parsePageParam(params.page),
    hasFilters: !!(
      params.q ||
      params.category ||
      params.language ||
      params.availability ||
      params.sort ||
      params.size
    ),
  });
}

// ── Fetch ──────────────────────────────────────────────────────────────────────
const fetchCatalogBooks = unstable_cache(
  async (params: SearchParams) => {
    const supabase = createPublicClient();
  const page     = Math.max(1, Number(params.page) || 1);
  const pageSize = resolvePageSize(params.size);
  const from     = (page - 1) * pageSize;
  const to       = from + pageSize - 1;
  const rawQ = params.q?.trim();
  const q = rawQ ? rawQ.replace(/[(),.\\]/g, " ").replace(/\s+/g, " ").trim() : undefined;
  const avail  = params.availability;

  const sortMap: Record<string, { column: string; asc: boolean }> = {
    newest:    { column: "created_at",   asc: false },
    oldest:    { column: "created_at",   asc: true  },
    title_asc: { column: "title",        asc: true  },
    available: { column: "copies_available", asc: false },
  };
  const sortKey = (params.sort && sortMap[params.sort]) ? params.sort : "newest";
  const { column, asc } = sortMap[sortKey];

  let query = supabase
    .from("catalog_books")
    .select("*", { count: "exact" })
    .eq("is_active", true)
    .order(column, { ascending: asc })
    .range(from, to);

  if (q) {
    let kwIds: string[] = [];
    const { data: kwMatches } = await supabase
      .from("catalog_books")
      .select("id")
      .filter("keywords::text", "ilike", `%${q}%`)
      .eq("is_active", true);
    kwIds = kwMatches?.map(r => r.id) ?? [];
    
    let orStr = `title.ilike.%${q}%,author.ilike.%${q}%,isbn.ilike.%${q}%,accession_number.ilike.%${q}%`;
    if (kwIds.length > 0) {
      orStr += `,id.in.(${kwIds.join(",")})`;
    }
    query = query.or(orStr);
  }
  if (params.category)    query = query.ilike("category", `%${params.category}%`);
  if (params.language)    query = query.eq("language", params.language);
  if (avail === "available") query = query.gt("copies_available", 0);

  const { data, error, count } = await query;
    if (error) { console.error(error.message); return { books: [] as CatalogBook[], total: 0, page }; }
    return { books: (data ?? []) as CatalogBook[], total: count ?? 0, page };
  },
  ["catalog-books-query"],
  { revalidate: 3600, tags: ["catalog_books"] }
);

const fetchCategories = unstable_cache(
  async (): Promise<string[]> => {
    const supabase = createPublicClient();
  const { data } = await supabase
    .from("catalog_books")
    .select("category")
    .eq("is_active", true)
    .not("category", "is", null);
    const unique = [...new Set((data ?? []).map((r: any) => r.category).filter(Boolean))];
    return unique.sort() as string[];
  },
  ["catalog-categories"],
  { revalidate: 3600, tags: ["catalog_books"] }
);

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildHref(sp: SearchParams, overrides: Partial<SearchParams>) {
  const merged = { ...sp, ...overrides };
  const p = new URLSearchParams();
  Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v); });
  const qs = p.toString();
  return `/catalogs${qs ? `?${qs}` : ""}`;
}

function pillClass(active: boolean) {
  return `shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-all ${
    active
      ? "bg-brand border-brand text-brand-contrast shadow-sm"
      : "border-divider bg-bg-surface text-text-body hover:border-brand hover:text-brand"
  }`;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function CatalogsPage({
  searchParams,
  params: routeParams,
}: {
  searchParams: Promise<SearchParams>;
  params: Promise<{ locale: string }>;
}) {
  const t = await getTranslations('catalogs');
  const params = await searchParams;
  const { locale } = await routeParams;
  const basePath = locale === "km" ? "/km/catalogs" : "/catalogs";
  const [{ books, total, page }, categories] = await Promise.all([
    fetchCatalogBooks(params),
    fetchCategories(),
  ]);

  const pageSize   = resolvePageSize(params.size);
  const totalPages = Math.ceil(total / pageSize);
  const hasFilters = !!(params.q || params.category || params.language || params.availability);

  const availOnlyCount = books.filter((b) => getAvailability(b) === "available").length;

  return (
    <ClientNavWrapper>
    <div className="min-h-screen bg-paper">

      {/* ── Header ── */}
      <div className="border-b border-divider bg-bg-surface px-4 py-6 md:px-12">
        <div className="mx-auto max-w-[1400px] space-y-4">

          {/* Title row */}
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-khmer-serif text-2xl font-bold text-text-heading">{t('title')}</h1>
              <p className="mt-0.5 text-sm text-text-muted">
                {t('subtitle')}
              </p>
            </div>
            <p className="text-sm text-text-muted">
              {t(total === 1 ? 'booksCount' : 'booksCountPlural', { count: total })}
              {params.q && <> {t('resultsFor')} &ldquo;{params.q}&rdquo;</>}
            </p>
          </div>

          {/* Search bar */}
          <Suspense fallback={<div className="h-11 w-full rounded-xl bg-paper animate-pulse" />}>
            <CatalogSearchBar />
          </Suspense>

          {/* Filter pills row */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

            {/* Category pills */}
            <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <Link href={buildHref(params, { category: undefined, page: undefined })}
                 className={pillClass(!params.category)}>{t('all')}</Link>
              {categories.map((cat) => (
                <Link key={cat}
                   href={buildHref(params, { category: cat, page: undefined })}
                   className={pillClass(params.category === cat)}>
                  {cat}
                </Link>
              ))}
            </div>

            {/* Right: availability toggle + sort */}
            <div className="flex shrink-0 items-center gap-3">
              {/* Available only (green = semantic availability) */}
              <Link
                href={
                  params.availability === "available"
                    ? buildHref(params, { availability: undefined, page: undefined })
                    : buildHref(params, { availability: "available", page: undefined })
                }
                className={`
                  flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-all
                  ${params.availability === "available"
                    ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                    : "border-divider bg-bg-surface text-text-body hover:border-emerald-300 hover:text-emerald-700"}
                `}
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {t('availableOnly')}
              </Link>

              {/* Sort */}
              <span className="hidden text-[12px] font-medium text-text-muted sm:inline">{t('sort')}</span>
              {[
                { key: "newest",    label: t('sortNewest') },
                { key: "title_asc", label: t('sortTitleAsc') },
              ].map(({ key, label }) => (
                <Link
                  key={key}
                  href={buildHref(params, { sort: key, page: undefined })}
                  className={`hidden rounded-full border px-3 py-1 text-[11px] font-semibold transition-all sm:block ${
                    (params.sort ?? "newest") === key
                      ? "bg-brand border-brand text-brand-contrast"
                      : "border-divider bg-bg-surface text-text-muted hover:border-brand hover:text-brand"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* Active filter chips */}
          {hasFilters && (
            <div className="flex flex-wrap items-center gap-2">
              {params.q && (
                <Link href={buildHref(params, { q: undefined, page: undefined })}
                   className="inline-flex items-center gap-1.5 rounded-full bg-brand/5 py-1 pl-3 pr-2 text-[12px] font-semibold text-brand transition hover:bg-brand/10">
                  &ldquo;{params.q}&rdquo;
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand/15 text-[11px]">×</span>
                </Link>
              )}
              {params.category && (
                <Link href={buildHref(params, { category: undefined, page: undefined })}
                   className="inline-flex items-center gap-1.5 rounded-full bg-brand/5 py-1 pl-3 pr-2 text-[12px] font-semibold text-brand transition hover:bg-brand/10">
                  {params.category}
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand/15 text-[11px]">×</span>
                </Link>
              )}
              {params.availability && (
                <Link href={buildHref(params, { availability: undefined, page: undefined })}
                   className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 py-1 pl-3 pr-2 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-100">
                  {t('availableOnly')}
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-200 text-[11px]">×</span>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-12">
        {books.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-divider bg-bg-surface p-10 text-center">
            <svg className="mb-4 h-12 w-12 text-text-muted/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            {!params.q && !hasFilters ? (
              /* Catalog genuinely empty — the collection is still being catalogued */
              <>
                <h2 className="font-khmer-serif text-xl font-bold text-text-heading">{t('emptyPreparingTitle')}</h2>
                <p className="mt-2 max-w-md text-sm text-text-muted">{t('emptyPreparingBody')}</p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                  <Link href="/books" className="inline-flex h-10 items-center rounded-xl bg-brand px-6 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover">
                    {t('emptyPreparingCtaBooks')}
                  </Link>
                  <Link href="/contact" className="inline-flex h-10 items-center rounded-xl border border-divider px-6 text-sm font-semibold text-text-heading transition hover:bg-bg-muted">
                    {t('emptyPreparingCtaContact')}
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h2 className="font-khmer-serif text-xl font-bold text-text-heading">{t('noBooksFound')}</h2>
                <p className="mt-2 max-w-sm text-sm text-text-muted">
                  {params.q ? t('emptyMatchQuery', { query: params.q }) : t('emptyHintFilters')}
                </p>
                <Link href="/catalogs" className="mt-5 inline-flex h-10 items-center rounded-xl bg-brand px-6 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover">
                  {t('clearFilters')}
                </Link>
              </>
            )}
          </div>
        ) : (
          <>
            {/* 2 → 3 → 4 → 5 → 6 cols */}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-4">
              {books.map((book) => (
                <CatalogCard key={book.slug} book={book} />
              ))}
            </div>

            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={total}
              pageSize={pageSize}
              searchParams={params as Record<string, string | undefined>}
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