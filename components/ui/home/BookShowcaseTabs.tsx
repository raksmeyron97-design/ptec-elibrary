// components/ui/home/BookShowcaseTabs.tsx
"use client";

import { useState, type ComponentProps } from "react";
import { Link } from "@/i18n/navigation";
import BookCard from "@/components/ui/books/BookCard";
import BookCarousel from "./BookCarousel";
import { useTranslations } from "next-intl";
import { StaggerRevealContainer, StaggerRevealItem } from "@/components/ui/animations/ScrollRevealWrapper";

type BookCardData = ComponentProps<typeof BookCard>["book"];

type TabKey = "trending" | "recent";

type Props = {
  trending: BookCardData[];
  recent: BookCardData[];
  /** Distinct department names to show as filter chips (pre-sorted, max 6) */
  depts?: string[];
  /** Pre-grouped books per department (trending order, max 10 each) */
  deptBooks?: Record<string, BookCardData[]>;
  layout?: "carousel" | "grid";
};

const TAB_HREFS: Record<TabKey, string> = {
  trending: "/books?sort=downloads",
  recent: "/books?sort=newest",
};

export default function BookShowcaseTabs({
  trending,
  recent,
  depts = [],
  deptBooks = {},
  layout = "carousel",
}: Props) {
  const t = useTranslations("home");
  const [tab, setTab] = useState<TabKey>("trending");
  const [activeDept, setActiveDept] = useState<string | null>(null);

  // When a dept chip is active, show its pre-fetched books (trending order).
  // Sort toggle only applies to the "All" view.
  const books = activeDept
    ? (deptBooks[activeDept] ?? [])
    : tab === "trending"
      ? trending
      : recent;

  const viewAllHref = activeDept
    ? `/books?department=${encodeURIComponent(activeDept)}`
    : TAB_HREFS[tab];

  return (
    <div>
      {/* ── Tab header + view-all link ── */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div
          role="tablist"
          aria-label="Browse books"
          className="inline-flex rounded-full border border-divider bg-bg-surface p-1 shadow-sm shadow-inner"
        >
          {(["trending", "recent"] as TabKey[]).map((key) => {
            const active = key === tab && !activeDept;
            return (
              <button key={key} type="button" role="tab" aria-selected={active}
                onClick={() => { setTab(key); setActiveDept(null); }}
                className={`relative rounded-full px-4 py-2 text-[13px] font-bold transition-all sm:px-5 ${
                  active
                    ? "bg-gradient-to-r from-brand to-blue-600 text-white shadow-md shadow-brand/20"
                    : "text-text-muted hover:text-text-heading"
                }`}
              >
                {key === "trending" ? t("browseTrending") : t("browseRecent")}
              </button>
            );
          })}
        </div>

        <Link
          href={viewAllHref}
          className="group hidden shrink-0 items-center gap-2 rounded-full border border-brand/30 bg-brand/[0.06] px-4 py-[7px] text-[13px] font-semibold text-brand transition-all duration-200 hover:border-brand hover:bg-brand hover:text-white hover:shadow-sm hover:shadow-brand/25 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:inline-flex"
        >
          {t("browseResources")}
          <svg
            className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Link>
      </div>

      {/* ── Department filter chips ── */}
      {depts.length > 0 && (
        <div className="mb-6 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {/* "All" chip */}
          <button type="button" onClick={() => setActiveDept(null)}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-[12px] font-bold transition-colors ${
              activeDept === null
                ? "border-brand bg-brand text-brand-contrast"
                : "border-divider bg-bg-surface text-text-muted hover:border-brand/40 hover:text-text-heading"
            }`}
          >
            {t("deptAll")}
          </button>

          {depts.map((dept) => (
            <button key={dept} type="button" onClick={() => setActiveDept(dept)}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-[12px] font-bold transition-colors ${
                activeDept === dept
                  ? "border-brand bg-brand text-brand-contrast"
                  : "border-divider bg-bg-surface text-text-muted hover:border-brand/40 hover:text-text-heading"
              }`}
            >
              {dept}
            </button>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      {books.length === 0 ? (
        <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-divider bg-paper text-sm text-text-muted">
          {activeDept
            ? `No books found in ${activeDept}.`
            : tab === "trending"
              ? "No resources published yet."
              : "Nothing added recently."}
        </div>
      ) : layout === "grid" ? (
        <StaggerRevealContainer className="grid grid-cols-2 gap-4 sm:gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {books.map((book) => (
            <StaggerRevealItem key={book.slug} className="h-full">
              <BookCard book={book} />
            </StaggerRevealItem>
          ))}
        </StaggerRevealContainer>
      ) : (
        <BookCarousel
          aria-label={
            activeDept
              ? `Books in ${activeDept}`
              : tab === "trending"
                ? "Trending books"
                : "Recently added books"
          }
        >
          {books.map((book) => (
            <BookCard key={book.slug} book={book} />
          ))}
        </BookCarousel>
      )}
    </div>
  );
}
