// app/catalogs/page.tsx
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import type { CatalogBook } from "@/lib/catalog";
import { getAvailability } from "@/lib/catalog";
import CatalogCard from "@/components/ui/books/CatalogCard";
import CatalogSearchBar from "@/components/ui/search/CatalogSearchBar";
import Pagination from "@/components/ui/core/Pagination";
import { getTranslations } from 'next-intl/server';

export const revalidate = 3600;

type SearchParams = {
  q?:           string;
  category?:    string;
  language?:    string;
  availability?:string;   // "available" | "all"
  page?:        string;
  sort?:        string;
};

const PAGE_SIZE = 18;

// ── Fetch ──────────────────────────────────────────────────────────────────────
async function fetchCatalogBooks(params: SearchParams) {
  const supabase = await createClient();
  const page   = Math.max(1, Number(params.page) || 1);
  const from   = (page - 1) * PAGE_SIZE;
  const to     = from + PAGE_SIZE - 1;
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

  if (q)                  query = query.or(`title.ilike.%${q}%,author.ilike.%${q}%,isbn.ilike.%${q}%,accession_number.ilike.%${q}%`);
  if (params.category)    query = query.ilike("category", `%${params.category}%`);
  if (params.language)    query = query.eq("language", params.language);
  if (avail === "available") query = query.gt("copies_available", 0);

  const { data, error, count } = await query;
  if (error) { console.error(error.message); return { books: [] as CatalogBook[], total: 0, page }; }
  return { books: (data ?? []) as CatalogBook[], total: count ?? 0, page };
}

async function fetchCategories(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("catalog_books")
    .select("category")
    .eq("is_active", true)
    .not("category", "is", null);
  const unique = [...new Set((data ?? []).map((r: any) => r.category).filter(Boolean))];
  return unique.sort() as string[];
}

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
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('catalogs');
  const params = await searchParams;
  const [{ books, total, page }, categories] = await Promise.all([
    fetchCatalogBooks(params),
    fetchCategories(),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = !!(params.q || params.category || params.language || params.availability);

  const availOnlyCount = books.filter((b) => getAvailability(b) === "available").length;

  return (
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
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <a href={buildHref(params, { category: undefined, page: undefined })}
                 className={pillClass(!params.category)}>{t('all')}</a>
              {categories.map((cat) => (
                <a key={cat}
                   href={buildHref(params, { category: cat, page: undefined })}
                   className={pillClass(params.category === cat)}>
                  {cat}
                </a>
              ))}
            </div>

            {/* Right: availability toggle + sort */}
            <div className="flex shrink-0 items-center gap-3">
              {/* Available only (green = semantic availability) */}
              <a
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
              </a>

              {/* Sort */}
              <span className="hidden text-[12px] font-medium text-text-muted sm:inline">{t('sort')}</span>
              {[
                { key: "newest",    label: t('sortNewest') },
                { key: "title_asc", label: t('sortTitleAsc') },
              ].map(({ key, label }) => (
                <a
                  key={key}
                  href={buildHref(params, { sort: key, page: undefined })}
                  className={`hidden rounded-full border px-3 py-1 text-[11px] font-semibold transition-all sm:block ${
                    (params.sort ?? "newest") === key
                      ? "bg-brand border-brand text-brand-contrast"
                      : "border-divider bg-bg-surface text-text-muted hover:border-brand hover:text-brand"
                  }`}
                >
                  {label}
                </a>
              ))}
            </div>
          </div>

          {/* Active filter chips */}
          {hasFilters && (
            <div className="flex flex-wrap items-center gap-2">
              {params.q && (
                <a href={buildHref(params, { q: undefined, page: undefined })}
                   className="inline-flex items-center gap-1.5 rounded-full bg-brand/5 py-1 pl-3 pr-2 text-[12px] font-semibold text-brand transition hover:bg-brand/10">
                  &ldquo;{params.q}&rdquo;
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand/15 text-[11px]">×</span>
                </a>
              )}
              {params.category && (
                <a href={buildHref(params, { category: undefined, page: undefined })}
                   className="inline-flex items-center gap-1.5 rounded-full bg-brand/5 py-1 pl-3 pr-2 text-[12px] font-semibold text-brand transition hover:bg-brand/10">
                  {params.category}
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand/15 text-[11px]">×</span>
                </a>
              )}
              {params.availability && (
                <a href={buildHref(params, { availability: undefined, page: undefined })}
                   className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 py-1 pl-3 pr-2 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-100">
                  {t('availableOnly')}
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-200 text-[11px]">×</span>
                </a>
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
            <h2 className="font-khmer-serif text-xl font-bold text-text-heading">{t('noBooksFound')}</h2>
            <p className="mt-2 max-w-sm text-sm text-text-muted">
              {params.q ? t('emptyMatchQuery', { query: params.q }) : hasFilters ? t('emptyHintFilters') : t('emptyHintEmpty')}
            </p>
            {hasFilters && (
              <a href="/catalogs" className="mt-5 inline-flex h-10 items-center rounded-xl bg-brand px-6 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover">
                {t('clearFilters')}
              </a>
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
              pageSize={PAGE_SIZE}
              searchParams={params as Record<string, string | undefined>}
              basePath="/catalogs"
            />
          </>
        )}
      </div>
    </div>
  );
}