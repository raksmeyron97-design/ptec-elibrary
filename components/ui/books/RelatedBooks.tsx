import { createServiceClient } from "@/lib/supabase/server";
import { mapRowToBook } from "@/lib/books";
import { rankRelated, type RelatedCandidate, type RelatedReason } from "@/lib/discovery/related-score";
import BookCard from "@/components/ui/books/BookCard";
import { getTranslations } from 'next-intl/server';

interface RelatedBooksProps {
  currentSlug: string;
  department: string;
  category: string;
  /** Names as displayed; identity is exact normalized equality, never fuzzy. */
  authors?: string[];
  language?: string | null;
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

const SELECT_COLS_CATEGORY = SELECT_COLS.replace("categories ( name )", "categories!inner ( name )");
const SELECT_COLS_AUTHOR = SELECT_COLS.replace("authors ( name, bio )", "authors!inner ( name, bio )");

const POOL_LIMIT = 18;
const AUTHOR_POOL_LIMIT = 12;
const SHOWN = 6;

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Two bounded pools — the same department (or category when the department
 * is empty) and the same author — ranked by lib/discovery/related-score:
 * subject > author > shared tags > language > type, popularity only as a
 * tie-break. The caption under the rail names the signals that put a book
 * there, so "related" is a claim the reader can check.
 */
export default async function RelatedBooks({
  currentSlug,
  department,
  category,
  authors = [],
  language = null,
  tags = [],
}: RelatedBooksProps) {
  const t = await getTranslations('bookDetail');
  const supabase = createServiceClient();

  const published = (columns: string) =>
    supabase.from("books").select(columns).eq("is_published", true).neq("slug", currentSlug);

  const authorNames = authors.flatMap((a) => (a.trim() ? [a.trim()] : []));
  const [byDepartment, byAuthor] = await Promise.all([
    department
      ? published(SELECT_COLS).eq("department", department).order("download_count", { ascending: false }).limit(POOL_LIMIT)
      : published(SELECT_COLS_CATEGORY).eq("categories.name", category).order("download_count", { ascending: false }).limit(POOL_LIMIT),
    authorNames.length
      ? published(SELECT_COLS_AUTHOR).in("authors.name", authorNames).order("download_count", { ascending: false }).limit(AUTHOR_POOL_LIMIT)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  let pool: any[] = [...((byDepartment.data as any[] | null) ?? []), ...((byAuthor.data as any[] | null) ?? [])];
  if (pool.length === 0 && department) {
    const { data } = await published(SELECT_COLS_CATEGORY).eq("categories.name", category).order("download_count", { ascending: false }).limit(POOL_LIMIT);
    pool = (data as any[] | null) ?? [];
  }
  if (pool.length === 0) return null;

  const candidates: RelatedCandidate<any>[] = pool.map((row) => ({
    id: row.id,
    type: "book",
    subject: row.categories?.name ?? row.department ?? null,
    authors: row.authors?.name ? [row.authors.name] : [],
    keywords: Array.isArray(row.tags) ? row.tags : [],
    language: row.language ?? null,
    popularity: row.download_count ?? 0,
    item: row,
  }));

  const ranked = rankRelated(
    { id: "current", type: "book", subject: category || department, authors: authorNames, keywords: tags, language },
    candidates,
    SHOWN,
  );
  if (ranked.length === 0) return null;

  const reasons = new Set<RelatedReason>();
  for (const r of ranked) for (const reason of r.reasons) if (reason !== "type" && reason !== "language") reasons.add(reason);

  return (
    <section className="mt-16">
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="font-khmer-serif text-[28px] font-bold text-text-heading">
          {t('relatedBooks')}
        </h2>
        {reasons.size > 0 && (
          <p className="text-[12.5px] font-medium" style={{ color: "var(--ptec-text-muted)" }}>
            {[...reasons].map((reason) => t(`relatedReason.${reason}`)).join(" · ")}
          </p>
        )}
      </div>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 sm:gap-5">
        {ranked.map(({ item }) => {
          const book = mapRowToBook(item);
          return <BookCard key={book.slug} book={book} />;
        })}
      </div>
    </section>
  );
}
