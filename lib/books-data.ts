/* eslint-disable @typescript-eslint/no-explicit-any */
// lib/books-data.ts
//
// Cached, cookie-free data layer for the public books listing.
//
// Everything here uses createPublicClient() (no cookies), so these functions
// can be wrapped in unstable_cache without leaking per-user state. Admin
// mutations call revalidateTag("books") to invalidate all of it at once.

import { unstable_cache } from "next/cache";
import { createPublicClient } from "./supabase/public";
import { mapRowToBook, type Book } from "./books";
import { getDepartments } from "@/app/actions/departments";
import { getLanguages, getFormats } from "@/app/actions/filters";

export const BOOKS_PAGE_SIZE = 18;

export type BooksListParams = {
  q?: string;
  dept?: string;
  format?: string;
  language?: string;
  sort?: string;
};

// Cursor for keyset ("load more") pagination. `v` is the value of the active
// sort column on the last row already shown; `offset` is a fallback for sorts
// whose values cannot be safely inlined into a PostgREST or() filter (title).
export type BookCursor = {
  v: string | number | null;
  id: string;
  offset: number;
};

export type BooksSlice = {
  books: (Book & { reviewCount: number })[];
  nextCursor: BookCursor | null;
};

type SortDef = { column: string; ascending: boolean; keyset: boolean };

// title_asc uses offset pagination: titles are arbitrary user text and cannot
// be safely embedded in a PostgREST or() expression (commas, parens, quotes).
const SORT_MAP: Record<string, SortDef> = {
  newest: { column: "published_at", ascending: false, keyset: true },
  oldest: { column: "published_at", ascending: true, keyset: true },
  downloads: { column: "download_count", ascending: false, keyset: true },
  rating: { column: "rating", ascending: false, keyset: true },
  title_asc: { column: "title", ascending: true, keyset: false },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// published_at is a date/timestamp; only allow ISO-ish characters when the
// value is inlined into an or() filter.
const DATEISH_RE = /^[0-9T:.\-+Z ]+$/;

function listingSelect(deptFilter: boolean): string {
  return `id, title, slug, description, cover_color, cover_url, language,
    published_at, created_at, department, pages, isbn, rating, download_count,
    view_count, tags, review_count, avg_rating,
    authors(name), categories(name),
    ${deptFilter ? "departments!inner(name)" : "departments(name)"},
    book_files(format, file_url, file_size_kb)`;
}

function sanitizeQuery(rawQ: string | undefined): string | undefined {
  const trimmed = rawQ?.trim();
  if (!trimmed) return undefined;
  // Strip ILIKE wildcards and or()-syntax characters so user input can't
  // alter the %q% wrapping or the filter expression.
  return trimmed.replace(/[(),.\\%_]/g, " ").replace(/\s+/g, " ").trim() || undefined;
}

function resolveSort(sort: string | undefined): { key: string; def: SortDef } {
  const key = sort && SORT_MAP[sort] ? sort : "newest";
  return { key, def: SORT_MAP[key] };
}

/**
 * Builds the filtered listing query (without range/cursor).
 * Shared by the cached first-page fetch and the load-more Server Action.
 * Returns the builder wrapped in an object: PostgREST builders are thenables,
 * and returning one bare from an async function would await (execute) it.
 */
async function buildListingQuery(
  supabase: ReturnType<typeof createPublicClient>,
  params: BooksListParams,
  opts: { count?: "estimated" } = {}
) {
  const q = sanitizeQuery(params.q);
  const dept = params.dept?.trim();
  const language = params.language?.trim();
  const format = params.format?.trim();
  const { def } = resolveSort(params.sort);

  let query = supabase
    .from("books_with_stats")
    .select(listingSelect(!!dept), opts.count ? { count: opts.count } : undefined)
    .eq("is_published", true)
    // nullsFirst:false keeps rows with a null sort value at the end for both
    // directions, which the keyset predicate below relies on.
    .order(def.column, { ascending: def.ascending, nullsFirst: false })
    .order("id", { ascending: false });

  if (q) {
    // FTS with 'english' config fails for Khmer (no tokenizer). Use ILIKE —
    // backed by pg_trgm GIN indexes on title + description (migration 0007).
    // Also search department and category names so clicking "ស្រាវជ្រាវ" finds results.
    const [deptRes, catRes] = await Promise.all([
      supabase.from("departments").select("id").ilike("name", `%${q}%`),
      supabase.from("categories").select("id").ilike("name", `%${q}%`),
    ]);
    const deptIds = (deptRes.data ?? []).map((d: { id: string }) => d.id);
    const catIds = (catRes.data ?? []).map((c: { id: string }) => c.id);

    const orParts = [
      `title.ilike.%${q}%`,
      `description.ilike.%${q}%`,
      ...(deptIds.length ? [`department_id.in.(${deptIds.join(",")})`] : []),
      ...(catIds.length ? [`category_id.in.(${catIds.join(",")})`] : []),
    ];
    query = query.or(orParts.join(","));
  }
  if (dept) query = query.eq("departments.name", dept);
  if (language) query = query.eq("language", language);
  if (format) {
    const { data: bf } = await supabase
      .from("book_files")
      .select("book_id")
      .eq("format", format);
    const formatBookIds = bf?.map((f) => f.book_id) ?? [];
    if (formatBookIds.length > 0) {
      query = query.in("id", formatBookIds);
    } else {
      query = query.in("id", ["00000000-0000-0000-0000-000000000000"]);
    }
  }

  return { query };
}

function buildCursor(
  rawRows: any[],
  sortColumn: string,
  offsetSoFar: number
): BookCursor | null {
  if (rawRows.length < BOOKS_PAGE_SIZE) return null; // last page
  const last = rawRows[rawRows.length - 1];
  return {
    v: last?.[sortColumn] ?? null,
    id: last?.id ?? "",
    offset: offsetSoFar + rawRows.length,
  };
}

/**
 * First page (or ?page=N deep link) — offset-based, with an estimated total.
 * Cached per params+page combination under the "books" tag.
 */
export const getBooksPage = unstable_cache(
  async (
    params: BooksListParams,
    page: number
  ): Promise<BooksSlice & { total: number; page: number }> => {
    const supabase = createPublicClient();
    const safePage = Math.max(1, Number(page) || 1);
    const from = (safePage - 1) * BOOKS_PAGE_SIZE;
    const to = from + BOOKS_PAGE_SIZE - 1;
    const { def } = resolveSort(params.sort);

    // "estimated" = exact count for small result sets, planner estimate for
    // large ones — never a full-table count per request like "exact".
    const { query } = await buildListingQuery(supabase, params, { count: "estimated" });
    const { data, error, count } = await query.range(from, to);

    if (error) {
      // PGRST103 = page offset beyond dataset size; not a real error
      if ((error as any).code !== "PGRST103") {
        console.error("Supabase error:", error.message);
      }
      return { books: [], total: 0, page: safePage, nextCursor: null };
    }

    const rows = data ?? [];
    return {
      books: rows.map(mapRowToBook),
      total: count ?? 0,
      page: safePage,
      nextCursor: buildCursor(rows, def.column, from),
    };
  },
  ["books-page"],
  { revalidate: 300, tags: ["books"] }
);

/**
 * Next slice after `cursor` — keyset pagination where the sort column allows
 * it (O(page size) regardless of depth), offset fallback otherwise.
 * Called from the load-more Server Action; uncached (each slice is distinct).
 */
export async function getBooksAfter(
  params: BooksListParams,
  cursor: BookCursor
): Promise<BooksSlice> {
  const supabase = createPublicClient();
  const { def } = resolveSort(params.sort);

  let { query } = await buildListingQuery(supabase, params);

  const idOk = UUID_RE.test(cursor.id);
  const v = cursor.v;
  const vOk =
    typeof v === "number"
      ? Number.isFinite(v)
      : typeof v === "string"
        ? DATEISH_RE.test(v)
        : v === null;

  if (def.keyset && idOk && vOk) {
    if (v === null) {
      // Already inside the null tail: walk it by id.
      query = query.is(def.column, null).lt("id", cursor.id);
    } else {
      const cmp = def.ascending ? "gt" : "lt";
      // (col, id) after the cursor row, plus the null tail (nulls sort last).
      query = query.or(
        [
          `${def.column}.${cmp}.${v}`,
          `and(${def.column}.eq.${v},id.lt.${cursor.id})`,
          `${def.column}.is.null`,
        ].join(",")
      );
    }
    query = query.limit(BOOKS_PAGE_SIZE);
  } else {
    // title sort (or malformed cursor): fall back to offset.
    const from = Math.max(0, cursor.offset);
    query = query.range(from, from + BOOKS_PAGE_SIZE - 1);
  }

  const { data, error } = await query;
  if (error) {
    if ((error as any).code !== "PGRST103") {
      console.error("Supabase error:", error.message);
    }
    return { books: [], nextCursor: null };
  }

  const rows = data ?? [];
  return {
    books: rows.map(mapRowToBook),
    nextCursor: buildCursor(rows, def.column, cursor.offset),
  };
}

// ── Cached filter lists ───────────────────────────────────────────────────
// These change only when an admin edits books, so cache them under the same
// "books" tag with a long TTL.

export const getDepartmentsCached = unstable_cache(
  () => getDepartments(),
  ["books-departments"],
  { revalidate: 3600, tags: ["books"] }
);

export const getLanguagesCached = unstable_cache(
  () => getLanguages(),
  ["books-languages"],
  { revalidate: 3600, tags: ["books"] }
);

export const getFormatsCached = unstable_cache(
  () => getFormats(),
  ["books-formats"],
  { revalidate: 3600, tags: ["books"] }
);
