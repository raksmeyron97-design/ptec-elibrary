/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
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

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getReadingProgress } from "@/app/actions/reading-progress";
import { getBookNote } from "@/app/actions/book-notes";
import { getListsContainingBook } from "@/app/actions/reading-lists";
import { getReviews, getUserReview } from "@/app/actions/reviews";
import { isBookSaved } from "@/app/actions/saved-books";
import { getDownloadCount } from "@/app/actions/download";
import { isSubscribed } from "@/app/actions/subscriptions";
import SubscribeButton from "@/components/ui/books/SubscribeButton";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import JsonLd from "@/components/seo/JsonLd";
import RelatedBooks from "@/components/ui/books/RelatedBooks";
import CiteBook from "@/components/ui/books/CiteBook";
import BookNotes from "@/components/ui/books/BookNotes";
import ReadingListButton from "@/components/ui/books/ReadingListButton";
import ShareButton from "@/components/ui/books/ShareButton";
import BookQuickNav from "@/components/ui/books/BookQuickNav";

// NOTE: User-specific server data (saved status, reading progress, user review)
// is baked into the cache on first render after TTL. Most ISR generations will
// be from anonymous crawlers, so the "no user" state is correct for 99% of hits.
// Move those three fetches to client components if per-user accuracy is needed.
export const revalidate = 3600;

import { SITE_URL } from "@/lib/seo/site";

type BookDetailPageProps = {
  params: Promise<{ slug: string }>;
};

const getBookMeta = unstable_cache(
  async (slug: string) => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("books")
      .select("title, description, cover_url, language, published_at, tags, authors(name)")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();
    return data;
  },
  ["book-meta"],
  { revalidate: 3600, tags: ["books"] }
);

export async function generateMetadata({
  params,
}: BookDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const book = await getBookMeta(slug);

  if (!book) {
    return { title: "Book not found" };
  }

  const desc = book.description
    ? (book.description.length > 157 ? book.description.substring(0, 157) + "..." : book.description)
    : "Read this book on PTEC Library.";

  const authorName = Array.isArray(book.authors)
    ? book.authors.map((a: any) => a.name).join(", ")
    : (book.authors as any)?.name ?? "Unknown Author";

  const canonicalUrl = `${SITE_URL}/books/${slug}`;
  const tags: string[] = Array.isArray(book.tags) ? book.tags : [];

  return {
    title: book.title,
    description: desc,
    keywords: tags.length > 0 ? tags : undefined,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: book.title,
      description: desc,
      type: "book",
      url: canonicalUrl,
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
      title: book.title,
      description: desc,
      images: book.cover_url ? [book.cover_url] : undefined,
    },
  };
}

type BookWithSource = Book & { fromSupabase: boolean; dbId: string | null };

const getBook = unstable_cache(
  async (slug: string): Promise<BookWithSource | null> => {
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
        departments ( name )
      `)
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();

    if (error) {
      console.error("[getBook] Supabase error:", error.message);
    }

    if (data) {
      const [{ data: files }, { data: revs }] = await Promise.all([
        supabase.from("book_files").select("id, format, file_url, file_size_kb").eq("book_id", data.id),
        supabase.from("reviews").select("rating").eq("book_id", data.id),
      ]);

      const mapped = mapRowToBook({ ...data, book_files: files ?? [], reviews: revs ?? [] });
      return {
        ...mapped,
        fromSupabase: true,
        dbId: data.id,
      } as BookWithSource;
    }

    return null;
  },
  ["book-detail"],
  { revalidate: 3600, tags: ["books"] }
);

export default async function BookDetailPage({ params }: BookDetailPageProps) {
  const t = await getTranslations("bookDetail");
  const tPhys = await getTranslations("physical");
  
  const { slug } = await params;
  const book = await getBook(slug);
  if (!book) notFound();

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  const [savedProgress, reviews, userReview, isSaved, downloadCount, copies, listIds, initialNote, isSubDept, isSubCat] = await Promise.all([
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
    book.dbId && user ? getListsContainingBook(book.dbId) : Promise.resolve([]),
    book.dbId && user ? getBookNote(book.dbId) : Promise.resolve(""),
    user && book.department ? isSubscribed("department", book.department) : Promise.resolve(false),
    user && book.category   ? isSubscribed("category",   book.category)   : Promise.resolve(false),
  ]);

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  const showPdfCover = book.fromSupabase && !!book.pdfUrl;
  const resuming = !!(savedProgress && savedProgress.progressPct > 0);

  const fileSrc = book.dbId ? `/api/books/${book.dbId}/file` : book.pdfUrl;

  const bookUrl = `${SITE_URL}/books/${slug}`;
  const bookSchema = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: book.title,
    author: book.author ? {
      "@type": "Person",
      name: book.author,
    } : {
      "@type": "Organization",
      name: "Unknown Author",
    },
    inLanguage: book.language || "en",
    description: book.summary || book.title,
    image: book.coverUrl || `${SITE_URL}/og-image.jpg`,
    url: bookUrl,
    bookFormat: "https://schema.org/EBook",
    isAccessibleForFree: true,
    keywords: book.tags?.length ? book.tags.join(", ") : undefined,
    publisher: {
      "@type": "EducationalOrganization",
      name: "Phnom Penh Teacher Education College",
      url: SITE_URL,
    },
    datePublished: (book as any).publishedAt || undefined,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/OnlineOnly",
    },
    readAction: {
      "@type": "ReadAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: bookUrl,
      },
    },
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
        <BookQuickNav
          hasPdf={book.fromSupabase && !!book.pdfUrl && !!book.dbId}
          hasReviews={!!book.dbId}
          hasCopies={copies.length > 0}
        />
        
        <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-1.5 sm:gap-2 text-[13px] sm:text-[14.5px] font-medium text-text-muted overflow-hidden">
          <Link href="/" className="hover:text-brand transition-colors">{t("home")}</Link>
          <Icon name="chevron-right" className="text-[16px] text-divider" />
          <Link href="/books" className="hover:text-brand transition-colors">{t("books")}</Link>
          <Icon name="chevron-right" className="text-[16px] text-divider" />
          <Link href={`/books?dept=${encodeURIComponent(book.department)}`} className="whitespace-nowrap hover:text-brand transition-colors">
            {book.department}
          </Link>
          <Icon name="chevron-right" className="text-[16px] text-divider" />
          <span className="max-w-[200px] truncate font-semibold text-text-heading sm:max-w-[300px]" title={book.title}>
            {book.title}
          </span>
        </nav>


        {/* ── Hero card ── */}
        <div id="details" className="grid gap-6 sm:gap-10 rounded-[28px] border border-divider bg-bg-surface p-5 sm:p-6 shadow-md md:p-9 lg:grid-cols-[300px_1fr] scroll-mt-24">

          {/* Cover — sticky on desktop */}
          <div className="mx-auto w-full max-w-[220px] sm:max-w-none lg:sticky lg:top-[84px] lg:self-start">
            {showPdfCover ? (
              <PDFCover
                title={book.title}
                coverUrl={book.coverUrl}
                fallbackColor={book.cover}
                label={book.department}
                author={book.author}
              />
            ) : (
              <div className="overflow-hidden rounded-[20px] border border-divider/50"
                   style={{ boxShadow: "0 20px 48px rgba(30,58,138,0.18), 0 8px 16px rgba(0,0,0,0.08)" }}>
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
              {user && book.department && (
                <SubscribeButton
                  filterType="department"
                  filterValue={book.department}
                  displayLabel={book.department}
                  initialSubscribed={isSubDept}
                />
              )}
            </div>

            <h1 className="font-khmer-serif mt-3 sm:mt-5 text-[clamp(24px,4vw,38px)] font-bold leading-[1.2] text-text-heading break-words">
              {book.title}
            </h1>
            <p className="mt-1.5 sm:mt-2 text-[15px] sm:text-[17px] font-medium text-text-muted">{t("byAuthor", { author: book.author })}</p>
            <div className="mt-3 sm:mt-4">
              <RatingStars rating={avgRating || book.rating} />
            </div>

            {resuming && (
              <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 rounded-[14px] border border-divider bg-brand/5 px-4 py-3 sm:py-3.5 min-w-0">
                <div className="min-w-0 flex-1 w-full">
                  <p className="text-[13px] sm:text-[13.5px] font-bold text-brand truncate max-w-full">
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
                  pdfUrl={fileSrc as string}
                  isLoggedIn={!!user}
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
              {book.dbId && (
                <ReadingListButton
                  bookId={book.dbId}
                  isLoggedIn={!!user}
                  initialListIds={listIds}
                />
              )}
              <ShareButton url={`${SITE_URL}/books/${slug}`} />
            </div>

            {book.tags && book.tags.length > 0 && (
              <div className="mt-6">
                <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-muted mb-2.5">
                  {t("tags")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {book.tags.map((tag: string) => (
                    <Link
                      key={tag}
                      href={`/books?tag=${encodeURIComponent(tag)}`}
                      className="text-[12.5px] font-medium text-text-muted bg-paper border border-divider rounded-[7px] px-3 py-1 hover:bg-brand hover:text-brand-contrast hover:border-brand transition-colors"
                    >
                      {tag}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {book.fromSupabase && book.pdfUrl && book.dbId && (
          <div id="reader" className="mt-8 sm:mt-12 mb-8 scroll-mt-24 w-full overflow-hidden">
            <PDFViewer
              title={book.title}
              pdfUrl={fileSrc as string}
              bookId={book.dbId}
              totalPages={book.pages}
              initialProgressPct={savedProgress?.progressPct ?? 0}
              initialMaxProgressPct={savedProgress?.maxProgressPct ?? 0}
              allowDownload={true}
              isLoggedIn={!!user}
            />
          </div>
        )}

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
              <div className="lg:sticky lg:top-6 lg:self-start flex flex-col gap-4">
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
                      {t("signInToReview")}
                    </Link>
                  </div>
                )}
                <CiteBook book={book} />
                {book.dbId && (
                  <BookNotes
                    bookId={book.dbId}
                    initialContent={initialNote}
                    isLoggedIn={!!user}
                    bookSlug={book.slug}
                  />
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
          tags={book.tags ?? []}
        />
      </div>
    </section>
  );
}