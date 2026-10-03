// components/ui/home/ShelfCover.tsx
// One item on the homepage shelf, drawn as a printed object: the cover with a
// spine highlight and a cover shadow, then category, title and author — and
// nothing else. No views, downloads or rating: the homepage shelf is for
// choosing something to read, not for ranking it.
//
// The whole item is one link (cover and text), so there is one tab stop and
// one focus indicator per item.
import { Link } from "@/i18n/navigation";
import SmartBookCover from "@/components/ui/books/SmartBookCover";
import type { ShelfItem } from "./shelf";

/** A bound spine catching the light, then the shadow of the hinge. */
const SPINE =
  "bg-[linear-gradient(90deg,rgba(255,255,255,.16)_0,rgba(255,255,255,0)_7%,rgba(0,0,0,.12)_8%,rgba(0,0,0,0)_13%)]";

// The slot is ~40% of a phone (150 px at 375), a quarter of the container at
// sm, a sixth at lg (~200 px at 1366). Pixel widths only: a bare `NNvw` makes
// next/image drop every srcset width below 640 (pdf-cover-sizes.test.ts).
const SIZES = "(max-width: 640px) 160px, (max-width: 1024px) 200px, 220px";

export default function ShelfCover({ item }: { item: ShelfItem }) {
  const view =
    item.kind === "book"
      ? {
          href: `/books/${item.book.slug}`,
          title: item.book.title,
          author: item.book.author,
          category: item.book.category || item.book.department || null,
          coverUrl: item.book.coverUrl ?? null,
          seed: item.book.slug,
        }
      : {
          href: item.href,
          title: item.title,
          author: item.author,
          category: item.typeLabel,
          coverUrl: null,
          seed: item.id,
        };

  return (
    <Link
      href={view.href}
      // A shelf of six links would otherwise prefetch six detail pages the
      // moment it scrolls into view.
      prefetch={false}
      className="group block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-paper shadow-cover transition duration-200 ease-[cubic-bezier(.22,1,.36,1)] group-hover:-translate-y-1 group-hover:shadow-md motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
        <SmartBookCover
          coverUrl={view.coverUrl}
          title={view.title}
          author={view.author}
          category={view.category}
          seed={view.seed}
          variant="card"
          sizes={SIZES}
        />
        <span aria-hidden className={`pointer-events-none absolute inset-0 ${SPINE}`} />
      </div>
      {view.category && (
        <p className="mt-3 truncate text-[11.5px] font-bold text-accent-text" dir="auto">
          {view.category}
        </p>
      )}
      <h3
        className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug text-text-heading transition-colors group-hover:text-brand"
        dir="auto"
      >
        {view.title}
      </h3>
      {view.author && (
        <p className="mt-1 truncate text-[13px] text-text-muted" dir="auto">
          {view.author}
        </p>
      )}
    </Link>
  );
}
