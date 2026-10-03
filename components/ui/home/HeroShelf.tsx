// components/ui/home/HeroShelf.tsx
// The bottom of the desktop hero: the most-downloaded books standing on the
// hero's gold seam, as if on an open shelf behind the front desk. The first
// screen of a library should show books, and these are the ones most read.
//
// Three rules keep it cheap and honest:
//   • `hidden lg:block` — display:none below lg, and a lazy image inside
//     display:none is never fetched, so phones request none of these covers.
//   • 128 px covers: the H1 stays the largest thing painted, so it stays the
//     LCP element.
//   • The shelf's Trending tab skips these books at lg (BookShowcaseTabs
//     `skipOnDesktop`), so no book is on screen twice.
import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import SmartBookCover from "@/components/ui/books/SmartBookCover";
import type { BookCardData } from "@/lib/books/card-data";

/** How many covers stand on the hero shelf (and the Trending tab skips at lg). */
export const HERO_SHELF_COUNT = 6;

/** A bound spine catching the light — the same overlay as ShelfCover. */
const SPINE =
  "bg-[linear-gradient(90deg,rgba(255,255,255,.16)_0,rgba(255,255,255,0)_7%,rgba(0,0,0,.12)_8%,rgba(0,0,0,0)_13%)]";

export default async function HeroShelf({ books }: { books: BookCardData[] }) {
  const shelf = books.slice(0, HERO_SHELF_COUNT);
  if (shelf.length < HERO_SHELF_COUNT) return null;
  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  // Letter-spaced capitals are a Latin convention; Khmer has no case.
  const label = locale === "km" ? "text-[14px]" : "text-[11.5px] uppercase tracking-[0.18em]";

  return (
    <div className="mx-auto mt-7 hidden max-w-[1000px] lg:block">
      <div className="mb-3 flex items-baseline justify-between gap-4 px-1 text-[13px]">
        <p className={`font-bold text-gold-400 ${label}`}>
          {t("heroMostDownloaded")}
        </p>
        <Link
          href="/books?sort=downloads"
          className="group inline-flex items-center gap-1 rounded-sm font-semibold text-blue-100 underline-offset-2 transition-colors hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
        >
          {t("ctaBrowse")}
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
      {/* The books stand on the hero's own gold seam: no bottom padding, so
          their feet meet the line the section ends on. */}
      <ul className="flex items-end justify-between gap-5" aria-label={t("heroMostDownloaded")}>
        {shelf.map((book) => (
          <li key={book.slug} className="w-[116px] xl:w-[128px]">
            <Link
              href={`/books/${book.slug}`}
              prefetch={false}
              className="group block rounded-t-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-400"
            >
              <span className="relative block aspect-[2/3] overflow-hidden rounded-t-md bg-white/10 shadow-[0_-2px_24px_-6px_rgba(0,0,0,.55)] transition-transform duration-200 ease-[cubic-bezier(.22,1,.36,1)] group-hover:-translate-y-2 group-focus-visible:-translate-y-2 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
                <SmartBookCover
                  coverUrl={book.coverUrl}
                  title={book.title}
                  author={book.author}
                  category={book.category || book.department}
                  seed={book.slug}
                  variant="card"
                  sizes="128px"
                />
                <span aria-hidden className={`pointer-events-none absolute inset-0 ${SPINE}`} />
              </span>
              <span className="sr-only">{book.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
