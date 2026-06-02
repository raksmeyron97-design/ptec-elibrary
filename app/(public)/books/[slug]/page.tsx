import Link from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/ui/core/Icon";
import PDFViewer from "@/components/ui/reader/PDFViewerClient";
import PDFCover from "@/components/ui/reader/PDFCover";
import BookCover from "@/components/ui/books/BookCover";
import RatingStars from "@/components/ui/reviews/RatingStars";
import ReviewForm from "@/components/ui/reviews/ReviewForm";
import ReviewList from "@/components/ui/reviews/ReviewList";
import SaveButton from "@/components/ui/pwa/SaveButton";
import OfflineSaveButton from "@/components/ui/pwa/OfflineSaveButton";
import DownloadCount from "@/components/ui/pwa/DownloadCount";
import { Badge } from "@/components/ui/core/Badge";
import PhysicalCopiesList from "@/components/ui/books/PhysicalCopiesList";
import { type Book, mapRowToBook } from "@/lib/books";

import { createClient } from "@/lib/supabase/server";
import { getReadingProgress } from "@/app/actions/reading-progress";
import { getReviews, getUserReview } from "@/app/actions/reviews";
import { isBookSaved } from "@/app/actions/saved-books";
import { getDownloadCount } from "@/app/actions/download";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import JsonLd from "@/components/seo/JsonLd";
import RelatedBooks from "@/components/ui/books/RelatedBooks";
import ShareButton from "@/components/ui/books/ShareButton";
import BookQuickNav from "@/components/ui/books/BookQuickNav";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

type BookDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: BookDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: book } = await supabase
    .from("books")
    .select("title, description, cover_url, language, published_at, authors(name)")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (!book) {
    return { title: "Book not found" };
  }

  const desc = book.description
    ? (book.description.length > 157 ? book.description.substring(0, 157) + "..." : book.description)
    : "Read this book on PTEC Library.";

  const authorName = Array.isArray(book.authors) 
    ? book.authors.map((a: any) => a.name).join(", ")
    : (book.authors as any)?.name ?? "Unknown Author";

  return {
    title: book.title,
    description: desc,
    alternates: {
      canonical: `/books/${slug}`,
    },
    openGraph: {
      title: book.title,
      description: desc,
      type: "book",
      url: `/books/${slug}`,
      authors: [authorName],
      images: book.cover_url
        ? [
            {
              url: book.cover_url,
              width: 800,
              height: 1200,
              alt: book.title,
            },
          ]
        : [],
    },
    twitter: {
      card: "summary_large_image",
    },
  };
}

type BookWithSource = Book & { fromSupabase: boolean; dbId: string | null };

async function getBook(slug: string): Promise<BookWithSource | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("books")
    .select(`
      id, title, slug, description,
      cover_color, cover_url,
      language, department, pages, published_at, isbn, rating, tags,
      download_count,
      authors ( name, bio ),
      categories ( name ),
      departments ( name ),
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

  return null;
}

export default async function BookDetailPage({ params }: BookDetailPageProps) {
  const t = await getTranslations("bookDetail");
  const tPhys = await getTranslations("physical");
  
  const { slug } = await params;
  const book = await getBook(slug);
  if (!book) notFound();

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  const [savedProgress, reviews, userReview, isSaved, downloadCount, copies] = await Promise.all([
    book.dbId ? getReadingProgress(book.dbId) : Promise.resolve(null),
    book.dbId ? getReviews(book.dbId) : Promise.resolve([]),
    book.dbId && user ? getUserReview(book.dbId) : Promise.resolve(null),
    book.dbId ? isBookSaved(book.dbId) : Promise.resolve(false),
    book.dbId ? getDownloadCount(book.dbId) : Promise.resolve(0),
    book.dbId
      ? authClient
          .from("catalog_copies")
          .select("*")
          .eq("catalog_book_id", book.dbId)
          .order("created_at", { ascending: true })
          .then((res) => res.data || [])
      : Promise.resolve([]),
  ]);

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  const showPdfCover = book.fromSupabase && !!book.pdfUrl;
  const resuming = !!(savedProgress && savedProgress.progressPct > 0);

  const bookSchema = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    author: {
      "@type": "Person",
      name: book.author,
    },
    inLanguage: book.language,
    description: book.summary,
    image: book.coverUrl,
    url: `${SITE_URL}/books/${slug}`,
    bookFormat: "https://schema.org/EBook",
    publisher: {
      "@type": "Organization",
      name: "Phnom Penh Teacher Education College",
    },
    datePublished: (book as any).publishedAt || undefined,
    ...(avgRating > 0 ? {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: avgRating.toFixed(1),
        reviewCount: reviews.length,
      }
    } : {}),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${SITE_URL}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Books",
        item: `${SITE_URL}/books`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: book.department,
        item: `${SITE_URL}/books?dept=${encodeURIComponent(book.department)}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: book.title,
        item: `${SITE_URL}/books/${slug}`,
      },
    ],
  };

  return (
    <section className="bg-bg-body px-4 py-6 sm:px-6 sm:py-10 md:px-12 min-h-screen">
      <JsonLd data={bookSchema} />
      <JsonLd data={breadcrumbSchema} />
      <div className="mx-auto max-w-[1200px]">
        <BookQuickNav hasPdf={book.fromSupabase && !!book.pdfUrl && !!book.dbId} hasReviews={!!book.dbId} />
        
        <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1.5 sm:gap-2 text-[13px] sm:text-[14.5px] font-medium text-text-muted overflow-hidden">
          <Link href="/" className="hover:text-brand transition-colors">Home</Link>
          <Icon name="chevron-right" className="text-[16px] text-divider" />
          <Link href="/books" className="hover:text-brand transition-colors">Books</Link>
          <Icon name="chevron-right" className="text-[16px] text-divider" />
          <Link href={`/books?dept=${encodeURIComponent(book.department)}`} className="whitespace-nowrap hover:text-brand transition-colors">
            {book.department}
          </Link>
          <Icon name="chevron-right" className="text-[16px] text-divider" />
          <span className="max-w-[200px] truncate font-semibold text-text-heading sm:max-w-[300px]" title={book.title}>
            {book.title}
          </span>
        </nav>

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
        <div id="details" className="grid gap-6 sm:gap-10 rounded-[28px] border border-divider bg-bg-surface p-5 sm:p-6 shadow-md md:p-9 lg:grid-cols-[300px_1fr] scroll-mt-24">

          {/* Cover */}
          <div className="mx-auto w-full max-w-[220px] sm:max-w-none">
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

            <h1 className="font-khmer-serif mt-3 sm:mt-5 text-[clamp(24px,4vw,38px)] font-bold leading-[1.2] text-text-heading">
              {book.title}
            </h1>
            <p className="mt-1.5 sm:mt-2 text-[15px] sm:text-[17px] font-medium text-text-muted">by {book.author}</p>
            <div className="mt-3 sm:mt-4">
              <RatingStars rating={book.rating} />
            </div>

            {resuming && (
              <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 rounded-[14px] border border-divider bg-brand/5 px-4 py-3 sm:py-3.5">
                <div className="min-w-0 flex-1 w-full">
                  <p className="text-[13px] sm:text-[13.5px] font-bold text-brand">
                    {t("continueReading")} — {savedProgress!.progressPct}% {t("complete")}
                  </p>
                  <p className="mt-0.5 text-[11px] sm:text-[12px] text-brand/70 font-medium">
                    {t("lastRead")} {" "}
                    {savedProgress!.lastReadAt
                      ? new Date(savedProgress!.lastReadAt).toLocaleDateString()
                      : t("recently")}
                  </p>
                  {/* Progress bar — visible on all sizes */}
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-brand/10 border border-divider sm:hidden">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${savedProgress!.progressPct}%` }}
                    />
                  </div>
                </div>
                <div className="hidden h-2 w-32 shrink-0 overflow-hidden rounded-full bg-brand/10 sm:block border border-divider">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${savedProgress!.progressPct}%` }}
                  />
                </div>
                <a
                  href="#reader"
                  className="shrink-0 w-full sm:w-auto text-center rounded-[10px] bg-brand px-4 py-2 sm:py-2 text-[13px] font-bold text-brand-contrast transition hover:bg-brand-hover shadow-sm"
                >
                  {t("resume")}
                </a>
              </div>
            )}

            <p className="mt-4 sm:mt-6 font-sans text-[15px] sm:text-[15.5px] leading-7 sm:leading-8 text-text-body">{book.summary}</p>

            <dl className="mt-5 sm:mt-7 grid grid-cols-2 gap-2 sm:gap-3">
              {[
                [t("isbn"),             book.isbn],
                [t("language"),         book.language],
                [t("publicationYear"),  String(book.year)],
                [t("pages"),            String(book.pages)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[13px] bg-paper border border-divider px-3 py-2.5 sm:px-4 sm:py-3.5 min-w-0">
                  <dt className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">{label}</dt>
                  <dd className="mt-0.5 sm:mt-1 text-[13px] sm:text-[15px] font-semibold text-text-heading break-words min-w-0">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 sm:mt-7 flex flex-col gap-3 sm:flex-row">
              {book.pdfUrl ? (
                <a
                  href="#reader"
                  className="inline-flex items-center justify-center gap-2.5 rounded-[14px] bg-brand px-6 py-3.5 text-[15px] font-bold text-brand-contrast transition-all hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-lg hover:shadow-brand/30"
                >
                  <Icon name="pdf" className="text-[20px]" />
                  {resuming ? t("continueReading") : t("readOnline")}
                </a>
              ) : (
                <span className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-paper border border-divider px-6 py-3.5 text-sm font-semibold text-text-muted">
                  {t("pdfNotAvailable")}
                </span>
              )}
              {book.pdfUrl && (
                <OfflineSaveButton 
                  bookId={book.dbId || book.slug} 
                  bookSlug={book.slug}
                  title={book.title}
                  author={book.author}
                  coverUrl={book.coverUrl || null}
                  coverColor={book.cover}
                  pdfUrl={book.pdfUrl}
                />
              )}
              {book.dbId && (
                <SaveButton
                  bookId={book.dbId}
                  bookSlug={book.slug}
                  initialSaved={isSaved}
                  isLoggedIn={!!user}
                />
              )}
              <ShareButton url={`${SITE_URL}/books/${slug}`} />
            </div>
          </div>
        </div>

        {/* Physical Copies */}
        <PhysicalCopiesList copies={copies as any} />

        {/* Reviews */}
        {book.dbId && (
          <div id="reviews" className="mt-8 sm:mt-12 scroll-mt-24">
            <div className="mb-5 sm:mb-6 flex items-center justify-between">
              <h2 className="font-khmer-serif text-[22px] sm:text-[28px] font-bold text-text-heading">
                {t("readerReviews")}
                {reviews.length > 0 && (
                  <span className="ml-2 sm:ml-2.5 text-sm sm:text-base font-semibold text-text-muted">({reviews.length})</span>
                )}
              </h2>
              {reviews.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-accent stroke-accent" strokeWidth={1}>
                    <path d="m12 2 3 6.4 7 .8-5.2 4.8 1.4 6.9L12 17.4 5.8 21l1.4-6.9L2 9.2l7-.8L12 2Z" />
                  </svg>
                  <span className="text-sm font-bold text-text-heading">{avgRating.toFixed(1)}</span>
                  <span className="text-sm text-text-muted">{t("average")}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-6 lg:grid lg:grid-cols-[1fr_360px]">
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
                    <h3 className="text-base font-bold text-text-heading">{t("leaveAReview")}</h3>
                    <p className="mt-2 text-sm text-text-muted font-sans">
                      {t("signInToReview")}
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

        {/* Related Books */}
        <RelatedBooks 
          currentSlug={book.slug} 
          department={book.department} 
          category={book.category} 
        />
      </div>
    </section>
  );
}