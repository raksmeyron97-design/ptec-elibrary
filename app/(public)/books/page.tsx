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
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const q = params.q?.trim();
  const dept = params.dept?.trim();
  const language = params.language?.trim();

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
  const params = await searchParams;
  const [{ books, total, page }, departments] = await Promise.all([
    fetchBooks(params),
    getDepartments(),
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
    <div className="min-h-screen bg-[#F7F8FB]">
      {/* ── Header ── */}
      <div className="border-b border-slate-100 bg-white px-4 py-5 md:px-12 md:py-7">
        <div className="mx-auto max-w-[1400px]">
          {/* Search bar */}
          <div className="mb-5">
            <Suspense
              fallback={<div className="h-11 rounded-xl bg-slate-50" />}
            >
              <SearchBar />
            </Suspense>
          </div>

          {/* Filters row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Category pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none sm:gap-2">
              {categoryPills.map((cat) => {
                const isAll = cat === "All";
                const isActive = isAll ? !params.dept : params.dept === cat;
                const href = isAll
                  ? buildHref(params, { dept: undefined, page: undefined })
                  : buildHref(params, { dept: cat, page: undefined });
                return (
                  <a
                    key={cat}
                    href={href}
                    className={`shrink-0 rounded-full px-4 py-[7px] text-[12px] font-medium whitespace-nowrap transition-all sm:text-[13px] ${
                      isActive
                        ? "bg-[#0C7C8A] text-white shadow-sm shadow-[#0C7C8A]/20"
                        : "bg-slate-50 text-slate-500 hover:bg-[#E8F5F6] hover:text-[#0C7C8A]"
                    }`}
                  >
                    {cat}
                  </a>
                );
              })}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mr-1">
                Sort
              </span>
              <a
                href={buildHref(params, {
                  sort: "newest",
                  page: undefined,
                })}
                className={sortPillClass(
                  params.sort,
                  "newest",
                  !params.sort
                )}
              >
                Newest
              </a>
              <a
                href={buildHref(params, {
                  sort: "downloads",
                  page: undefined,
                })}
                className={sortPillClass(params.sort, "downloads", false)}
              >
                Most Downloaded
              </a>
            </div>
          </div>

          {/* Result count */}
          <p className="mt-4 text-[12px] text-slate-400 sm:text-[13px]">
            {total > 0
              ? `${total} resource${total !== 1 ? "s" : ""}`
              : "No resources found"}
            {params.q && (
              <>
                {" "}
                for &ldquo;{params.q}&rdquo;
              </>
            )}
          </p>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-12 md:py-8">
        {/* Active filter chips */}
        {hasFilters && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {params.language && (
              <ActiveChip
                label={`Language: ${params.language}`}
                paramKey="language"
                searchParams={params}
              />
            )}
            {params.format && (
              <ActiveChip
                label={`Format: ${params.format}`}
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
          <EmptyState hasFilters={hasFilters} query={params.q} />
        ) : (
          <>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-5">
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
  return `rounded-full px-3 py-[5px] text-[11px] font-medium whitespace-nowrap transition-all sm:text-[12px] ${
    active
      ? "bg-[#0C7C8A] text-white shadow-sm shadow-[#0C7C8A]/20"
      : "bg-slate-50 text-slate-500 hover:bg-[#E8F5F6] hover:text-[#0C7C8A]"
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
    <a
      href={buildHref(searchParams, {
        [paramKey]: undefined,
        page: undefined,
      })}
      className="inline-flex items-center gap-2 rounded-full bg-[#E8F5F6] py-1.5 pl-3.5 pr-2.5 text-[12px] font-medium text-[#0C7C8A] transition hover:bg-[#d3edee]"
    >
      {label}
      <span
        aria-hidden
        className="flex h-4 w-4 items-center justify-center rounded-full bg-[#0C7C8A]/10 text-[11px] leading-none text-[#0C7C8A]"
      >
        ×
      </span>
    </a>
  );
}

function EmptyState({
  hasFilters,
  query,
}: {
  hasFilters: boolean;
  query?: string;
}) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
      <Icon name="search-off" className="mb-4 text-5xl text-slate-300" />
      <h2 className="text-xl font-bold text-slate-700">No resources found</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
        {query
          ? `No books match "${query}".`
          : hasFilters
            ? "Try adjusting your filters."
            : "The catalogue is empty."}
      </p>
      {hasFilters && (
        <a
          href="/books"
          className="mt-5 inline-flex h-10 items-center rounded-full bg-[#0C7C8A] px-6 text-sm font-semibold text-white transition hover:bg-[#0a6b77]"
        >
          Clear all filters
        </a>
      )}
    </div>
  );
}