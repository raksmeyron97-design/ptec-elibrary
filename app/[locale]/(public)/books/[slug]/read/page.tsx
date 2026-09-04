import type { Metadata } from "next";
import { decodeSlugParam } from "@/lib/slug";
import { notFound, redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { mapRowToBook } from "@/lib/books";
import { bookToCitationWork, hasCitableMetadata } from "@/lib/books/citation";
import { getReadingProgress } from "@/app/actions/reading-progress";
import PDFViewer from "@/components/ui/reader/PDFViewerClient";
import ReaderOpenPing from "@/components/ui/reader/ReaderOpenPing";
import ReaderViewportFill from "@/components/ui/reader/ReaderViewportFill";
import { localeAlternates } from "@/lib/seo/alternates";
import { getSiteConfig } from "@/lib/system-settings/config";

// Dedicated, chrome-light reading surface. The book detail page embeds the
// same viewer as a preview; long reading sessions belong here, where the
// viewer gets the whole viewport. The reader's own HUD carries the back link
// and the title, so this page adds no chrome of its own.

type ReadPageProps = { params: Promise<{ slug: string; locale: string }> };

const getReadableBook = unstable_cache(
  async (slug: string) => {
    const supabase = createServiceClient();
    const COLUMNS =
      "id, title, slug, cover_color, cover_url, pages, department, isbn, publisher, language, published_at, verified_at, authors ( name, bio ), categories ( name )";
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
  const { slug: rawSlug, locale } = await params;
  // generateMetadata receives decoded params while the page body gets them
  // encoded — decodeSlugParam is idempotent, so normalize in both places.
  const slug = decodeSlugParam(rawSlug);
  const book = await getReadableBook(slug);
  if (!book || !book.pdfUrl) notFound();

  // Reading is gated: the file API now requires an authenticated reader, so send
  // anonymous visitors to sign in (and back here) instead of rendering a viewer
  // whose PDF fetch would 401.
  const user = await getSessionUser();
  const prefix = locale === "km" ? "/km" : "";
  if (!user) {
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(`${prefix}/books/${slug}/read`)}`);
  }

  const fileSrc = `/api/books/${book.dbId}/file`;
  const [savedProgress, siteConfig] = await Promise.all([getReadingProgress(book.dbId), getSiteConfig()]);
  // The same metadata the book page's "Cite this book" uses — offered inside
  // the reader only when it can support a citation.
  const work = bookToCitationWork(book);
  const citation = hasCitableMetadata(work) ? { work, verified: !!book.verifiedAt } : null;

  return (
    <ReaderViewportFill>
      <ReaderOpenPing contentType="book" contentId={book.dbId} />
      <PDFViewer
        title={book.title}
        pdfUrl={fileSrc}
        bookId={book.dbId}
        totalPages={book.pages}
        initialProgressPct={savedProgress?.progressPct ?? 0}
        initialMaxProgressPct={savedProgress?.maxProgressPct ?? 0}
        initialProgressAt={savedProgress?.lastReadAt ?? null}
        // Library policy (0131), not a UI preference: the reader hides the
        // Download action for a read-online-only book. The refusal that
        // matters is the server's — /api/books/[slug]/download re-decides on
        // every request — but offering an action that would 403 is a worse
        // experience than not offering it.
        allowDownload={book.allowDownload !== false}
        isLoggedIn={!!user}
        reportEmail={siteConfig.email}
        backHref={`${prefix}/books/${slug}`}
        citation={citation}
        layout="fill"
      />
    </ReaderViewportFill>
  );
}
