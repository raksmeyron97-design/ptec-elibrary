/* eslint-disable @typescript-eslint/no-explicit-any */
import { Suspense, cache } from "react";
import { Link } from "@/i18n/navigation";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import Icon from "@/components/ui/core/Icon";
import PDFReaderLauncher from "@/components/ui/reader/PDFReaderLauncher";
import BookViewPing from "@/components/ui/books/BookViewPing";
import PDFCover from "@/components/ui/reader/PDFCover";
import BookCover from "@/components/ui/books/BookCover";
import RatingStars from "@/components/ui/reviews/RatingStars";
import ReviewForm from "@/components/ui/reviews/ReviewForm";
import ReviewList from "@/components/ui/reviews/ReviewList";
import SaveButton from "@/components/ui/pwa/SaveButton";
import OfflineSaveButton from "@/components/ui/pwa/OfflineSaveButton";
import DownloadCount from "@/components/ui/pwa/DownloadCount";
import { Badge } from "@/components/ui/core/Badge";
import { VerifiedBadge, LicenseBadge } from "@/components/ui/trust/TrustBadges";
import PhysicalCopiesList from "@/components/ui/books/PhysicalCopiesList";
import { type Book, mapRowToBook } from "@/lib/books";
import { decodeSlugParam } from "@/lib/slug";

import { createServiceClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";
import { getReadingProgress } from "@/app/actions/reading-progress";
import { getBookNote } from "@/app/actions/book-notes";
import { getListsContainingBook } from "@/app/actions/reading-lists";
import { getReviews, getUserReview } from "@/app/actions/reviews";
import { isBookSaved } from "@/app/actions/saved-books";
import { isSubscribed } from "@/app/actions/subscriptions";
import SubscribeButton from "@/components/ui/books/SubscribeButton";
import { getTranslations, getLocale } from "next-intl/server";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import JsonLd from "@/components/seo/JsonLd";
import { buildBookMetadata, bookJsonLd, type BookSeoInput } from "@/lib/seo/book-seo";
import RelatedBooks from "@/components/ui/books/RelatedBooks";
import CiteBook from "@/components/ui/books/CiteBook";
import BookNotes from "@/components/ui/books/BookNotes";
import ReadingListButton from "@/components/ui/books/ReadingListButton";
import ShareButton from "@/components/ui/books/ShareButton";
import BookQuickNav from "@/components/ui/books/BookQuickNav";
import { breadcrumbSchema } from "@/lib/seo/schema";

// The public book shell (title, cover, description, metadata) is served from
// unstable_cache (tag: "books") and renders immediately. User-specific data
// (saved status, reading progress, reviews, notes) is fetched inside
// Suspense-wrapped async components below and streams in after the shell —
// nothing personal is ever baked into a shared cache.

import { SITE_URL } from "@/lib/seo/site";
import { bookScholarMeta } from "@/lib/seo/citation";
import { getOrgIdentity, getSiteConfig } from "@/lib/system-settings/config";


type BookDetailPageProps = {
  params: Promise<{ slug: string; locale: string }>;
};

/** Verified author names only — an empty array when the author is unknown.
 *  Never fabricates an "Unknown Author" entity. */
function authorNamesFromRelation(authors: any): string[] {
  const authorRows = Array.isArray(authors) ? authors : [authors];
  return authorRows.flatMap((author) => {
    const name = String(author?.name ?? "").trim();
    return name && name !== "Unknown" && name !== "Unknown Author" ? [name] : [];
  });
}

const getBookMeta = unstable_cache(
  async (slug: string) => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("books")
      .select("id, title, description, cover_url, language, published_at, isbn, publisher, department, tags, authors(name), categories(name), departments(name)")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();
    return data;
  },
  ["book-meta-v2"],
  { revalidate: 3600, tags: ["books"] }
);



export async function generateMetadata({
  params,
}: BookDetailPageProps): Promise<Metadata> {
  const { slug: rawSlug, locale } = await params;
  // generateMetadata receives decoded params while the page body gets them
  // encoded — decodeSlugParam is idempotent, so normalize in both places.
  const slug = decodeSlugParam(rawSlug);
  const book = await getBookMeta(slug);

  if (!book) {
    return { title: "Book not found", robots: { index: false } };
  }

  const authorNames = authorNamesFromRelation(book.authors);
  const seoInput: BookSeoInput = {
    slug,
    title: book.title,
    description: book.description,
    coverUrl: book.cover_url,
    language: book.language,
    publisher: book.publisher,
    isbn: book.isbn,
    publishedAt: book.published_at,
    authors: authorNames,
    department: (book.departments as any)?.name || book.department,
    category: (book.categories as any)?.name,
    tags: Array.isArray(book.tags) ? book.tags : [],
  };

  return {
    ...buildBookMetadata(seoInput, locale, await getOrgIdentity()),
    other: {
      // Google Scholar citation_* meta tags — see lib/seo/citation.ts.
      // citation_publisher / dc.publisher only when the record names a real
      // publisher; PTEC is the providing library, not the publisher.
      ...bookScholarMeta(book, authorNames),
      "dc.type": "Book",
      ...(book.publisher ? { "dc.publisher": book.publisher } : {}),
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
        language, department, pages, published_at, isbn, publisher, rating, tags,
        download_count, license, verified_at,
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

// Per-request memoization: several streamed sections below need the current
// user / reading progress. getSessionUser (lib/auth/session) is shared with
// the layout/navbar so the whole request makes one auth round-trip.
const getProgressOnce = cache((bookId: string) => getReadingProgress(bookId));

// Physical copies are public, admin-managed data — cache with the book shell.
const getCopies = unstable_cache(
  async (bookId: string) => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("catalog_copies")
      .select("*")
      .eq("catalog_book_id", bookId)
      .order("created_at", { ascending: true });
    return data ?? [];
  },
  ["book-copies"],
  { revalidate: 300, tags: ["books"] }
);

export default async function BookDetailPage({ params }: BookDetailPageProps) {
  const [{ slug: rawSlug, locale }, t] = await Promise.all([
    params,
    getTranslations("bookDetail"),
  ]);
  const slug = decodeSlugParam(rawSlug);
  const book = await getBook(slug);
  if (!book) notFound();

  // Both fetches above/below are unstable_cache-backed — the shell renders
  // without touching cookies or per-user tables.
  const copies = book.dbId ? await getCopies(book.dbId) : [];

  // getBook embeds review ratings; mapRowToBook already computed the real
  // average and count from them.
  const reviewCount: number = (book as any).reviewCount ?? 0;
  const avgRating = reviewCount > 0 ? book.rating : 0;

  const showPdfCover = book.fromSupabase && !!book.pdfUrl;

  const fileSrc = book.dbId ? `/api/books/${book.dbId}/file` : book.pdfUrl;

  // Locale-correct canonical + breadcrumb URLs (Khmer under /km) so the
  // structured data matches the visible breadcrumbs and the page's canonical.
  const localePrefix = locale === "km" ? "/km" : "";
  const bookAuthors =
    book.author && book.author !== "Unknown" ? [book.author] : [];
  const bookSchema = bookJsonLd(
    {
      slug,
      title: book.title,
      description: book.summary,
      coverUrl: book.coverUrl,
      language: book.language,
      publisher: book.publisher,
      isbn: book.isbn,
      publishedAt: book.uploadedAt ?? null,
      pages: book.pages,
      authors: bookAuthors,
      department: book.department,
      category: book.category,
      tags: book.tags,
    },
    locale,
    avgRating > 0 ? { ratingValue: avgRating.toFixed(1), reviewCount } : null,
    await getOrgIdentity(),
  );
  const bookBreadcrumbSchema = breadcrumbSchema([
    { name: t("home"), path: `${localePrefix}/home` },
    { name: t("books"), path: `${localePrefix}/books` },
    { name: book.department, path: `${localePrefix}/books?dept=${encodeURIComponent(book.department)}` },
    { name: book.title },
  ]);

  return (
    <article className="bg-bg-body px-4 py-6 sm:px-6 sm:py-10 md:px-12 min-h-screen">
      <JsonLd data={bookSchema} />
      <JsonLd data={bookBreadcrumbSchema} />
      {book.dbId && <BookViewPing bookId={book.dbId} />}
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
              <DownloadCount count={book.downloadCount ?? 0} />
              {book.department && (
                <Suspense fallback={null}>
                  <HeroSubscribeBadge department={book.department} />
                </Suspense>
              )}
              <VerifiedBadge verifiedAt={book.verifiedAt} />
              <LicenseBadge license={book.license} />
            </div>

            <h1 className="font-khmer-serif mt-3 sm:mt-5 text-[clamp(24px,4vw,38px)] font-bold leading-[1.2] text-text-heading break-words">
              {book.title}
            </h1>
            <p className="mt-1.5 sm:mt-2 text-[15px] sm:text-[17px] font-medium text-text-muted">{t("byAuthor", { author: book.author })}</p>
            {/* A rating row only exists once someone has actually rated the
                book — "★★★★★ 0.0" is noise, not information. */}
            {reviewCount > 0 && (
              <div className="mt-3 sm:mt-4">
                <RatingStars rating={avgRating} />
              </div>
            )}

            {book.dbId && (
              <Suspense fallback={null}>
                <ResumeBanner bookId={book.dbId} slug={slug} />
              </Suspense>
            )}

            <section aria-labelledby="book-summary-heading" className="mt-4 sm:mt-6">
              <h2
                id="book-summary-heading"
                className="text-[12px] font-bold uppercase tracking-[0.12em] text-text-muted"
              >
                {t("aboutHeading")}
              </h2>
              <p className="mt-2 font-sans text-[15px] leading-7 text-text-body sm:text-[15.5px] sm:leading-8">
                {book.summary || t("defaultSummary", { title: book.title })}
              </p>
            </section>

            {/* Metadata facts — suppress unknown/implausible values instead of
                rendering "N/A", "Pages: 1", or a future publication year. */}
            <dl className="mt-5 sm:mt-7 grid grid-cols-2 gap-2 sm:gap-3">
              {([
                [t("isbn"),            book.isbn && book.isbn !== "N/A" ? book.isbn : null],
                [t("language"),        book.language || null],
                [t("publicationYear"), book.year && book.year <= new Date().getFullYear() + 1 ? String(book.year) : null],
                [t("pages"),           book.pages && book.pages > 1 ? String(book.pages) : null],
              ] as [string, string | null][])
                .filter(([, value]) => value)
                .map(([label, value]) => (
                <div key={label} className="rounded-[13px] bg-paper border border-divider px-3 py-2.5 sm:px-4 sm:py-3.5 min-w-0">
                  <dt className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.06em] text-text-muted">{label}</dt>
                  <dd className="mt-0.5 sm:mt-1 text-[13px] sm:text-[15px] font-semibold text-text-heading break-words min-w-0">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 sm:mt-7 flex flex-col gap-3 sm:flex-row">
              <Suspense
                fallback={
                  <>
                    <span className="inline-flex h-[52px] w-full sm:w-44 animate-pulse rounded-[14px] bg-paper" aria-hidden />
                    <span className="hidden sm:inline-flex h-[52px] w-32 animate-pulse rounded-[14px] bg-paper" aria-hidden />
                  </>
                }
              >
                <ActionButtons book={book} fileSrc={fileSrc as string | null} slug={slug} />
              </Suspense>
            </div>

            {book.tags && book.tags.length > 0 && (
              <div className="mt-6">
                <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-muted mb-2.5">
                  {t("tags")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {/* Tags route to /search (which matches title/description) —
                      /books has no tag filter, so linking there was a silent
                      dead end that returned the full unfiltered list. */}
                  {book.tags.map((tag: string) => (
                    <Link
                      key={tag}
                      href={`/search?q=${encodeURIComponent(tag)}`}
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
            {/* Long reading sessions get a dedicated, chrome-light route. */}
            <div className="mb-2.5 flex justify-end">
              <Link
                href={`/books/${slug}/read`}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-brand transition-colors hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                <Icon name="external-link" className="text-[14px]" />
                {t("openFullReader")}
              </Link>
            </div>
            <Suspense
              fallback={
                <div className="aspect-[3/4] w-full animate-pulse rounded-[20px] bg-paper sm:aspect-video" aria-hidden />
              }
            >
              <ReaderSection book={book} fileSrc={fileSrc as string} />
            </Suspense>
          </div>
        )}

        {/* Physical Copies */}
        <PhysicalCopiesList copies={copies as any} />

        {/* Reviews — streamed (needs per-user data: own review, notes) */}
        {book.dbId && (
          <Suspense
            fallback={
              <div className="mt-8 sm:mt-12">
                <div className="mb-6 h-8 w-56 animate-pulse rounded-lg bg-paper" aria-hidden />
                <div className="h-48 animate-pulse rounded-[20px] bg-paper" aria-hidden />
              </div>
            }
          >
            <ReviewsSection book={book} />
          </Suspense>
        )}

        {/* Related Books — self-fetching; stream after the main content */}
        <Suspense fallback={null}>
          <RelatedBooks
            currentSlug={book.slug}
            department={book.department}
            category={book.category}
            tags={book.tags ?? []}
          />
        </Suspense>
      </div>
    </article>
  );
}

// ── Streamed sections ─────────────────────────────────────────────────────────
// Each of these is an async Server Component rendered inside <Suspense>. They
// are the only place this route reads cookies/user state, so the shell above
// renders (and caches) independently of them.

async function HeroSubscribeBadge({ department }: { department: string }) {
  const user = await getSessionUser();
  if (!user) return null;
  const subscribed = await isSubscribed("department", department);
  return (
    <SubscribeButton
      filterType="department"
      filterValue={department}
      displayLabel={department}
      initialSubscribed={subscribed}
    />
  );
}

async function ResumeBanner({ bookId, slug }: { bookId: string; slug: string }) {
  const savedProgress = await getProgressOnce(bookId);
  if (!savedProgress || savedProgress.progressPct <= 0) return null;
  const t = await getTranslations("bookDetail");

  return (
    <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 rounded-[14px] border border-divider bg-brand/5 px-4 py-3 sm:py-3.5 min-w-0">
      <div className="min-w-0 flex-1 w-full">
        <p className="text-[13px] sm:text-[13.5px] font-bold text-brand truncate max-w-full">
          {t("continueReading")} — {savedProgress.progressPct}% {t("complete")}
        </p>
        <p className="mt-0.5 text-[11px] sm:text-[12px] text-brand/70 font-medium">
          {t("lastRead")} {" "}
          {savedProgress.lastReadAt
            ? new Date(savedProgress.lastReadAt).toLocaleDateString()
            : t("recently")}
        </p>
        {/* Progress bar — visible on all sizes */}
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-brand/10 border border-divider sm:hidden">
          <div
            className="h-full rounded-full bg-brand"
            style={{ width: `${savedProgress.progressPct}%` }}
          />
        </div>
      </div>
      <div className="hidden h-2 w-32 shrink-0 overflow-hidden rounded-full bg-brand/10 sm:block border border-divider">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${savedProgress.progressPct}%` }}
        />
      </div>
      <Link
        href={`/books/${slug}/read`}
        className="shrink-0 w-full sm:w-auto text-center rounded-[10px] bg-brand px-4 py-2 sm:py-2 text-[13px] font-bold text-brand-contrast transition hover:bg-brand-hover shadow-sm"
      >
        {t("resume")}
      </Link>
    </div>
  );
}

async function ActionButtons({
  book,
  fileSrc,
  slug,
}: {
  book: BookWithSource;
  fileSrc: string | null;
  slug: string;
}) {
  const t = await getTranslations("bookDetail");
  const user = await getSessionUser();

  const [savedProgress, isSaved, listIds] = await Promise.all([
    book.dbId ? getProgressOnce(book.dbId) : Promise.resolve(null),
    book.dbId ? isBookSaved(book.dbId) : Promise.resolve(false),
    book.dbId && user ? getListsContainingBook(book.dbId) : Promise.resolve([]),
  ]);
  const resuming = !!(savedProgress && savedProgress.progressPct > 0);

  return (
    <>
      {book.pdfUrl ? (
        <Link
          href={`/books/${slug}/read`}
          className="inline-flex items-center justify-center gap-2.5 rounded-[14px] bg-brand px-6 py-3.5 text-[15px] font-bold text-brand-contrast transition-all hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-lg hover:shadow-brand/30"
        >
          <Icon name="pdf" className="text-[20px]" />
          {resuming ? t("continueReading") : t("readOnline")}
        </Link>
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
    </>
  );
}

async function ReaderSection({
  book,
  fileSrc,
}: {
  book: BookWithSource;
  fileSrc: string;
}) {
  const [user, savedProgress] = await Promise.all([
    getSessionUser(),
    getProgressOnce(book.dbId!),
  ]);

  return (
    <PDFReaderLauncher
      title={book.title}
      pdfUrl={fileSrc}
      bookId={book.dbId!}
      totalPages={book.pages}
      initialProgressPct={savedProgress?.progressPct ?? 0}
      initialMaxProgressPct={savedProgress?.maxProgressPct ?? 0}
      allowDownload={true}
      isLoggedIn={!!user}
      reportEmail={(await getSiteConfig()).email}
      fullReaderHref={`/books/${book.slug}/read`}
    />
  );
}

async function ReviewsSection({ book }: { book: BookWithSource }) {
  const t = await getTranslations("bookDetail");
  const locale = await getLocale();
  const user = await getSessionUser();

  const [reviews, userReview, initialNote] = await Promise.all([
    getReviews(book.dbId!),
    user ? getUserReview(book.dbId!) : Promise.resolve(null),
    user ? getBookNote(book.dbId!) : Promise.resolve(""),
  ]);

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  return (
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
              bookId={book.dbId!}
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
              <NextLink
                href={`/auth/login?callbackUrl=${locale === "km" ? "/km" : ""}/books/${book.slug}#reviews`}
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-brand text-sm font-bold text-brand-contrast transition hover:bg-brand-hover"
              >
                <Icon name="account" className="text-base" />
                {t("signInToReview")}
              </NextLink>
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
  );
}
