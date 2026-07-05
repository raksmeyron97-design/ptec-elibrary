import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { mapRowToBook } from "@/lib/books";
import BookCard from "@/components/ui/books/BookCard";

const SELECT_COLS = `
  id, title, slug, description,
  cover_color, cover_url,
  language, department, pages, published_at, isbn, rating, tags,
  download_count, view_count, created_at,
  authors ( name, bio ),
  categories ( name ),
  book_files ( id, format, file_url, file_size_kb )
` as const;

/**
 * "Similar Books" / recommended reading: library books whose tags overlap the
 * article's subjects + keywords, topped up with popular titles. Renders
 * nothing when the library has no published books.
 */
export default async function SimilarBooks({
  keywords,
  subjects,
}: {
  keywords: string[];
  subjects: string[];
}) {
  const t = await getTranslations("publicationDetail");
  const supabase = createServiceClient();
  const TARGET = 6;

  const terms = [...new Set([...subjects, ...keywords].map((s) => s.trim()).filter(Boolean))];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = [];
  const seen = new Set<string>();

  if (terms.length > 0) {
    const { data } = await supabase
      .from("books")
      .select(SELECT_COLS)
      .eq("is_published", true)
      .overlaps("tags", terms)
      .order("view_count", { ascending: false })
      .limit(TARGET);
    for (const row of data ?? []) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        rows.push(row);
      }
    }
  }

  if (rows.length < TARGET) {
    const { data } = await supabase
      .from("books")
      .select(SELECT_COLS)
      .eq("is_published", true)
      .order("download_count", { ascending: false })
      .limit(TARGET * 2);
    for (const row of data ?? []) {
      if (rows.length >= TARGET) break;
      if (!seen.has(row.id)) {
        seen.add(row.id);
        rows.push(row);
      }
    }
  }

  if (rows.length === 0) return null;

  const books = rows.map((row) => mapRowToBook(row));

  return (
    <section
      id="similar-books"
      className="mt-16 scroll-mt-20 lg:scroll-mt-32"
      aria-labelledby="similar-books-heading"
    >
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="h-[3px] w-8 rounded-full bg-gradient-to-r from-brand to-accent" />
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-text-muted">
              {t("recommendedReading")}
            </span>
          </div>
          <h2
            id="similar-books-heading"
            className="font-khmer-serif text-[26px] font-bold text-text-heading sm:text-[28px]"
          >
            {t("similarBooks")}
          </h2>
          <p className="mt-1 text-[13px] text-text-muted">{t("similarBooksSubtitle")}</p>
        </div>
        <Link
          href="/books"
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-4 py-2 text-[13px] font-semibold text-text-body shadow-sm transition-colors duration-150 hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          {t("browseLibrary")}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 xl:grid-cols-6">
        {books.map((book) => (
          <BookCard key={book.slug} book={book} />
        ))}
      </div>
    </section>
  );
}
