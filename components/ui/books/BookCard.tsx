// components/ui/books/BookCard.tsx
"use client";

import { Link } from "@/i18n/navigation";
import { useState, useEffect } from "react";
import type { BookCardData } from "@/lib/books/card-data";
import SmartBookCover from "@/components/ui/books/SmartBookCover";
import RatingStars from "@/components/ui/reviews/RatingStars";
import ResourceMetrics from "@/components/ui/core/ResourceMetrics";
import { useTranslations } from "next-intl";

type BookCardProps = {
  /**
   * EXACTLY the fields this card renders — see lib/books/card-data.ts.
   *
   * It used to take a whole `Book`, and this component is a client
   * component, so every field it never reads was serialised into the
   * document's flight payload once per card — 49.3 KB across 836 key/value
   * pairs on the production homepage, 31 KB of it `summary` alone.
   *
   * Narrowing this type was NOT by itself enough, and the reason is worth
   * keeping: TypeScript's excess-property check fires only on object
   * literals, and every call site passes a variable, so a `Book` variable
   * stayed assignable to a narrower field list and nothing changed. What
   * makes passing a `Book` an error is the phantom brand on `BookCardData`,
   * which only `toBookCardData()` can mint.
   *
   * `pdfUrl` is deliberately absent and must stay absent — a storage URL in
   * a client payload is a permanent, credential-free download link (0131),
   * and a card has never needed a file address.
   */
  book: BookCardData;
  /** "browse" (default) = standard card; "continue" = in-progress reading card */
  variant?: "browse" | "continue";
  /** Eagerly load the cover (use for above-the-fold cards only). */
  priority?: boolean;
};

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

type TiltComponent = typeof import("react-parallax-tilt").default;

const formatCount = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}K`
      : String(n);

export default function BookCard({ book, variant = "browse", priority = false }: BookCardProps) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  // Tilt only for a real mouse (fine pointer + hover support) and only when
  // motion is welcome — a touch drag-scroll over the card would otherwise
  // read as an unwanted wobble, and react-parallax-tilt listens on touch
  // events too. The library itself is loaded only then (one shared dynamic
  // import), so a phone never downloads or parses it. Null on the server and
  // the first client render, so both match; the card renders untilted until
  // the module arrives.
  const [Tilt, setTilt] = useState<TiltComponent | null>(null);
  useEffect(() => {
    const precise = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!precise || reduceMotion) return;
    let active = true;
    import("react-parallax-tilt").then((m) => {
      if (active) setTilt(() => m.default);
    });
    return () => {
      active = false;
    };
  }, []);

  const t = useTranslations("home");
  const tc = useTranslations("bookCard");
  const tm = useTranslations("metrics");

  const isContinue = variant === "continue";
  const progress = book.progressPct ?? 0;
  const reviews = book.reviewCount ?? 0;

  // NEW badge: only within 14 days of creation, only on browse variant
  const isNew = !isContinue && book.createdAt && now
    ? now - new Date(book.createdAt).getTime() < FOURTEEN_DAYS_MS
    : false;

  function relativeTime(iso: string | null | undefined): string {
    if (!iso || !now) return "";
    const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
    if (days === 0) return t("today");
    if (days === 1) return t("yesterday");
    if (days < 7) return t("daysAgo", { days });
    return t("weeksAgo", { weeks: Math.floor(days / 7) });
  }



  // View analytics moved to the detail page's BookViewPing (one event per
  // real detail view, anonymous included) — card clicks no longer log.

  // Touch: the card presses DOWN to 0.97 while a finger is on it (the
  // hover lift is hover-only, so a phone never gets it). The GPU layer hint
  // is desktop-only — on a phone it cost one compositor layer per card on
  // screen, which is memory a low-end device does not have.
  const card = (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl bg-bg-surface border border-white/10 shadow-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_8px_24px_-6px_rgba(79,70,229,0.3)] pointer-coarse:active:scale-[0.97] lg:transform-gpu lg:will-change-transform">

      {/* Brand-colored top-rule accent — reveals on hover */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 z-20 h-[3px] origin-left scale-x-0 bg-brand transition-transform duration-250 group-hover:scale-x-100"
      />

      {/* prefetch={false}: a grid of cards would otherwise fire one RSC
          prefetch per card on viewport entry — a request storm on listing
          pages. Navigation still streams the detail loading skeleton. */}
      <Link
        href={`/books/${book.slug}`}
        prefetch={false}
        className="flex h-full flex-col rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        {/* ── Cover ── */}
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-paper">
          <SmartBookCover
            coverUrl={book.coverUrl}
            title={book.title}
            author={book.author}
            category={book.category || book.department}
            seed={book.slug}
            variant="card"
            // MEASURED slot widths (CSS px): 162 @375, 211 @1024, 275 @1280,
            // 309 @1440 and @1920 (the grid's container caps out ~1440).
            //
            // The old tail said 220px for a 309px slot — 29% UNDER. That cost
            // nothing while `images.unoptimized` was set and every cover
            // arrived at its full 800px, but once the optimizer honours
            // `sizes` an under-declaration is a SOFT cover, so this is
            // repairing a regression, not shaving bytes: desktop covers get
            // slightly bigger here, and correct. Same reason 20vw -> 22vw at
            // 1280, where the real slot is 275 and 20vw asked for 256.
            sizes="(max-width:640px) 50vw, (max-width:768px) 33vw, (max-width:1024px) 25vw, (max-width:1280px) 22vw, 320px"
            priority={priority}
            imgClassName="transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />

          {/* NEW badge — solid pill, top-left, only on browse + new books */}
          {isNew && (
            <span className="absolute left-2 top-2 z-[4] rounded-[4px] bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand-contrast">
              {tc("new")}
            </span>
          )}

          {/* Category pill — bottom-left, frosted white. Only over real cover
              images: the generated cover already carries its category label.
              10px and not uppercased: the name is usually Khmer, and at the
              old 8px its subscript consonants were unreadable; truncated so a
              long compound never runs off the cover. */}
          {book.coverUrl && (book.category || book.department) && (
            <span className="absolute bottom-2 left-2 z-[4] max-w-[calc(100%-1rem)] truncate rounded-[4px] bg-white/90 px-2 py-0.5 text-[10px] font-bold leading-[1.45] text-blue-700 shadow-sm backdrop-blur-sm max-lg:backdrop-blur-none">
              {book.category || book.department}
            </span>
          )}
        </div>

        {/* ── Progress bar — continue variant, sits between cover and body ── */}
        {isContinue && (
          <div className="h-1 overflow-hidden bg-divider">
            <div
              className="h-full bg-brand transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5 min-w-0">

          {/* Progress text — continue variant */}
          {isContinue && (
            <p className="mb-1.5 text-[10px] leading-none text-text-muted">
              <span className="font-bold text-brand">{t("readPct", { pct: progress })}</span>
              {relativeTime(book.lastReadAt) && (
                <> · {relativeTime(book.lastReadAt)}</>
              )}
            </p>
          )}

          {/* Title — up to three lines on phones, where a two-column card is
              ~165px wide and a Khmer title gets a dozen clusters per line;
              the space comes from the View button phones no longer draw. */}
          <h3 className="min-h-[2.6em] text-[13px] font-khmer-serif font-bold leading-[1.5] text-text-heading line-clamp-3 sm:line-clamp-2 sm:text-[13.5px]">
            {book.title}
          </h3>

          {/* Author */}
          <p className="mt-1 text-[11px] text-text-muted line-clamp-1 font-medium leading-relaxed">
            {book.author}
          </p>

          {/* ── Footer ── */}
          <div className="mt-auto pt-2.5">

            {/* Stats + Rating — browse variant only. Zero-value metrics are
                hidden: "0 views · 0 downloads · No reviews yet" is anti-proof,
                not information. */}
            {!isContinue && ((book.viewCount ?? 0) > 0 || (book.downloadCount ?? 0) > 0 || reviews > 0) && (
              <div className="flex flex-col gap-1.5 sm:mb-2.5">
                <ResourceMetrics
                  views={book.viewCount}
                  downloads={book.downloadCount}
                  size="sm"
                  className="gap-2"
                />

                {reviews > 0 && (
                  <div className="flex items-center gap-1.5">
                    <RatingStars rating={book.rating ?? 0} compact />
                    <span className="text-[10px] text-text-muted tabular-nums" title={tm("reviews", { count: reviews })}>
                      <span aria-hidden="true">· {formatCount(reviews)}</span>
                      <span className="sr-only">{tm("reviews", { count: reviews })}</span>
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Divider + CTA. The CTA is a <span> inside the card's own link —
                the whole card is the target — so on a phone, where there is
                no hover to reveal, it was ~46px of card per book saying what
                the card already does. Kept for "Continue", which carries the
                reader's progress, and from `sm` up as the hover affordance. */}
            <div className={`mb-2.5 h-px bg-divider ${isContinue ? "" : "max-sm:hidden"}`} aria-hidden />

            {/* CTA button */}
            <span
              className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11.5px] font-bold transition-all duration-200 ${
                isContinue
                  ? "bg-brand text-brand-contrast"
                  : "max-sm:hidden border border-brand/20 bg-transparent text-brand group-hover:border-brand group-hover:bg-brand group-hover:text-brand-contrast"
              }`}
            >
              {isContinue ? tc("continue") : tc("view")}
              <svg
                className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                aria-hidden
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </span>

          </div>
        </div>
      </Link>
    </article>
  );

  if (!Tilt) return card;

  return (
    <Tilt
      className="h-full"
      tiltMaxAngleX={5}
      tiltMaxAngleY={5}
      transitionSpeed={400}
      glareEnable={false}
      tiltReverse
    >
      {card}
    </Tilt>
  );
}