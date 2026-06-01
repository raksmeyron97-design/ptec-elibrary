import { createServiceClient } from "@/lib/supabase/server";
import { mapRowToBook } from "@/lib/books";
import BookShowcaseTabs from "./BookShowcaseTabs";
import type { ComponentProps } from "react";
import BookCard from "@/components/ui/books/BookCard";

type BookCardData = ComponentProps<typeof BookCard>["book"];

async function getRecentlyAdded() {
  const supabase = createServiceClient();
  const BOOK_SELECT = `id, title, slug, description, cover_color, cover_url, language,
   published_at, department, pages, isbn, rating, download_count, view_count,
   authors(name), categories(name), book_files(format, file_url, file_size_kb)`;
   
  const { data } = await supabase
    .from("books")
    .select(BOOK_SELECT)
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(10);
  return (data ?? []).map(mapRowToBook);
}

export default async function BrowseBooksSection({ trendingBooks }: { trendingBooks: BookCardData[] }) {
  const recentlyAdded = await getRecentlyAdded();
  
  return (
    <section className="border-y border-divider bg-bg-surface">
      <div className="mx-auto max-w-[1400px] px-4 py-20 md:px-12">
        <BookShowcaseTabs trending={trendingBooks} recent={recentlyAdded} />
      </div>
    </section>
  );
}
