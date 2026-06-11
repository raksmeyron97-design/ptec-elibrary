import { createServiceClient } from "@/lib/supabase/server";
import { mapRowToBook, BOOK_SELECT } from "@/lib/books";
import BookShowcaseTabs from "./BookShowcaseTabs";
import type { ComponentProps } from "react";
import BookCard from "@/components/ui/books/BookCard";
import { SectionTitle } from "@/components/ui/core/SectionTitle";
import { getTranslations, getLocale } from "next-intl/server";

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

  return (
    <section className="border-y border-divider/70 bg-gradient-to-b from-paper via-bg-surface to-paper">
      <div className="mx-auto max-w-[1400px] px-4 py-10 sm:py-14 md:py-20 md:px-12">
        <div className="mb-6 sm:mb-9">
          <span className={`text-[11px] font-bold text-brand ${latinEyebrow}`}>{t("browseSectionEyebrow")}</span>
          <SectionTitle as="h2" className="!mb-0 mt-2">{t("browseSectionTitle")}</SectionTitle>
        </div>
        <BookShowcaseTabs trending={trendingBooks} recent={recentlyAdded} />
      </div>
    </section>
  );
}
