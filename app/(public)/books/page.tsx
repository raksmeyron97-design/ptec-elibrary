import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { type Book, mapRowToBook } from "@/lib/books";
import BookCard from "@/components/ui/books/BookCard";
import SearchBar from "@/components/ui/search/SearchBar";
import Icon from "@/components/ui/core/Icon";
import Pagination from "@/components/ui/core/Pagination";
import { getDepartments } from "@/app/actions/departments";
import { getLanguages, getFormats } from "@/app/actions/filters";
import { ClientNavWrapper, FilterLink, FilterSelect, SortSelect } from "@/components/ui/books/ClientNavWrapper";
import { getTranslations } from 'next-intl/server';
export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  dept?: string;
  format?: string;
  language?: string;
  page?: string;
  sort?: string;
};

const PAGE_SIZE = 15;

async function fetchBooks(params: SearchParams) {
  const supabase = await createClient();
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const rawQ = params.q?.trim();
  const q = rawQ ? rawQ.replace(/[(),.\\]/g, " ").replace(/\s+/g, " ").trim() : undefined;
  const dept = params.dept?.trim();
  const language = params.language?.trim();
  const format = params.format?.trim();

  let authorBookIds: string[] | null = null;
  let categoryBookIds: string[] | null = null;

  if (q) {
    const { data: matchingAuthors } = await supabase
      .from("authors")
      .select("id")
      .ilike("name", `%${q}%`);
    if (matchingAuthors?.length) {
      const { data: baf } = await supabase
        .from("books")
        .select("id")
        .in(
          "author_id",
          matchingAuthors.map((a) => a.id)
        )
        .eq("is_published", true);
      authorBookIds = baf?.map((b) => b.id) ?? [];
    }
    const { data: matchingCategories } = await supabase
      .from("categories")
      .select("id")
      .ilike("name", `%${q}%`);
    if (matchingCategories?.length) {
      const { data: bcf } = await supabase
        .from("books")
        .select("id")
        .in(
          "category_id",
          matchingCategories.map((c) => c.id)
        )
        .eq("is_published", true);
      categoryBookIds = bcf?.map((b) => b.id) ?? [];
    }
  }

  type SortOrder = { ascending: boolean; nullsFirst?: boolean };
  const sortMap: Record<string, { column: string; opts: SortOrder }> = {
    newest: { column: "published_at", opts: { ascending: false } },
    oldest: { column: "published_at", opts: { ascending: true } },
    downloads: { column: "download_count", opts: { ascending: false } },
    rating: { column: "rating", opts: { ascending: false } },
    title_asc: { column: "title", opts: { ascending: true } },
  };
  const sortKey =
    params.sort && sortMap[params.sort] ? params.sort : "newest";
  const { column: sortCol, opts: sortOpts } = sortMap[sortKey];

  let query = supabase
    .from("books")
    .select(
      `id, title, slug, description, cover_color, cover_url, language,
       published_at, department, pages, isbn, rating, download_count,
       view_count,
       authors(name), categories(name), book_files(format, file_url, file_size_kb)`,
      { count: "exact" }
    )
    .eq("is_published", true)
    .order(sortCol, sortOpts)
    .range(from, to);

  if (q) {
    const relatedIds = [
      ...new Set([...(authorBookIds ?? []), ...(categoryBookIds ?? [])]),
    ];
    const directOr = [
      `title.ilike.%${q}%`,
      `description.ilike.%${q}%`,
      `language.ilike.%${q}%`,
      `isbn.ilike.%${q}%`,
    ];
    if (relatedIds.length > 0)
      directOr.push(`id.in.(${relatedIds.join(",")})`);
    query = query.or(directOr.join(","));
  }
  if (dept) query = query.ilike("department", `%${dept}%`);
  if (language) query = query.ilike("language", `%${language}%`);
  if (format) {
    const { data: bf } = await supabase
      .from("book_files")
      .select("book_id")
      .ilike("format", `%${format}%`);
    const formatBookIds = bf?.map((f) => f.book_id) ?? [];
    if (formatBookIds.length > 0) {
      query = query.in("id", formatBookIds);
    } else {
      query = query.in("id", ["00000000-0000-0000-0000-000000000000"]);
    }
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("Supabase error:", error.message);
    return { books: [], total: 0, page };
  }
  return { books: (data ?? []).map(mapRowToBook), total: count ?? 0, page };
}

export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations('books');
  const params = await searchParams;
  const [{ books, total, page }, departments, languages, formats] = await Promise.all([
    fetchBooks(params),
    getDepartments(),
    getLanguages(),
    getFormats(),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = !!(
    params.q ||
    params.dept ||
    params.language ||
    params.format
  );
  const categoryPills = ["All", ...departments];

  return (
    <ClientNavWrapper>
    <div className="min-h-screen bg-bg-body">
      {/* ── Header ── */}
      <div className="border-b border-divider bg-bg-surface px-4 py-4 md:px-12 md:py-7">
        <div className="mx-auto max-w-[1400px]">
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

            {/* Sort & Filters — single row, no divider that breaks on wrap */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
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
              <FilterSelect
                value={params.language || ""}
                options={languages}
                defaultLabel={t('filterLanguage')}
                paramKey="language"
              />
              <FilterSelect
                value={params.format || ""}
                options={formats}
                defaultLabel={t('filterFormat')}
                paramKey="format"
              />
            </div>
          </div>

          {/* Result count */}
          <p className="mt-3 text-[12px] text-text-muted sm:text-[13px]">
            {total > 0
              ? t(total === 1 ? 'resources' : 'resourcesPlural', { count: total })
              : t('noResults')}
            {params.q && (
              <>
                {" "}
                {t('resultsFor')} &ldquo;{params.q}&rdquo;
              </>
            )}
          </p>
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
            <div className="grid gap-3 grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {books.map((book) => (
                <BookCard key={book.slug} book={book} />
              ))}
            </div>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={total}
              pageSize={PAGE_SIZE}
              searchParams={params as Record<string, string | undefined>}
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