"use client";

// components/ui/books/InfiniteBookGrid.tsx
import { useEffect, useRef, useState, useTransition } from "react";
import type { Book } from "@/lib/books";
import type { BookCursor, BooksListParams } from "@/lib/books-data";
import { loadMoreBooks } from "@/app/actions/books";
import BookCard from "@/components/ui/books/BookCard";

type GridBook = Book & { reviewCount?: number };

type Props = {
  initialBooks: GridBook[];
  initialCursor: BookCursor | null;
  /** Active filters/sort — sent back to the server for subsequent slices. */
  params: BooksListParams;
};

export default function InfiniteBookGrid({
  initialBooks,
  initialCursor,
  params,
}: Props) {
  const [books, setBooks] = useState(initialBooks);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Guards against the observer firing again while a slice is in flight.
  // NOTE: the parent passes a `key` derived from filters/sort/page, so this
  // component remounts (state resets) whenever the listing changes.
  const loadingRef = useRef(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!cursor || !sentinel) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || loadingRef.current) return;
        loadingRef.current = true;
        startTransition(async () => {
          try {
            const { books: more, nextCursor } = await loadMoreBooks(params, cursor);
            setBooks((prev) => {
              // Dedupe on slug in case a book moved between slices.
              const seen = new Set(prev.map((b) => b.slug));
              return [...prev, ...more.filter((b) => !seen.has(b.slug))];
            });
            setCursor(nextCursor);
          } finally {
            loadingRef.current = false;
          }
        });
      },
      // Start fetching well before the user reaches the bottom.
      { rootMargin: "800px 0px" }
    );

    io.observe(sentinel);
    return () => io.disconnect();
  }, [cursor, params]);

  return (
    <>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-4">
        {books.map((book, i) => (
          <BookCard key={book.slug} book={book} priority={i < 6} />
        ))}
      </div>

      {isPending && (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-4 mt-3 sm:mt-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/5] animate-pulse rounded-xl bg-paper"
              aria-hidden
            />
          ))}
        </div>
      )}

      {cursor && <div ref={sentinelRef} className="h-10" aria-hidden />}
    </>
  );
}
