import { getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";

import BookCard from "@/components/ui/books/BookCard";
import type { Book } from "@/lib/books";

/**
 * "Featured by PTEC Library" — the editorial shelf at the top of /books.
 *
 * It says who chose these books and stops there. The reader has no use for
 * `featured_position`, `featured_by` or the word "pinned", and the public view
 * does not even carry the curator's id (migration 0149 leaves `featured_by`
 * out of `books_with_stats` on purpose) — the credit is institutional, which
 * is both the truthful framing and the one that survives a staff change.
 *
 * Rendered only on the clean, unfiltered first page. A reader who has typed a
 * search or narrowed by department has told us what they want; leading with
 * something else would be the site talking over them. It is also why this
 * carries no JSON-LD of its own: these books are already in the page's
 * CollectionPage schema, and a second listing of the same URLs would be
 * duplicate structured data for a merchandising strip.
 *
 * The cards are the ordinary BookCard — same cover, title, author and metrics
 * as the collection below, because a reader should recognise them as the same
 * kind of thing. Only the section heading marks them as chosen.
 */
export default async function FeaturedShelf({ books }: { books: (Book & { reviewCount?: number })[] }) {
  if (books.length === 0) return null;
  const t = await getTranslations("books.featured");

  return (
    <section aria-labelledby="featured-books-heading" className="mb-8">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2
          id="featured-books-heading"
          className="inline-flex items-center gap-2 font-khmer-serif text-lg font-bold text-text-heading"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          {t("title")}
        </h2>
        <p className="text-sm text-text-muted">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {books.map((book, i) => (
          <BookCard key={book.slug} book={book} priority={i < 6} />
        ))}
      </div>

      {/* A rule, not a heading: the shelf and the collection are two readings
          of one library, and a second <h2> would suggest otherwise. */}
      <hr className="mt-8 border-divider" />
    </section>
  );
}
