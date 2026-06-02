import { createServiceClient } from "@/lib/supabase/server";
import { mapRowToBook } from "@/lib/books";
import BookCard from "@/components/ui/books/BookCard";
import { getTranslations } from 'next-intl/server';

interface RelatedBooksProps {
  currentSlug: string;
  department: string;
  category: string;
}

export default async function RelatedBooks({
  currentSlug,
  department,
  category,
}: RelatedBooksProps) {
  const t = await getTranslations('bookDetail');
  const supabase = createServiceClient();

  const selectCols = `
    id, title, slug, description,
    cover_color, cover_url,
    language, department, pages, published_at, isbn, rating, tags,
    download_count, view_count,
    authors ( name, bio ),
    categories ( name ),
    book_files ( id, format, file_url, file_size_kb )
  `;

  let { data } = await supabase
    .from("books")
    .select(selectCols)
    .eq("is_published", true)
    .neq("slug", currentSlug)
    .eq("department", department)
    .order("download_count", { ascending: false })
    .limit(6);

  if (!data || data.length === 0) {
    const { data: fallbackData } = await supabase
      .from("books")
      .select(`
        id, title, slug, description,
        cover_color, cover_url,
        language, department, pages, published_at, isbn, rating, tags,
        download_count, view_count,
        authors ( name, bio ),
        categories!inner ( name ),
        book_files ( id, format, file_url, file_size_kb )
      `)
      .eq("is_published", true)
      .neq("slug", currentSlug)
      .eq("categories.name", category)
      .order("download_count", { ascending: false })
      .limit(6);

    data = fallbackData;
  }

  if (!data || data.length === 0) return null;

  const books = data.map(mapRowToBook);

  return (
    <section className="mt-16">
      <div className="mb-8 flex items-center justify-between">
        <h2 className="font-khmer-serif text-[28px] font-bold text-text-heading">
          {t('relatedBooks')}
        </h2>
      </div>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 sm:gap-5">
        {books.map((book) => (
          <BookCard key={book.slug} book={book} />
        ))}
      </div>
    </section>
  );
}
