import { getRecentlyAddedCached, getDeptBooksCached } from "@/lib/home-data";
import BookShowcaseTabs from "./BookShowcaseTabs";
import type { ComponentProps } from "react";
import BookCard from "@/components/ui/books/BookCard";
import { SectionTitle } from "@/components/ui/core/SectionTitle";
import { getTranslations, getLocale } from "next-intl/server";
import { ScrollRevealWrapper } from "@/components/ui/animations/ScrollRevealWrapper";

type BookCardData = ComponentProps<typeof BookCard>["book"];

export default async function BrowseBooksSection({ trendingBooks }: { trendingBooks: BookCardData[] }) {
  const [recentlyAdded, { depts, deptBooks }, t, locale] = await Promise.all([
    getRecentlyAddedCached(),
    getDeptBooksCached(),
    getTranslations("home"),
    getLocale(),
  ]);
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.22em]" : "tracking-normal";

  const trending12 = trendingBooks.slice(0, 12);

  return (
    <section className="border-y border-divider/70 bg-gradient-to-b from-paper via-bg-surface to-paper overflow-hidden">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-16 md:px-12 md:py-20">
        <ScrollRevealWrapper className="mb-6 sm:mb-9">
          <div className="mb-2 flex items-center gap-3">
            <span className="h-[3px] w-7 rounded-full bg-gradient-to-r from-brand to-accent" aria-hidden />
            <span className={`text-[11px] font-bold text-brand ${latinEyebrow}`}>{t("browseSectionEyebrow")}</span>
          </div>
          <SectionTitle as="h2" className="!mb-0 mt-1">{t("browseSectionTitle")}</SectionTitle>
        </ScrollRevealWrapper>
        <ScrollRevealWrapper>
          <BookShowcaseTabs
            trending={trending12}
            recent={recentlyAdded}
            depts={depts}
            deptBooks={deptBooks}
            layout="grid"
          />
        </ScrollRevealWrapper>
      </div>
    </section>
  );
}
