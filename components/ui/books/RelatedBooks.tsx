import { createServiceClient } from "@/lib/supabase/server";
import { mapRowToBook } from "@/lib/books";
import BookCard from "@/components/ui/books/BookCard";
import { getTranslations } from 'next-intl/server';

interface RelatedBooksProps {
  currentSlug: string;
  department: string;
  category: string;
  tags?: string[];
}

const SELECT_COLS = `
  id, title, slug, description,
  cover_color, cover_url,
  language, department, pages, published_at, isbn, rating, tags,
  download_count, view_count,
  authors ( name, bio ),
  categories ( name ),
  book_files ( id, format, file_url, file_size_kb )
` as const;

const SELECT_COLS_CATEGORY = `
  id, title, slug, description,
  cover_color, cover_url,
  language, department, pages, published_at, isbn, rating, tags,
  download_count, view_count,
  authors ( name, bio ),
  categories!inner ( name ),
  book_files ( id, format, file_url, file_size_kb )
` as const;

function scoreByTags(bookTags: string[], currentTags: string[]): number {
  if (!currentTags.length || !bookTags.length) return 0;
  const current = new Set(currentTags.map((t) => t.toLowerCase()));
  return bookTags.filter((t) => current.has(t.toLowerCase())).length;
}

export default async function RelatedBooks({
  currentSlug,
  department,
  category,
  tags = [],
}: RelatedBooksProps) {
  const t = await getTranslations('bookDetail');
  const supabase = createServiceClient();

  // Fetch a broader pool from the same department (up to 18)
  let { data } = await supabase
    .from("books")
    .select(SELECT_COLS)
    .eq("is_published", true)
    .neq("slug", currentSlug)
    .eq("department", department)
    .order("download_count", { ascending: false })
    .limit(18);

  // Fallback to same category if department yields nothing
  if (!data || data.length === 0) {
    const { data: fallback } = await supabase
      .from("books")
      .select(SELECT_COLS_CATEGORY)
      .eq("is_published", true)
      .neq("slug", currentSlug)
      .eq("categories.name", category)
      .order("download_count", { ascending: false })
      .limit(18);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data = fallback as any;
  }

  if (!data || data.length === 0) return null;

  // Rank by shared-tag count (desc), then download_count (already sorted)
  const ranked = data
    .map((row) => ({ row, score: scoreByTags(row.tags ?? [], tags) }))
    .sort((a, b) => b.score - a.score || (b.row.download_count ?? 0) - (a.row.download_count ?? 0))
    .slice(0, 6)
    .map(({ row }) => mapRowToBook(row));

  return (
    <section className="mt-16">
      <div className="mb-8 flex items-center justify-between">
        <h2 className="font-khmer-serif text-[28px] font-bold text-text-heading">
          {t('relatedBooks')}
        </h2>
      </div>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 sm:gap-5">
        {ranked.map((book) => (
          <BookCard key={book.slug} book={book} />
        ))}
      </div>
    </section>
  );
}
