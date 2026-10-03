// components/ui/home/shelf.ts
// What the homepage's one shelf may hold: a book or a thesis.
//
// A union, not a cast. A thesis has no `BookCardData` — no cover, no
// department, and its page is /theses/<slug>, not /books/<slug> — and minting
// one for it would mean either faking book fields or casting past the brand
// (lib/books/card-data.test.ts fails on that). So a book travels as the
// narrowed card it already is, and a thesis as the five fields the cover
// draws.
import type { BookCardData } from "@/lib/books/card-data";

export type ShelfThesis = {
  kind: "thesis";
  /** Row id — stable key and generated-cover seed. */
  id: string;
  href: string;
  title: string;
  author: string | null;
  /** The type label printed above the title ("Thesis"). */
  typeLabel: string;
};

export type ShelfItem = { kind: "book"; book: BookCardData } | ShelfThesis;

/** Most items any one tab shows on the homepage. */
export const SHELF_MAX_ITEMS = 6;

export function bookItems(books: BookCardData[]): ShelfItem[] {
  return books.map((book) => ({ kind: "book", book }));
}

export function shelfKey(item: ShelfItem): string {
  return item.kind === "book" ? `book:${item.book.slug}` : `thesis:${item.id}`;
}
