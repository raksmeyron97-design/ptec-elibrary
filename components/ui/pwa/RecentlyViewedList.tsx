"use client";

// components/ui/pwa/RecentlyViewedList.tsx
// "Recently viewed on this device" — the books lib/recently-viewed recorded,
// shown on the offline pages (/offline-books and the /~offline fallback) so a
// reader who loses the connection still sees what they were looking at.
//
// Labels come in as props: /~offline is served by the service worker outside
// next-intl (it is bilingual by construction), so this component must not
// read a message catalogue itself. Hrefs likewise: the caller passes the
// locale prefix it knows ("" or "/km"); /~offline has none and passes "".
//
// Covers are SmartBookCover, so a cover that is not in the image cache falls
// back to the generated one instead of a broken image. Renders nothing until
// it has read the list (it is device state, unknown on the server) and
// nothing at all when the list is empty.

import { useSyncExternalStore } from "react";
import SmartBookCover from "@/components/ui/books/SmartBookCover";
import { RECENTLY_VIEWED_KEY, readRecentlyViewed, type RecentBook } from "@/lib/recently-viewed";

const EMPTY: RecentBook[] = [];
let cache: { raw: string | null; list: RecentBook[] } = { raw: null, list: EMPTY };

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === RECENTLY_VIEWED_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

/** A stable snapshot: the same array until the stored string changes, as
 *  useSyncExternalStore requires. */
function snapshot(): RecentBook[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(RECENTLY_VIEWED_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cache.raw) cache = { raw, list: raw ? readRecentlyViewed() : EMPTY };
  return cache.list;
}

export default function RecentlyViewedList({
  title,
  note,
  localePrefix = "",
  lang,
  className = "",
}: {
  /** Section heading, already localised by the caller. */
  title: string;
  /** Optional one-line note under the heading. */
  note?: string;
  /** "" for English, "/km" for Khmer. */
  localePrefix?: string;
  lang?: string;
  /** Spacing from the caller — applied only when there is something to show. */
  className?: string;
}) {
  const books = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  if (books.length === 0) return null;

  return (
    <section aria-labelledby="recently-viewed-heading" className={`w-full text-left ${className}`} lang={lang}>
      <h2 id="recently-viewed-heading" className="font-khmer-serif text-lg font-bold text-text-heading">
        {title}
      </h2>
      {note && <p className="mt-1 text-sm leading-relaxed text-text-muted">{note}</p>}
      <ul role="list" className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {books.map((book) => (
          <li key={book.slug}>
            <a
              href={`${localePrefix}/books/${encodeURIComponent(book.slug)}`}
              className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <span className="relative block aspect-[3/4] overflow-hidden rounded-lg border border-divider bg-paper">
                <SmartBookCover
                  coverUrl={book.coverUrl}
                  title={book.title}
                  author={book.author}
                  seed={book.slug}
                  variant="card"
                  sizes="(max-width:640px) 33vw, 160px"
                />
              </span>
              <span className="mt-1.5 block font-khmer-serif text-[12.5px] font-bold leading-[1.5] text-text-heading line-clamp-2">
                {book.title}
              </span>
              {book.author && (
                <span className="block truncate text-[11px] leading-[1.5] text-text-muted">{book.author}</span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
