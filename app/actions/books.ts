"use server";

// app/actions/books.ts
import {
  getBooksAfter,
  type BookCursor,
  type BooksListParams,
} from "@/lib/books-data";
import { toBookCardList, type BookCardData } from "@/lib/books/card-data";

/** What a slice of the listing sends back — card fields only. */
export type BookCardSlice = {
  books: BookCardData[];
  nextCursor: BookCursor | null;
};

/**
 * Loads the next slice of the books listing for infinite scroll.
 * Public data only — no auth required.
 *
 * The rows are narrowed to card fields HERE, at the serialisation boundary.
 * A Server Action's return value is shipped to the browser exactly like a
 * flight payload, so returning `Book` rows would have left the second screen
 * and every screen after it paying the cost the first screen no longer does.
 */
export async function loadMoreBooks(
  params: BooksListParams,
  cursor: BookCursor
): Promise<BookCardSlice> {
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

  const slice = await getBooksAfter(safeParams, safeCursor);
  return { books: toBookCardList(slice.books), nextCursor: slice.nextCursor };
}
