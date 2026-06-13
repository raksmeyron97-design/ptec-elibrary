import { createServiceClient } from "@/lib/supabase/server";
import { mapRowToBook, BOOK_SELECT } from "@/lib/books";
import BookShowcaseTabs from "./BookShowcaseTabs";
import type { ComponentProps } from "react";
import BookCard from "@/components/ui/books/BookCard";
import { SectionTitle } from "@/components/ui/core/SectionTitle";
import { getTranslations, getLocale } from "next-intl/server";
import { ScrollRevealWrapper } from "@/components/ui/animations/ScrollRevealWrapper";

type BookCardData = ComponentProps<typeof BookCard>["book"];

async function getRecentlyAdded() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("books")
    .select(BOOK_SELECT)
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(10);
  return (data ?? []).map(mapRowToBook);
}

export default async function BrowseBooksSection({ trendingBooks }: { trendingBooks: BookCardData[] }) {
  const [recentlyAdded, t, locale] = await Promise.all([
    getRecentlyAdded(),
    getTranslations("home"),
    getLocale(),
  ]);
  const latinEyebrow = locale === "en" ? "uppercase tracking-[0.22em]" : "tracking-normal";

  // Group the pre-fetched trending books by department (max 6 depts × 10 books).
  // trendingBooks comes from page.tsx with a limit of 60 for this purpose.
  const deptMap = new Map<string, BookCardData[]>();
  for (const book of trendingBooks) {
    const dept = book.department;
    if (dept && dept !== "General") {
      if (!deptMap.has(dept)) deptMap.set(dept, []);
      const arr = deptMap.get(dept)!;
      if (arr.length < 10) arr.push(book);
    }
  }
  const depts = [...deptMap.keys()].slice(0, 6);
  const deptBooks = Object.fromEntries(deptMap.entries());

  const trending10 = trendingBooks.slice(0, 10);

  return (
    <section className="border-y border-divider/70 bg-gradient-to-b from-paper via-bg-surface to-paper overflow-hidden">
      <div className="mx-auto max-w-[1400px] px-4 py-12 sm:py-16 md:px-12 md:py-20">
        <ScrollRevealWrapper className="mb-6 sm:mb-9">
          <span className={`text-[11px] font-bold text-brand ${latinEyebrow}`}>{t("browseSectionEyebrow")}</span>
          <SectionTitle as="h2" className="!mb-0 mt-2">{t("browseSectionTitle")}</SectionTitle>
        </ScrollRevealWrapper>
        <ScrollRevealWrapper>
          <BookShowcaseTabs
            trending={trending10}
            recent={recentlyAdded}
            depts={depts}
            deptBooks={deptBooks}
          />
        </ScrollRevealWrapper>
      </div>
    </section>
  );
}
