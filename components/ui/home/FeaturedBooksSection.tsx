// components/ui/home/FeaturedBooksSection.tsx
import Link from "next/link";
import Image from "next/image";
import { getLocale } from "next-intl/server";

type FeatBook = {
  slug: string;
  title: string;
  author: string;
  coverUrl?: string | null;
  cover?: string;
  department?: string;
};

function hexOf(cover?: string) {
  return cover?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? "#1E3A8A";
}

function Spine() {
  return (
    <div
      aria-hidden
      className="absolute left-0 top-0 bottom-0 w-[6px] rounded-l-lg"
      style={{ background: "rgba(0,0,0,0.22)" }}
    />
  );
}

export default async function FeaturedBooksSection({ books }: { books: FeatBook[] }) {
  if (books.length < 2) return null;

  const locale = await getLocale();
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";

  const [featured, ...rest] = books.slice(0, 4);
  const sideBooks = rest.slice(0, 3);

  const hex = hexOf(featured.cover);

  return (
    <section className="border-b border-divider/60 bg-paper" aria-labelledby="featured-title">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16">

        {/* ── Header ── */}
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-accent to-brand" aria-hidden />
              <span className={`text-[11px] font-bold text-accent-text ${latinEyebrow}`}>
                Editor&apos;s Pick
              </span>
            </div>
            <h2
              id="featured-title"
              className="font-serif font-bold leading-tight tracking-tight text-text-heading"
              style={{ fontSize: "clamp(22px, 2.4vw, 32px)" }}
            >
              Featured This Week
            </h2>
          </div>
          <Link
            href="/books"
            className="group hidden shrink-0 items-center gap-2 rounded-full border border-brand/30 bg-brand/[0.06] px-4 py-[7px] text-[13px] font-semibold text-brand transition-all duration-200 hover:border-brand hover:bg-brand hover:text-white hover:shadow-sm hover:shadow-brand/25 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:inline-flex"
          >
            Browse all books
            <svg className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>

        {/* ── Two-column grid ── */}
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">

          {/* ── Main featured card ── */}
          <Link
            href={`/books/${featured.slug}`}
            className="group relative overflow-hidden rounded-2xl border border-divider/60 bg-bg-surface shadow-[0_2px_8px_rgba(11,21,53,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(11,21,53,0.12)] grid sm:grid-cols-[196px_1fr]"
          >
            {/* Cover */}
            <div className="relative min-h-[220px] overflow-hidden sm:h-full">
              {featured.coverUrl ? (
                // Below the fold — stays lazy (next/image default) so it never
                // competes with the hero LCP image for bandwidth.
                <Image
                  src={featured.coverUrl}
                  alt={featured.title}
                  fill
                  sizes="(max-width: 640px) 100vw, 196px"
                  className="object-cover"
                />
              ) : (
                <div
                  className="flex h-full w-full flex-col justify-end p-5"
                  style={{ background: `linear-gradient(135deg, ${hex} 0%, ${hex}bb 100%)` }}
                >
                  <div className="mb-3 h-[3px] w-8 rounded-full bg-gold-400/60" />
                  {featured.department && (
                    <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-white/50">
                      {featured.department}
                    </p>
                  )}
                  <p className="text-[16px] font-bold leading-snug text-white line-clamp-3">
                    {featured.title}
                  </p>
                </div>
              )}
              <Spine />
              {/* sheen */}
              <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-[28%] bg-gradient-to-l from-white/[0.04] to-transparent" />
            </div>

            {/* Body */}
            <div className="flex flex-col justify-between p-6 sm:p-8">
              <div>
                <span className="mb-3 inline-flex items-center gap-1.5 text-[10.5px] font-bold text-accent-text">
                  <span className="h-[5px] w-[5px] rounded-full bg-accent" aria-hidden />
                  <span className={latinEyebrow}>{featured.department ?? "Featured"}</span>
                </span>
                <h3 className="font-serif font-bold leading-tight tracking-tight text-text-heading transition-colors group-hover:text-brand"
                    style={{ fontSize: "clamp(18px, 1.8vw, 26px)" }}>
                  {featured.title}
                </h3>
                <p className="mt-2 text-[13.5px] font-medium text-text-muted">{featured.author}</p>
              </div>
              <div className="mt-6">
                <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-brand">
                  Read now
                  <svg className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </div>
            </div>
          </Link>

          {/* ── Side cards ── */}
          <div className="flex flex-col gap-3">
            {sideBooks.map((book) => {
              const bHex = hexOf(book.cover);
              return (
                <Link
                  key={book.slug}
                  href={`/books/${book.slug}`}
                  className="group flex items-center gap-4 rounded-xl border border-divider/60 bg-bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-divider hover:shadow-[0_4px_20px_rgba(11,21,53,0.08)]"
                >
                  {/* Mini cover */}
                  <div className="relative h-[76px] w-[54px] shrink-0 overflow-hidden rounded-lg shadow-md">
                    {book.coverUrl ? (
                      <Image src={book.coverUrl} alt={book.title} fill sizes="54px" className="object-cover" />
                    ) : (
                      <div
                        className="h-full w-full"
                        style={{ background: `linear-gradient(135deg, ${bHex} 0%, ${bHex}bb 100%)` }}
                      >
                        <Spine />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    {book.department && (
                      <p className={`mb-1 truncate text-[10px] font-bold text-text-muted ${latinEyebrow}`}>
                        {book.department}
                      </p>
                    )}
                    <p className="line-clamp-2 text-[14px] font-semibold leading-snug text-text-heading transition-colors group-hover:text-brand">
                      {book.title}
                    </p>
                    <p className="mt-1 truncate text-[12px] text-text-muted">{book.author}</p>
                  </div>

                  <svg className="h-4 w-4 shrink-0 text-text-muted opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
