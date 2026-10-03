// components/ui/home/HeroCoverFan.tsx
// Desktop hero, right column: the three most-downloaded books as a fan of
// printed covers on a gold shelf line. Server-rendered, CSS-only motion.
//
// Three rules keep it cheap and honest:
//   • `hidden lg:grid` — the wrapper is display:none below lg, and a lazy
//     image inside display:none is never fetched, so phones request none of
//     these covers.
//   • Lazy covers (next/image's default) and 210 px slots: the H1 stays the
//     largest thing painted, so it stays the LCP element.
//   • DOM order is left → centre → right, so Tab walks the fan the way it
//     reads; :focus-within spreads it exactly as :hover does.
//
// The shelf's Trending tab skips these three books at lg (BookShowcaseTabs
// `skipOnDesktop`), so no book is on screen twice.
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import SmartBookCover from "@/components/ui/books/SmartBookCover";
import type { BookCardData } from "@/lib/books/card-data";

/** How many covers the fan shows (and the shelf skips at lg). */
export const HERO_FAN_COUNT = 3;

/** A bound spine catching the light — the same overlay as ShelfCover. */
const SPINE =
  "bg-[linear-gradient(90deg,rgba(255,255,255,.16)_0,rgba(255,255,255,0)_7%,rgba(0,0,0,.12)_8%,rgba(0,0,0,0)_13%)]";

const EASE =
  "transition-[rotate,translate] duration-[320ms] ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none";

// Resting and spread poses per position. Spread on hover/focus-within only
// where motion is welcome; reduced motion keeps the resting fan.
const POSE = [
  `left-0 origin-bottom-right -rotate-9 motion-safe:group-hover:-rotate-12 motion-safe:group-focus-within:-rotate-12 motion-safe:group-hover:-translate-x-4 motion-safe:group-focus-within:-translate-x-4`,
  `left-1/2 z-10 -translate-x-1/2 -translate-y-[4%]`,
  `right-0 origin-bottom-left rotate-9 motion-safe:group-hover:rotate-12 motion-safe:group-focus-within:rotate-12 motion-safe:group-hover:translate-x-4 motion-safe:group-focus-within:translate-x-4`,
] as const;

export default async function HeroCoverFan({
  books,
}: {
  books: BookCardData[];
}) {
  const fan = books.slice(0, HERO_FAN_COUNT);
  if (fan.length < HERO_FAN_COUNT)
    return <div className="hidden lg:block" aria-hidden />;
  const t = await getTranslations("home");

  return (
    <div className="hidden min-w-0 justify-items-center lg:grid">
      <div className="group relative h-[372px] w-[520px] max-w-full">
        <ul className="absolute inset-0" aria-label={t("heroMostDownloaded")}>
          {fan.map((book, i) => (
            <li
              key={book.slug}
              className={`absolute bottom-6 w-[210px] ${EASE} ${POSE[i]}`}
            >
              <Link
                href={`/books/${book.slug}`}
                prefetch={false}
                className="block rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold-400"
              >
                <span className="relative block aspect-[2/3] overflow-hidden rounded-md bg-white/10 shadow-[0_2px_4px_rgba(0,0,0,.35),0_18px_40px_-12px_rgba(0,0,0,.65)]">
                  <SmartBookCover
                    coverUrl={book.coverUrl}
                    title={book.title}
                    author={book.author}
                    category={book.category || book.department}
                    seed={book.slug}
                    variant="card"
                    sizes="210px"
                  />
                  <span
                    aria-hidden
                    className={`pointer-events-none absolute inset-0 ${SPINE}`}
                  />
                </span>
                <span className="sr-only">{book.title}</span>
              </Link>
            </li>
          ))}
        </ul>
        {/* The shelf the books stand on. */}
        <div
          aria-hidden
          className="absolute inset-x-6 bottom-6 h-px bg-gradient-to-r from-transparent via-gold-400/80 to-transparent"
        />
      </div>
      <p className="mt-2 flex items-center gap-2 text-[13px] text-blue-100">
        <span>{t("heroMostDownloaded")}</span>
        <span aria-hidden>·</span>
        <Link
          href="/books?sort=downloads"
          className="group/cta inline-flex items-center gap-1 rounded-sm font-semibold text-white underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400"
        >
          {t("ctaBrowse")}
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform group-hover/cta:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </p>
    </div>
  );
}
