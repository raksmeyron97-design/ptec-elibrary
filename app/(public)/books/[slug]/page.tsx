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
    <section className="bg-gradient-to-b from-[#F6F6F4] to-[#FBFBFD] px-6 py-10 md:px-12">
      <div className="mx-auto max-w-[1200px]">
        <Link
          href="/books"
          className="mb-6 inline-flex items-center gap-2 text-[14.5px] font-semibold text-[#0C7C8A] transition-colors hover:text-[#075863]"
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
        <div className="grid gap-10 rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_4px_14px_rgba(20,22,27,0.06)] md:p-9 lg:grid-cols-[300px_1fr]">

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
              <div className="overflow-hidden rounded-2xl shadow-[0_24px_60px_-18px_rgba(11,42,48,0.28)]">
                <div className="aspect-[3/4] w-full">
                  <BookCover title={book.title} label={book.department} author={book.author} variant="detail" />
                </div>
              </div>
            )}
          </div>

          {/* Details */}
          <div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-[#E4F4F5] px-[13px] py-1.5 text-[12.5px] font-semibold text-[#075863]">
                {book.department}
              </span>
              <span className="rounded-full bg-[#F6F6F4] px-[13px] py-1.5 text-[12.5px] font-semibold text-slate-600">
                {book.category}
              </span>
              <span className="rounded-full bg-[#E7F6EC] px-[13px] py-1.5 text-[12.5px] font-semibold text-[#1B7A3E]">
                ● {book.availability}
              </span>
              <DownloadCount count={downloadCount} />
            </div>

            <h1 className="serif mt-5 text-[clamp(28px,4vw,38px)] font-medium leading-[1.1] text-slate-950">
              {book.title}
            </h1>
            <p className="mt-2 text-[17px] text-slate-500">by {book.author}</p>
            <div className="mt-4">
              <RatingStars rating={book.rating} />
            </div>

            {resuming && (
              <div className="mt-6 flex items-center gap-4 rounded-[14px] border border-[#cdebec] bg-[#E4F4F5] px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-bold text-[#075863]">
                    Continue reading — {savedProgress!.progressPct}% complete
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#0C7C8A]">
                    Last read{" "}
                    {savedProgress!.lastReadAt
                      ? new Date(savedProgress!.lastReadAt).toLocaleDateString()
                      : "recently"}
                  </p>
                </div>
                <div className="hidden h-2 w-32 shrink-0 overflow-hidden rounded-full bg-[#cfe9ea] sm:block">
                  <div
                    className="h-full rounded-full bg-[#0C7C8A]"
                    style={{ width: `${savedProgress!.progressPct}%` }}
                  />
                </div>
                <a
                  href="#reader"
                  className="shrink-0 rounded-[10px] bg-[#0C7C8A] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#075863]"
                >
                  Resume
                </a>
              </div>
            )}

            <p className="mt-6 text-[15.5px] leading-8 text-slate-600">{book.summary}</p>

            <dl className="mt-7 grid gap-3 sm:grid-cols-2">
              {[
                ["ISBN",             book.isbn],
                ["Language",         book.language],
                ["Publication year", String(book.year)],
                ["Pages",            String(book.pages)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[13px] bg-[#F6F6F4] px-4 py-3.5">
                  <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-400">{label}</dt>
                  <dd className="mt-1 text-[15px] font-semibold text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              {book.pdfUrl ? (
                <a
                  href="#reader"
                  className="inline-flex items-center justify-center gap-2.5 rounded-[14px] bg-[#14161B] px-6 py-3.5 text-[15px] font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#0C7C8A] hover:shadow-[0_12px_28px_-10px_rgba(12,124,138,0.6)]"
                >
                  <Icon name="pdf" className="text-[20px]" />
                  {resuming ? "Continue reading" : "Read online"}
                </a>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-[14px] bg-slate-100 px-6 py-3.5 text-sm font-semibold text-slate-500">
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
              <h2 className="serif text-[28px] font-medium text-slate-950">
                Reader Reviews
                {reviews.length > 0 && (
                  <span className="ml-2.5 text-base font-semibold text-slate-400">({reviews.length})</span>
                )}
              </h2>
              {reviews.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-amber-400 stroke-amber-400" strokeWidth={1}>
                    <path d="m12 2 3 6.4 7 .8-5.2 4.8 1.4 6.9L12 17.4 5.8 21l1.4-6.9L2 9.2l7-.8L12 2Z" />
                  </svg>
                  <span className="text-sm font-bold text-slate-700">{avgRating.toFixed(1)}</span>
                  <span className="text-sm text-slate-400">average</span>
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
                  <div className="rounded-[20px] border border-slate-200 bg-white p-6 text-center shadow-[0_1px_2px_rgba(20,22,27,0.04)]">
                    <Icon name="star" className="mb-3 text-4xl text-amber-300" />
                    <h3 className="text-base font-bold text-slate-900">Leave a review</h3>
                    <p className="mt-2 text-sm text-slate-500">
                      Sign in to rate this resource and share your experience with other readers.
                    </p>
                    <Link
                      href={`/auth/login?callbackUrl=/books/${book.slug}#reviews`}
                      className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[#14161B] text-sm font-semibold text-white transition hover:bg-[#0C7C8A]"
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