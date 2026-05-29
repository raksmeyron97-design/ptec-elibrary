import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/ui/Icon";
import PDFViewer from "@/components/ui/PDFViewerClient";
import PDFCover from "@/components/ui/PDFCover";
import BookCover from "@/components/ui/BookCover";
import RatingStars from "@/components/ui/RatingStars";
import ReviewForm from "@/components/ui/ReviewForm";
import ReviewList from "@/components/ui/ReviewList";
import SaveButton from "@/components/ui/SaveButton";
import DownloadCount from "@/components/ui/DownloadCount";
import { Badge } from "@/components/ui/Badge";
import { getBookBySlug, type Book } from "@/lib/books";
import { mapRowToBook } from "@/lib/book-utils"; // ← shared mapper
import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { getReadingProgress } from "@/app/actions/reading-progress";
import { getReviews, getUserReview } from "@/app/actions/reviews";
import { isBookSaved } from "@/app/actions/saved-books";
import { getDownloadCount } from "@/app/actions/download";

export const dynamic = "force-dynamic";

type BookDetailPageProps = {
  params: Promise<{ slug: string }>;
};

type BookWithSource = Book & { fromSupabase: boolean; dbId: string | null };

async function getBook(slug: string): Promise<BookWithSource | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("books")
    .select(`
      id, title, slug, description,
      cover_color, cover_url,
      language, department, pages, published_at, isbn, rating, tags,
      download_count,
      authors ( name, bio ),
      categories ( name ),
      book_files ( id, format, file_url, file_size_kb )
    `)
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error) {
    console.error("[getBook] Supabase error:", error.message);
  }

  if (data) {
    const mapped = mapRowToBook(data); // ← use shared mapper
    return {
      ...mapped,
      fromSupabase: true,
      dbId: data.id,
    } as BookWithSource;
  }

  const localBook = getBookBySlug(slug) ?? null;
  if (!localBook) return null;
  return { ...localBook, fromSupabase: false, dbId: null };
}

export default async function BookDetailPage({ params }: BookDetailPageProps) {
  const { slug } = await params;
  const book = await getBook(slug);
  if (!book) notFound();

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  const [savedProgress, reviews, userReview, isSaved, downloadCount] = await Promise.all([
    book.dbId ? getReadingProgress(book.dbId) : Promise.resolve(null),
    book.dbId ? getReviews(book.dbId) : Promise.resolve([]),
    book.dbId && user ? getUserReview(book.dbId) : Promise.resolve(null),
    book.dbId ? isBookSaved(book.dbId) : Promise.resolve(false),
    book.dbId ? getDownloadCount(book.dbId) : Promise.resolve(0),
  ]);

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  const showPdfCover = book.fromSupabase && !!book.pdfUrl;
  const resuming = !!(savedProgress && savedProgress.progressPct > 0);

  return (
    <section className="bg-bg-body px-6 py-10 md:px-12 min-h-screen">
      <div className="mx-auto max-w-[1200px]">
        <Link
          href="/books"
          className="mb-6 inline-flex items-center gap-2 text-[14.5px] font-semibold text-brand transition-colors hover:text-brand-hover"
        >
          <Icon name="arrow-left" className="text-[20px]" />
          Back to catalogue
        </Link>

        {/* ── PDF reader (shown first) ── */}
        {book.fromSupabase && book.pdfUrl && book.dbId && (
          <div id="reader" className="mb-8 scroll-mt-24">
            <PDFViewer
              title={book.title}
              pdfUrl={book.pdfUrl}
              bookId={book.dbId}
              totalPages={book.pages}
              initialProgressPct={savedProgress?.progressPct ?? 0}
            />
          </div>
        )}

        {/* ── Hero card ── */}
        <div className="grid gap-10 rounded-[28px] border border-divider bg-bg-surface p-6 shadow-md md:p-9 lg:grid-cols-[300px_1fr]">

          {/* Cover */}
          <div>
            {showPdfCover ? (
              <PDFCover
                title={book.title}
                coverUrl={book.coverUrl}
                fallbackColor={book.cover}
                label={book.department}
                author={book.author}
              />
            ) : (
              <div className="overflow-hidden rounded-2xl shadow-lg shadow-brand/10 border border-divider/50">
                <div className="aspect-[3/4] w-full bg-paper">
                  <BookCover title={book.title} label={book.department} author={book.author} variant="detail" />
                </div>
              </div>
            )}
          </div>

          {/* Details */}
          <div>
            <div className="flex flex-wrap gap-2 items-center">
              <Badge variant="brand">{book.department}</Badge>
              <Badge variant="neutral">{book.category}</Badge>
              <Badge variant="success">● {book.availability}</Badge>
              <DownloadCount count={downloadCount} />
            </div>

            <h1 className="font-khmer-serif mt-5 text-[clamp(28px,4vw,38px)] font-bold leading-[1.2] text-text-heading">
              {book.title}
            </h1>
            <p className="mt-2 text-[17px] font-medium text-text-muted">by {book.author}</p>
            <div className="mt-4">
              <RatingStars rating={book.rating} />
            </div>

            {resuming && (
              <div className="mt-6 flex items-center gap-4 rounded-[14px] border border-blue-200 bg-blue-50 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-bold text-brand">
                    Continue reading — {savedProgress!.progressPct}% complete
                  </p>
                  <p className="mt-0.5 text-[12px] text-brand/70 font-medium">
                    Last read{" "}
                    {savedProgress!.lastReadAt
                      ? new Date(savedProgress!.lastReadAt).toLocaleDateString()
                      : "recently"}
                  </p>
                </div>
                <div className="hidden h-2 w-32 shrink-0 overflow-hidden rounded-full bg-blue-200 sm:block border border-blue-300">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${savedProgress!.progressPct}%` }}
                  />
                </div>
                <a
                  href="#reader"
                  className="shrink-0 rounded-[10px] bg-brand px-4 py-2 text-[13px] font-bold text-brand-contrast transition hover:bg-brand-hover shadow-sm"
                >
                  Resume
                </a>
              </div>
            )}

            <p className="mt-6 font-sans text-[15.5px] leading-8 text-text-body">{book.summary}</p>

            <dl className="mt-7 grid gap-3 sm:grid-cols-2">
              {[
                ["ISBN",             book.isbn],
                ["Language",         book.language],
                ["Publication year", String(book.year)],
                ["Pages",            String(book.pages)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[13px] bg-paper border border-divider px-4 py-3.5">
                  <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">{label}</dt>
                  <dd className="mt-1 text-[15px] font-semibold text-text-heading">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              {book.pdfUrl ? (
                <a
                  href="#reader"
                  className="inline-flex items-center justify-center gap-2.5 rounded-[14px] bg-brand px-6 py-3.5 text-[15px] font-bold text-brand-contrast transition-all hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-lg hover:shadow-brand/30"
                >
                  <Icon name="pdf" className="text-[20px]" />
                  {resuming ? "Continue reading" : "Read online"}
                </a>
              ) : (
                <span className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-paper border border-divider px-6 py-3.5 text-sm font-semibold text-text-muted">
                  PDF not available
                </span>
              )}
              {book.dbId && (
                <SaveButton
                  bookId={book.dbId}
                  bookSlug={book.slug}
                  initialSaved={isSaved}
                  isLoggedIn={!!user}
                />
              )}
            </div>
          </div>
        </div>

        {/* Reviews */}
        {book.dbId && (
          <div id="reviews" className="mt-12 scroll-mt-24">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-serif text-[28px] font-bold text-text-heading">
                Reader Reviews
                {reviews.length > 0 && (
                  <span className="ml-2.5 text-base font-semibold text-text-muted">({reviews.length})</span>
                )}
              </h2>
              {reviews.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-accent stroke-accent" strokeWidth={1}>
                    <path d="m12 2 3 6.4 7 .8-5.2 4.8 1.4 6.9L12 17.4 5.8 21l1.4-6.9L2 9.2l7-.8L12 2Z" />
                  </svg>
                  <span className="text-sm font-bold text-text-heading">{avgRating.toFixed(1)}</span>
                  <span className="text-sm text-text-muted">average</span>
                </div>
              )}
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <ReviewList reviews={reviews} totalCount={reviews.length} avgRating={avgRating} />
              <div className="lg:sticky lg:top-6 lg:self-start">
                {user ? (
                  <ReviewForm
                    bookId={book.dbId}
                    bookSlug={book.slug}
                    existingRating={userReview?.rating}
                    existingContent={userReview?.content}
                  />
                ) : (
                  <div className="rounded-[20px] border border-divider bg-bg-surface p-6 text-center shadow-sm">
                    <Icon name="star" className="mb-3 text-4xl text-accent" />
                    <h3 className="text-base font-bold text-text-heading">Leave a review</h3>
                    <p className="mt-2 text-sm text-text-muted font-sans">
                      Sign in to rate this resource and share your experience with other readers.
                    </p>
                    <Link
                      href={`/auth/login?callbackUrl=/books/${book.slug}#reviews`}
                      className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-brand text-sm font-bold text-brand-contrast transition hover:bg-brand-hover"
                    >
                      <Icon name="account" className="text-base" />
                      Sign in to review
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}