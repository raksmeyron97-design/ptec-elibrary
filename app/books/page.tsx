import { Suspense } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { type Book, mapRowToBook } from "@/lib/books";
import BookCard from "@/components/ui/BookCard";
import SearchBar from "@/components/ui/SearchBar";
import Icon from "@/components/ui/Icon";
import Pagination from "@/components/ui/Pagination";
import { getDepartments } from "@/app/actions/departments";
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
  const supabase = createServiceClient();
  const page     = Math.max(1, Number(params.page) || 1);
  const from     = (page - 1) * PAGE_SIZE;
  const to       = from + PAGE_SIZE - 1;
  const q        = params.q?.trim();
  const dept     = params.dept?.trim();
  const language = params.language?.trim();

  let authorBookIds:   string[] | null = null;
  let categoryBookIds: string[] | null = null;

  if (q) {
    const { data: matchingAuthors } = await supabase.from("authors").select("id").ilike("name", `%${q}%`);
    if (matchingAuthors?.length) {
      const { data: baf } = await supabase.from("books").select("id").in("author_id", matchingAuthors.map(a => a.id)).eq("is_published", true);
      authorBookIds = baf?.map(b => b.id) ?? [];
    }
    const { data: matchingCategories } = await supabase.from("categories").select("id").ilike("name", `%${q}%`);
    if (matchingCategories?.length) {
      const { data: bcf } = await supabase.from("books").select("id").in("category_id", matchingCategories.map(c => c.id)).eq("is_published", true);
      categoryBookIds = bcf?.map(b => b.id) ?? [];
    }
  }

  // Sort logic
  type SortOrder = { ascending: boolean; nullsFirst?: boolean };
  const sortMap: Record<string, { column: string; opts: SortOrder }> = {
    newest:    { column: "published_at",   opts: { ascending: false } },
    oldest:    { column: "published_at",   opts: { ascending: true  } },
    downloads: { column: "download_count", opts: { ascending: false } },
    rating:    { column: "rating",         opts: { ascending: false } },
  };
  const sortKey = params.sort && sortMap[params.sort] ? params.sort : "newest";
  const { column: sortCol, opts: sortOpts } = sortMap[sortKey];

  let query = supabase
    .from("books")
    .select(
      `id, title, slug, description, cover_color, cover_url, language,
       published_at, department, pages, isbn, rating, download_count,
       authors(name), categories(name), book_files(format, file_url, file_size_kb)`,
      { count: "exact" }
    )
    .eq("is_published", true)
    .order(sortCol, sortOpts)
    .range(from, to);

  if (q) {
    const relatedIds = [...new Set([...(authorBookIds ?? []), ...(categoryBookIds ?? [])])];
    const directOr = [`title.ilike.%${q}%`, `description.ilike.%${q}%`, `language.ilike.%${q}%`, `isbn.ilike.%${q}%`];
    if (relatedIds.length > 0) directOr.push(`id.in.(${relatedIds.join(",")})`);
    query = query.or(directOr.join(","));
  }
  if (dept)     query = query.ilike("department", `%${dept}%`);
  if (language) query = query.ilike("language",   `%${language}%`);

  const { data, error, count } = await query;
  if (error) { console.error("Supabase error:", error.message); return { books: [], total: 0, page }; }
  return { books: (data ?? []).map(mapRowToBook), total: count ?? 0, page };
}

export default async function BooksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const [{ books, total, page }, departments] = await Promise.all([fetchBooks(params), getDepartments()]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasFilters = !!(params.q || params.dept || params.language || params.format);
  const categoryPills = [
    "All",
    ...departments,
  ];

  return (
    <div className="min-h-screen bg-[#F5F6FA]">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 px-4 py-5 md:px-12 md:py-8">
        <div className="mx-auto max-w-[1400px]">

          {/* Search bar — full width on mobile */}
          <div className="mb-4">
            <Suspense fallback={<div className="h-10 rounded-xl bg-slate-100" />}>
              <SearchBar />
            </Suspense>
          </div>

          {/* Pills row + Sort — pills scroll horizontally, Sort wraps below on mobile */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">

            {/* Category pills — scrollable */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {categoryPills.map((cat) => {
                const isAll    = cat === "All";
                const isActive = isAll ? !params.dept : params.dept === cat;
                const href     = isAll
                  ? buildHref(params, { dept: undefined, page: undefined })
                  : buildHref(params, { dept: cat,       page: undefined });
                return (
                  <a
                    key={cat}
                    href={href}
                    className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-all sm:text-[13px] sm:px-4 ${
                      isActive
                        ? "bg-[#0C7C8A] border-[#0C7C8A] text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:border-[#0C7C8A] hover:text-[#0C7C8A]"
                    }`}
                  >
                    {cat}
                  </a>
                );
              })}
            </div>

            {/* Sort — right-aligned on sm+, left on mobile */}
            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
              <span className="text-[12px] text-slate-400 font-medium sm:text-[13px]">Sort</span>
              <a href={buildHref(params, { sort: "newest",    page: undefined })} className={sortPillClass(params.sort, "newest",    !params.sort)}>Newest</a>
              <a href={buildHref(params, { sort: "downloads", page: undefined })} className={sortPillClass(params.sort, "downloads", false)}>Most Downloaded</a>
            </div>

          </div>

          {/* Result count */}
          <p className="mt-3 text-[12px] text-slate-400 sm:text-[13px]">
            {total > 0 ? `${total} resource${total !== 1 ? "s" : ""}` : "No resources found"}
            {params.q && <> for &ldquo;{params.q}&rdquo;</>}
          </p>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="mx-auto max-w-[1400px] px-4 py-5 md:px-12 md:py-8">

        {/* Active chips */}
        {hasFilters && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {params.language && <ActiveChip label={`Language: ${params.language}`} paramKey="language" searchParams={params} />}
            {params.format   && <ActiveChip label={`Format: ${params.format}`}     paramKey="format"   searchParams={params} />}
            {params.q        && <ActiveChip label={`"${params.q}"`}                paramKey="q"        searchParams={params} />}
          </div>
        )}

        {books.length === 0 ? (
          <EmptyState hasFilters={hasFilters} query={params.q} />
        ) : (
          <>
            {/* 2 cols mobile → 3 md → 4 lg → 5 xl */}
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-4">
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
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildHref(searchParams: SearchParams, overrides: Partial<SearchParams>): string {
  const merged = { ...searchParams, ...overrides };
  const p = new URLSearchParams();
  Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v); });
  const qs = p.toString();
  return `/books${qs ? `?${qs}` : ""}`;
}

function sortPillClass(current: string | undefined, value: string, isDefault: boolean): string {
  const active = current === value || (isDefault && !current);
  return `rounded-full border px-3 py-1 text-[11px] font-semibold whitespace-nowrap transition-all sm:text-[12px] ${
    active
      ? "bg-[#0C7C8A] border-[#0C7C8A] text-white"
      : "border-slate-200 bg-white text-slate-500 hover:border-[#0C7C8A] hover:text-[#0C7C8A]"
  }`;
}

function ActiveChip({ label, paramKey, searchParams }: { label: string; paramKey: keyof SearchParams; searchParams: SearchParams }) {
  return (
    <a
      href={buildHref(searchParams, { [paramKey]: undefined, page: undefined })}
      className="inline-flex items-center gap-2 rounded-full bg-[#E4F4F5] py-1.5 pl-[13px] pr-2 text-[12px] font-semibold text-[#075863] transition hover:bg-[#d3edee]"
    >
      {label}
      <span aria-hidden className="flex h-[16px] w-[16px] items-center justify-center rounded-full bg-[#075863]/15 text-[12px] leading-none">×</span>
    </a>
  );
}

function EmptyState({ hasFilters, query }: { hasFilters: boolean; query?: string }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <Icon name="search-off" className="mb-4 text-5xl text-slate-300" />
      <h2 className="text-xl font-bold text-slate-800">No resources found</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
        {query ? `No books match "${query}".` : hasFilters ? "Try adjusting your filters." : "The catalogue is empty."}
      </p>
      {hasFilters && (
        <a href="/books" className="mt-5 inline-flex h-10 items-center rounded-xl bg-[#14161B] px-6 text-sm font-semibold text-white transition hover:bg-[#0C7C8A]">
          Clear all filters
        </a>
      )}
    </div>
  );
}