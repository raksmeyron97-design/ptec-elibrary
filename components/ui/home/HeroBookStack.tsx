// components/ui/home/HeroBookStack.tsx
"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";

type HeroBook = {
  slug: string;
  title: string;
  author: string;
  coverUrl?: string | null;
  coverColor?: string;
  department?: string;
};

type Props = {
  books: HeroBook[];
  /** Translated accessible names for the two floating shortcuts. */
  labels: { browseAll: string; mostDownloaded: string };
};

const INTERVAL = 4000;

const backCards = [
  { rotate: "-6deg", translateX: "-12px", translateY: "16px", opacity: 0.45, scale: 0.92 },
  { rotate: "-3deg", translateX: "-4px",  translateY: "8px",  opacity: 0.7,  scale: 0.96 },
];

/** Hex from a Tailwind arbitrary colour class, or a navy fallback. */
const hexOf = (cls: string | undefined, fallback: string) =>
  cls?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? fallback;

/**
 * The desktop hero's rotating stack of covers.
 *
 * Three rules that were missing:
 *
 *   • THE COVER IS A LINK. The front card is the largest, most photographic
 *     thing in the hero, and tapping it used to do nothing — only the two
 *     small floating icons navigated. A reader who likes the book they are
 *     looking at now lands on it.
 *   • IT STOPS WHEN YOU LOOK AT IT. Rotation pauses on hover and on keyboard
 *     focus, so the card cannot swap out from under a pointer that is about
 *     to click, and a screen-reader user hears one title, not a stream.
 *     WCAG 2.2.2 asks for exactly this for anything that auto-updates.
 *   • REDUCED MOTION MEANS NO ROTATION. The first cover stays; the dots
 *     still let a reader pick another one by hand.
 *
 * The hero is ink-dark in BOTH themes, so nothing here reads a theme token:
 * `bg-bg-surface/20` is a faint white dot in light mode and an invisible
 * dark-on-dark one in dark mode, which is how the progress dots vanished
 * for dark-theme readers.
 */
export default function HeroBookStack({ books, labels }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [fadeState, setFadeState] = useState<"in" | "out">("in");
  // `paused` MUST stay state, not a ref, even though it is never rendered.
  // react-doctor flags it as `rerender-state-only-in-handlers` ("set but never
  // shown on screen") and the suggested ref would silently break the pause: the
  // value is a dependency of the rotation effect below, and a ref does not
  // re-run an effect when it changes, so the interval would keep firing while
  // the pointer rests on the card. The re-render it costs is one cheap pass
  // over a card that is not animating at that moment.
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    // Deferred so the first client render matches the server's (which has no
    // media query to ask) — same pattern as AskLibraryHero.
    const id = setTimeout(sync, 0);
    mq.addEventListener("change", sync);
    return () => {
      clearTimeout(id);
      mq.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    if (books.length <= 1 || paused || reduceMotion) return;

    const timer = setInterval(() => {
      setFadeState("out");
      setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % books.length);
        setFadeState("in");
      }, 400);
    }, INTERVAL);

    return () => clearInterval(timer);
  }, [books.length, paused, reduceMotion]);

  if (books.length === 0) return null;

  const currentBook = books[activeIndex];
  const nextBook = books[(activeIndex + 1) % books.length];
  const prevBook = books[(activeIndex + books.length - 1) % books.length];
  const backBooks = [prevBook, nextBook];
  const fade = reduceMotion ? "" : "transition-opacity duration-500 ease-in-out";
  const shown = fadeState === "in" || reduceMotion ? 1 : 0;

  return (
    <div
      className="relative h-[480px] w-[400px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      {/* ── Back cards (static, showing adjacent book colours) ── */}
      {backCards.map((style, i) => {
        const bk = backBooks[i] ?? books[0];
        const hex = hexOf(bk.coverColor, "#0a1629");
        return (
          <div
            key={i}
            aria-hidden
            className="absolute left-10 top-10 h-[380px] w-[280px] rounded-2xl shadow-2xl shadow-black/40"
            style={{
              transform: `rotate(${style.rotate}) translate(${style.translateX}, ${style.translateY}) scale(${style.scale})`,
              opacity: style.opacity,
              background: `linear-gradient(135deg, ${hex}, ${hex}dd)`,
            }}
          >
            <div className="absolute inset-0 rounded-2xl border border-white/[0.08]" />
            <div className="absolute bottom-6 left-5 right-5">
              <div className="mb-2 h-1.5 w-10 rounded-full bg-white/15" />
              <div className="h-2.5 w-24 rounded-full bg-white/20" />
              <div className="mt-1.5 h-1.5 w-16 rounded-full bg-white/10" />
            </div>
          </div>
        );
      })}

      {/* ── Front card — a link to the book it shows ── */}
      <Link
        href={`/books/${currentBook.slug}`}
        className="group absolute left-10 top-10 z-10 block h-[380px] w-[280px] overflow-hidden rounded-2xl shadow-[0_32px_80px_-16px_rgba(0,0,0,0.5)] outline-none transition-transform hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#060B1A] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        style={{ transform: "translate(8px, 0px)" }}
      >
        <div className={`absolute inset-0 ${fade}`} style={{ opacity: shown }}>
          {currentBook.coverUrl ? (
            // The link's accessible name is the title text in the info bar
            // below, so the cover itself is decorative here.
            <Image
              src={currentBook.coverUrl}
              alt=""
              fill
              sizes="280px"
              className="object-cover"
              priority={activeIndex === 0}
              loading={activeIndex === 0 ? undefined : "eager"}
            />
          ) : (
            <div
              className="flex h-full w-full flex-col justify-end p-5"
              style={{
                background: `linear-gradient(135deg, ${hexOf(currentBook.coverColor, "#0891b2")}, ${hexOf(currentBook.coverColor, "#0891b2")}cc)`,
              }}
            >
              {currentBook.department && (
                <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-white/50">
                  {currentBook.department}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Glass border overlay */}
        <div className="absolute inset-0 rounded-2xl border border-white/[0.12] transition-colors group-hover:border-gold-400/60" aria-hidden />

        {/* Bottom info bar */}
        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/75 via-black/45 to-transparent px-4 pb-3.5 pt-10">
          <p className={`text-[14px] font-bold leading-snug text-white line-clamp-2 ${fade}`} style={{ opacity: shown }}>
            {currentBook.title}
          </p>
          <p className={`mt-1 text-[12px] text-white/70 ${fade}`} style={{ opacity: shown }}>
            {currentBook.author}
          </p>
        </div>
      </Link>

      {/* ── Floating shortcut: Browse all resources ── */}
      <Link
        href="/books"
        aria-label={labels.browseAll}
        className="absolute -right-4 top-8 z-20 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] shadow-lg backdrop-blur-md transition-all hover:bg-white/[0.12] hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 motion-reduce:hover:scale-100"
      >
        <svg className="h-6 w-6 text-gold-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      </Link>

      {/* ── Floating shortcut: Most downloaded ── */}
      <Link
        href="/books?sort=downloads"
        prefetch={false}
        aria-label={labels.mostDownloaded}
        className="absolute -left-5 bottom-16 z-20 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] shadow-lg backdrop-blur-md transition-all hover:bg-white/[0.12] hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400 motion-reduce:hover:scale-100"
      >
        <svg className="h-5 w-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v13m0 0-4-4m4 4 4-4" />
          <path d="M4 20h16" />
        </svg>
      </Link>

      {/* ── Progress dots — each one picks that book ── */}
      {books.length > 1 && (
        <div className="absolute -bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5">
          {books.map((book, i) => (
            <button
              key={book.slug}
              type="button"
              aria-label={book.title}
              aria-current={i === activeIndex ? "true" : undefined}
              onClick={() => {
                setActiveIndex(i);
                setFadeState("in");
              }}
              // 24 px hit box around a 6 px dot; the row is the target, not the dot.
              className="flex h-6 items-center px-0.5 outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              <span
                className={`block h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none ${
                  i === activeIndex ? "w-5 bg-gold-400" : "w-1.5 bg-white/30 hover:bg-white/60"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
