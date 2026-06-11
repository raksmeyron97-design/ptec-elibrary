// components/ui/BookShowcaseTabs.tsx
"use client";

import { useState, type ComponentProps } from "react";
import Link from "next/link";
import BookCard from "@/components/ui/books/BookCard";
import BookCarousel from "./BookCarousel";

// Stay in sync with BookCard's expected prop shape automatically.
type BookCardData = ComponentProps<typeof BookCard>["book"];

type TabKey = "trending" | "recent";

type Props = {
  trending: BookCardData[];
  recent: BookCardData[];
  /** "carousel" (default) or "grid" */
  layout?: "carousel" | "grid";
};

const TABS: { key: TabKey; label: string; href: string }[] = [
  { key: "trending", label: "Trending", href: "/books?sort=downloads" },
  { key: "recent", label: "Recently Added", href: "/books?sort=newest" },
];

export default function BookShowcaseTabs({ trending, recent, layout = "carousel" }: Props) {
  const [tab, setTab] = useState<TabKey>("trending");
  const books = tab === "trending" ? trending : recent;
  const activeHref = TABS.find((t) => t.key === tab)!.href;

  return (
    <div>
      {/* Tab header row */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div
          role="tablist"
          aria-label="Browse books"
          className="inline-flex rounded-full border border-divider bg-bg-surface p-1 shadow-sm shadow-inner"
        >
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={`relative rounded-full px-4 py-2 text-[13px] font-bold transition-all sm:px-5 ${
                  active
                    ? "bg-gradient-to-r from-brand to-blue-600 text-white shadow-md shadow-brand/20"
                    : "text-text-muted hover:text-text-heading"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <Link
          href={activeHref}
          className="hidden shrink-0 items-center gap-1.5 text-sm font-semibold text-brand transition-colors hover:text-gold-700 sm:inline-flex"
        >
          Browse e-resources
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>

      {/* Content */}
      {books.length === 0 ? (
        <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-divider bg-paper text-sm text-text-muted">
          {tab === "trending" ? "No resources published yet." : "Nothing added recently."}
        </div>
      ) : layout === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-5">
          {books.map((book) => (
            <BookCard key={book.slug} book={book} />
          ))}
        </div>
      ) : (
        <BookCarousel aria-label={tab === "trending" ? "Trending books" : "Recently added books"}>
          {books.map((book) => (
            <BookCard key={book.slug} book={book} />
          ))}
        </BookCarousel>
      )}
    </div>
  );
}
