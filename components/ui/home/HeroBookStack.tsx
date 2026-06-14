// components/ui/HeroBookStack.tsx
"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

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
};

const INTERVAL = 3000; // 3 seconds

const backCards = [
  { rotate: "-6deg", translateX: "-12px", translateY: "16px", opacity: 0.45, scale: 0.92 },
  { rotate: "-3deg", translateX: "-4px",  translateY: "8px",  opacity: 0.7,  scale: 0.96 },
];

export default function HeroBookStack({ books }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [fadeState, setFadeState] = useState<"in" | "out">("in");

  useEffect(() => {
    if (books.length <= 1) return;

    const timer = setInterval(() => {
      // Start fade out
      setFadeState("out");

      // After fade out completes, switch image and fade in
      setTimeout(() => {
        setActiveIndex((prev) => (prev + 1) % books.length);
        setFadeState("in");
      }, 400);
    }, INTERVAL);

    return () => clearInterval(timer);
  }, [books.length]);

  if (books.length === 0) return null;

  const currentBook = books[activeIndex];
  const nextBook = books[(activeIndex + 1) % books.length];
  const prevBook = books[(activeIndex + books.length - 1) % books.length];
  const backBooks = [prevBook, nextBook];

  return (
    <div className="relative h-[480px] w-[400px]">

      {/* ── Back cards (static, showing adjacent book colors) ── */}
      {backCards.map((style, i) => {
        const bk = backBooks[i] ?? books[0];
        const bgColor = bk.coverColor ?? "bg-brand";
        // Extract hex from Tailwind class for gradient
        const hexMatch = bgColor.match(/#[0-9a-fA-F]{6}/);
        const hex = hexMatch ? hexMatch[0] : "#0a1629";

        return (
          <div
            key={i}
            className="absolute left-10 top-10 h-[380px] w-[280px] rounded-2xl shadow-2xl shadow-black/40"
            style={{
              transform: `rotate(${style.rotate}) translate(${style.translateX}, ${style.translateY}) scale(${style.scale})`,
              opacity: style.opacity,
              background: `linear-gradient(135deg, ${hex}, ${hex}dd)`,
            }}
          >
            <div className="absolute inset-0 rounded-2xl border border-white/[0.08]" />
            {/* Subtle placeholder lines */}

            <div className="absolute bottom-6 left-5 right-5">
              <div className="mb-2 h-1.5 w-10 rounded-full bg-bg-surface/15" />
              <div className="h-2.5 w-24 rounded-full bg-bg-surface/20" />
              <div className="mt-1.5 h-1.5 w-16 rounded-full bg-bg-surface/10" />
            </div>
          </div>
        );
      })}

      {/* ── Front card (fading cover) ── */}
      <div
        className="absolute left-10 top-10 h-[380px] w-[280px] overflow-hidden rounded-2xl shadow-[0_32px_80px_-16px_rgba(0,0,0,0.5)]"
        style={{
          transform: "rotate(0deg) translate(8px, 0px)",
          zIndex: 10,
        }}
      >
        {/* Cover image or fallback */}
        <div
          className="absolute inset-0 transition-opacity duration-500 ease-in-out"
          style={{ opacity: fadeState === "in" ? 1 : 0 }}
        >
          {currentBook.coverUrl ? (
            <Image
              src={currentBook.coverUrl}
              alt={currentBook.title}
              fill
              sizes="280px"
              className="object-cover"
              priority
            />
          ) : (
            <div
              className="flex h-full w-full flex-col justify-end p-5"
              style={{
                background: `linear-gradient(135deg, ${
                  currentBook.coverColor?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? "#0891b2"
                }, ${
                  currentBook.coverColor?.match(/#[0-9a-fA-F]{6}/)?.[0] ?? "#0891b2"
                }cc)`,
              }}
            >
              {currentBook.department && (
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/50 mb-1">
                  {currentBook.department}
                </p>
              )}
              <p className="text-[16px] font-bold leading-tight text-white line-clamp-3">
                {currentBook.title}
              </p>
              <p className="mt-1.5 text-[12px] text-white/60">{currentBook.author}</p>
            </div>
          )}
        </div>

        {/* Glass border overlay */}
        <div className="absolute inset-0 rounded-2xl border border-white/[0.12]" />

        {/* Bottom info bar */}
        <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 via-black/40 to-transparent px-4 pb-3.5 pt-10">
          <p
            className="text-[14px] font-bold leading-snug text-white line-clamp-2 transition-opacity duration-500"
            style={{ opacity: fadeState === "in" ? 1 : 0 }}
          >
            {currentBook.title}
          </p>
          <p
            className="mt-1 text-[12px] text-white/60 transition-opacity duration-500"
            style={{ opacity: fadeState === "in" ? 1 : 0 }}
          >
            {currentBook.author}
          </p>
        </div>
      </div>

      {/* ── Floating accent: Book icon → Browse resources ── */}
      <Link
        href="/books"
        className="absolute -right-4 top-8 z-20 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-bg-surface/[0.06] shadow-lg backdrop-blur-md transition-all hover:bg-bg-surface/[0.12] hover:scale-110"
      >
        <svg className="h-6 w-6 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      </Link>

      {/* ── Floating accent: Download icon → Most downloaded ── */}
      <Link
        href="/books?sort=downloads"
        className="absolute -left-5 bottom-16 z-20 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-bg-surface/[0.06] shadow-lg backdrop-blur-md transition-all hover:bg-bg-surface/[0.12] hover:scale-110"
      >
        <svg className="h-5 w-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v13m0 0-4-4m4 4 4-4" />
          <path d="M4 20h16" />
        </svg>
      </Link>

      {/* ── Progress dots ── */}
      {books.length > 1 && (
        <div className="absolute -bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5">
          {books.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === activeIndex
                  ? "w-5 bg-accent"
                  : "w-1.5 bg-bg-surface/20"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}