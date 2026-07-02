"use server";

// app/actions/books.ts
import {
  getBooksAfter,
  type BookCursor,
  type BooksListParams,
  type BooksSlice,
} from "@/lib/books-data";

/**
 * Loads the next slice of the books listing for infinite scroll.
 * Public data only — no auth required.
 */
export async function loadMoreBooks(
  params: BooksListParams,
  cursor: BookCursor
): Promise<BooksSlice> {
  // Re-validate shapes at the trust boundary: this is a public endpoint and
  // the cursor/params arrive from the client.
  const safeParams: BooksListParams = {
    q: typeof params?.q === "string" ? params.q.slice(0, 200) : undefined,
    dept: typeof params?.dept === "string" ? params.dept.slice(0, 100) : undefined,
    format: typeof params?.format === "string" ? params.format.slice(0, 20) : undefined,
    language: typeof params?.language === "string" ? params.language.slice(0, 50) : undefined,
    sort: typeof params?.sort === "string" ? params.sort.slice(0, 20) : undefined,
  };

  const safeCursor: BookCursor = {
    v:
      typeof cursor?.v === "number" || typeof cursor?.v === "string"
        ? cursor.v
        : null,
    id: typeof cursor?.id === "string" ? cursor.id : "",
    offset: Math.max(0, Math.min(Number(cursor?.offset) || 0, 100_000)),
  };

  return getBooksAfter(safeParams, safeCursor);
}
