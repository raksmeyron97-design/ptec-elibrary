import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import BookCard from "@/components/ui/books/BookCard";
import { toBookCardList } from "@/lib/books/card-data";
import type { Book } from "@/lib/books";

/**
 * Library books offered after an article's related scholarship.
 *
 * The heading is honest about which tier produced the list: topic matches are
 * "Related reading from the library", the popularity top-up is "More from the
 * library". Neither claims similarity it cannot demonstrate.
 *
 * Last and lightest of the related blocks on purpose: a book is the least
 * direct relation an article has, and its six-cover grid used to be the
 * heaviest thing on the page. It is now a smaller shelf under an h3.
 */
export default async function SimilarBooks({
  books,
  matchedOnTopic,
}: {
  books: Book[];
  matchedOnTopic: boolean;
}) {
  if (books.length === 0) return null;
  const t = await getTranslations("publicationDetail");

  return (
    <section aria-labelledby="library-books-heading">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-divider pb-2.5">
        <div className="min-w-0">
          <h3 id="library-books-heading" className="font-khmer-serif text-[18px] font-bold leading-snug text-text-heading">
            {matchedOnTopic ? t("relatedFromLibrary") : t("moreFromLibrary")}
          </h3>
          <p className="mt-0.5 text-[13px] text-text-muted">
            {matchedOnTopic ? t("relatedFromLibrarySubtitle") : t("moreFromLibrarySubtitle")}
          </p>
        </div>
        <Link
          href="/books"
          className="inline-flex min-h-9 items-center gap-1 text-[13.5px] font-semibold text-brand transition-colors hover:underline"
        >
          {t("browseLibrary")}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {/* A plain row that scrolls sideways where it must (phones), with no
          overlaid arrow buttons: HorizontalCarousel's arrow sits over the
          first card, which axe reports as a WCAG 2.2 target-size (overlap)
          failure. The cards are links, so the row is keyboard-reachable. */}
      <ul className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
        {toBookCardList(books).map((book) => (
          <li key={book.slug} className="w-[148px] shrink-0 snap-start sm:w-[164px]">
            <BookCard book={book} />
          </li>
        ))}
      </ul>
    </section>
  );
}
