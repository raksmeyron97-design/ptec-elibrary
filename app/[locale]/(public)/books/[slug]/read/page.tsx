import type { Metadata } from "next";
import { decodeSlugParam } from "@/lib/slug";
import { Link } from "@/i18n/navigation";
import { notFound, redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { mapRowToBook } from "@/lib/books";
import { getReadingProgress } from "@/app/actions/reading-progress";
import PDFViewer from "@/components/ui/reader/PDFViewerClient";
import ReaderOpenPing from "@/components/ui/reader/ReaderOpenPing";
import Icon from "@/components/ui/core/Icon";
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/lib/seo/alternates";
import { getSiteConfig } from "@/lib/system-settings/config";

// Dedicated, chrome-light reading surface. The book detail page embeds the
// same viewer as a preview; long reading sessions belong here, where the
// viewer gets the whole viewport instead of competing with page furniture.

type ReadPageProps = { params: Promise<{ slug: string; locale: string }> };

const getReadableBook = unstable_cache(
  async (slug: string) => {
    const supabase = createServiceClient();
    const COLUMNS = "id, title, slug, cover_color, cover_url, pages, department, authors ( name, bio ), categories ( name )";
    const load = (columns: string) =>
      supabase
        .from("books")
        .select(columns)
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();

    // allow_download (0131) drives whether the viewer offers a Download action.
    // Asked for defensively: on a database without the column the whole select
    // fails, and losing the reader entirely would be a far worse outcome than
    // falling back to the column's default (downloadable).
    let { data } = await load(`${COLUMNS}, allow_download`);
    if (!data) ({ data } = await load(COLUMNS));
    if (!data) return null;
    // The column list is built at runtime, so PostgREST's inferred row type is
    // no longer usable here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;

    const { data: files } = await supabase
      .from("book_files")
      .select("id, format, file_url, file_size_kb")
      .eq("book_id", row.id);

    const mapped = mapRowToBook({ ...row, book_files: files ?? [], reviews: [] });
    return { ...mapped, dbId: row.id as string };
  },
  ["book-read"],
  { revalidate: 3600, tags: ["books"] },
);


export async function generateMetadata({ params }: ReadPageProps): Promise<Metadata> {
  const { slug: rawSlug, locale } = await params;
  const slug = decodeSlugParam(rawSlug);
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
  const [{ slug: rawSlug, locale }, t] = await Promise.all([params, getTranslations("bookDetail")]);
  // generateMetadata receives decoded params while the page body gets them
  // encoded — decodeSlugParam is idempotent, so normalize in both places.
  const slug = decodeSlugParam(rawSlug);
  const book = await getReadableBook(slug);
  if (!book || !book.pdfUrl) notFound();

  // Reading is gated: the file API now requires an authenticated reader, so send
  // anonymous visitors to sign in (and back here) instead of rendering a viewer
  // whose PDF fetch would 401.
  const user = await getSessionUser();
  if (!user) {
    const prefix = locale === "km" ? "/km" : "";
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(`${prefix}/books/${slug}/read`)}`);
  }

  const fileSrc = `/api/books/${book.dbId}/file`;
  const savedProgress = await getReadingProgress(book.dbId);

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

      <ReaderOpenPing contentType="book" contentId={book.dbId} />
      <div className="mx-auto max-w-[1400px] px-2 py-3 sm:px-4 sm:py-4">
        <PDFViewer
          title={book.title}
          pdfUrl={fileSrc}
          bookId={book.dbId}
          totalPages={book.pages}
          initialProgressPct={savedProgress?.progressPct ?? 0}
          initialMaxProgressPct={savedProgress?.maxProgressPct ?? 0}
          // Library policy (0131), not a UI preference: the reader hides the
          // Download action for a read-online-only book. The refusal that
          // matters is the server's — /api/books/[slug]/download re-decides on
          // every request — but offering an action that would 403 is a worse
          // experience than not offering it.
          allowDownload={book.allowDownload !== false}
          isLoggedIn={!!user}
          reportEmail={(await getSiteConfig()).email}
        />
      </div>
    </div>
  );
}
