import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import BookCard from "@/components/ui/books/BookCard";
import type { Book } from "@/lib/books";

/**
 * Library books offered alongside (or instead of) related publications.
 *
 * The heading is honest about which tier produced the list: topic matches are
 * "Related reading from the library", the popularity top-up is "More from the
 * library". Neither claims similarity it cannot demonstrate.
 */
export default async function SimilarBooks({
  books,
  matchedOnTopic,
  standalone,
}: {
  books: Book[];
  matchedOnTopic: boolean;
  /** True when no related publications rendered — this block leads the region. */
  standalone: boolean;
}) {
  if (books.length === 0) return null;
  const t = await getTranslations("publicationDetail");

  return (
    <div className={standalone ? "" : "mt-16"} aria-labelledby="library-books-heading">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span aria-hidden="true" className="h-[3px] w-8 rounded-full bg-gradient-to-r from-brand to-accent" />
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">
              {t("recommendedReading")}
            </span>
          </div>
          <h2
            id="library-books-heading"
            className="font-khmer-serif text-[26px] font-bold text-text-heading sm:text-[28px]"
          >
            {matchedOnTopic ? t("relatedFromLibrary") : t("moreFromLibrary")}
          </h2>
          <p className="mt-1 text-[13px] text-text-muted">
            {matchedOnTopic ? t("relatedFromLibrarySubtitle") : t("moreFromLibrarySubtitle")}
          </p>
        </div>
        <Link
          href="/books"
          className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-4 py-2 text-[13px] font-semibold text-text-body shadow-sm transition-colors duration-150 hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          {t("browseLibrary")}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 xl:grid-cols-6">
        {books.map((book) => (
          <BookCard key={book.slug} book={book} />
        ))}
      </div>
    </div>
  );
}
