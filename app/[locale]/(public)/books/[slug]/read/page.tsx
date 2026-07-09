import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { mapRowToBook } from "@/lib/books";
import { getReadingProgress } from "@/app/actions/reading-progress";
import PDFViewer from "@/components/ui/reader/PDFViewerClient";
import Icon from "@/components/ui/core/Icon";
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/lib/seo/alternates";

// Dedicated, chrome-light reading surface. The book detail page embeds the
// same viewer as a preview; long reading sessions belong here, where the
// viewer gets the whole viewport instead of competing with page furniture.

type ReadPageProps = { params: Promise<{ slug: string; locale: string }> };

const getReadableBook = unstable_cache(
  async (slug: string) => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("books")
      .select("id, title, slug, cover_color, cover_url, pages, department, authors ( name, bio ), categories ( name )")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();
    if (!data) return null;

    const { data: files } = await supabase
      .from("book_files")
      .select("id, format, file_url, file_size_kb")
      .eq("book_id", data.id);

    const mapped = mapRowToBook({ ...data, book_files: files ?? [], reviews: [] });
    return { ...mapped, dbId: data.id as string };
  },
  ["book-read"],
  { revalidate: 3600, tags: ["books"] },
);

const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

export async function generateMetadata({ params }: ReadPageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const book = await getReadableBook(slug);
  if (!book) return {};
  return {
    title: `${book.title} — Read online`,
    // The canonical document is the book detail page; the reader is a view.
    alternates: localeAlternates(`/books/${slug}`, locale),
    robots: { index: false },
  };
}

export default async function BookReadPage({ params }: ReadPageProps) {
  const [{ slug }, t] = await Promise.all([params, getTranslations("bookDetail")]);
  const book = await getReadableBook(slug);
  if (!book || !book.pdfUrl) notFound();

  const fileSrc = `/api/books/${book.dbId}/file`;
  const [user, savedProgress] = await Promise.all([
    getSessionUser(),
    getReadingProgress(book.dbId),
  ]);

  return (
    <div className="min-h-screen bg-bg-body">
      {/* Slim context bar — back to the book, nothing else. */}
      <div className="border-b border-divider bg-bg-surface px-4 py-2.5 sm:px-6">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3">
          <Link
            href={`/books/${slug}`}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand transition-colors hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Icon name="arrow-left" className="text-[15px]" />
            {t("details")}
          </Link>
          <h1 className="font-khmer-serif min-w-0 flex-1 truncate text-[15px] font-bold text-text-heading">
            {book.title}
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-2 py-3 sm:px-4 sm:py-4">
        <PDFViewer
          title={book.title}
          pdfUrl={fileSrc}
          bookId={book.dbId}
          totalPages={book.pages}
          initialProgressPct={savedProgress?.progressPct ?? 0}
          initialMaxProgressPct={savedProgress?.maxProgressPct ?? 0}
          allowDownload={true}
          isLoggedIn={!!user}
        />
      </div>
    </div>
  );
}
