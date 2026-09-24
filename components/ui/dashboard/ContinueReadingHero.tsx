// components/ui/dashboard/ContinueReadingHero.tsx
// PRIMARY section — the single strongest call to action on the page. Shows
// the most-recently-opened in-progress book with its REAL progress_pct and
// last_read_at (never a fabricated percentage). Falls back to an onboarding
// state when the user has no reading_progress rows at all.
//
// "Continue" opens the READER at the exact page (§30), not the book's detail
// page. It used to link to /books/<slug>, which asked a reader who had said
// "continue" to find and press a second button, and then relied on whatever
// resume the viewer could reconstruct. With `last_page` (0141) the exact page
// is known server-side, so the link carries it as `?page=N` — which the read
// route already accepts, and which the viewer treats as a destination rather
// than a guess. Without a stored page the link is the plain reader URL and the
// viewer resumes exactly as it did before.
//
// "Page N of M" is printed only when BOTH numbers came from the reader:
// `last_page_count` is the page count of the document the page was measured
// in. The catalogue's `books.pages` is deliberately not used as the "of M" —
// it is typed-in metadata and disagrees with real PDFs often enough that it
// would put a resume point past the end of the book.
//
// Everything else the reader has in flight — the next few books and any
// learning path — sits in the "Also in progress" strip at the bottom, so all
// "continue" work is one card rather than a hero here and a sidebar widget
// three screens away.
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { BookOpen, Library, GraduationCap, ChevronRight, Compass, MessageSquarePlus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import SmartBookCover from "@/components/ui/books/SmartBookCover";
import CoverThumb from "@/components/ui/dashboard/CoverThumb";
import { formatRelativeTime } from "@/lib/dashboard/relative-time";
import type { InProgressPath } from "@/app/actions/learning-paths";
import { CARD, BUTTON_PRIMARY, BUTTON_SECONDARY, REQUEST_A_BOOK_HREF } from "@/components/ui/dashboard/primitives";

export type ContinueReadingBook = {
  slug: string;
  title: string;
  author: string;
  category: string | null;
  coverUrl: string | null;
  progressPct: number;
  lastReadAt: string | null;
  /** Exact page from `reading_progress.last_page` (0141); null when unknown. */
  lastPage?: number | null;
  /** Page count of the document `lastPage` was measured in (0141). */
  lastPageCount?: number | null;
};

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Page 1 needs no parameter — the viewer starts there anyway. */
function resumePage(book: ContinueReadingBook): number | null {
  return typeof book.lastPage === "number" && book.lastPage > 1 ? book.lastPage : null;
}

function readerHref(book: ContinueReadingBook): string {
  const page = resumePage(book);
  return `/books/${book.slug}/read${page ? `?page=${page}` : ""}`;
}

function ProgressBar({ pct, label, className = "h-2" }: { pct: number; label: string; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-full bg-paper dark:bg-paper/70 ${className}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default async function ContinueReadingHero({
  book, others = [], paths = [],
}: {
  book: ContinueReadingBook | null;
  /** The next in-progress books after `book`, newest first. */
  others?: ContinueReadingBook[];
  paths?: InProgressPath[];
}) {
  const t = await getTranslations("dashboard");
  const locale = await getLocale();

  const alsoInProgress = (others.length > 0 || paths.length > 0) && (
    <div className="mt-auto border-t border-divider bg-paper/50 px-5 py-4 dark:bg-paper/25 sm:px-6">
      <h3 className="mb-2.5 text-[12px] font-semibold text-text-muted">{t("alsoInProgress")}</h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {others.map((b) => {
          const pct = clampPct(b.progressPct);
          return (
            <li key={b.slug}>
              <Link
                href={readerHref(b)}
                className="focus-field group flex items-center gap-3 rounded-xl border border-divider bg-bg-surface p-2.5 pr-3 transition-colors hover:border-brand/30"
              >
                <CoverThumb coverUrl={b.coverUrl} title={b.title} author={b.author} category={b.category} seed={b.slug} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-text-heading group-hover:text-brand" dir="auto">
                    {b.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-text-muted">
                    {t("progressPct", { pct })}
                    {b.lastReadAt && <> · {formatRelativeTime(b.lastReadAt, t)}</>}
                  </span>
                  <ProgressBar pct={pct} label={t("progressLabel")} className="mt-1.5 h-1" />
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand motion-reduce:transition-none rtl:rotate-180" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
        {paths.map((p) => {
          const pct = p.totalSteps > 0 ? clampPct((p.completedSteps / p.totalSteps) * 100) : 0;
          const title = locale === "km" && p.title_km ? p.title_km : p.title;
          return (
            <li key={p.id}>
              <Link
                href={`/paths/${p.slug}`}
                aria-label={t("pathProgress", { title, pct })}
                className="focus-field group flex items-center gap-3 rounded-xl border border-divider bg-bg-surface p-2.5 pr-3 transition-colors hover:border-brand/30"
              >
                <span className="relative flex aspect-[2/3] w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-brand-soft text-brand ring-1 ring-divider" aria-hidden="true">
                  {p.cover_url
                    ? <Image src={p.cover_url} alt="" fill sizes="36px" className="object-cover" />
                    : <GraduationCap className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-text-heading group-hover:text-brand" dir="auto">
                    {title}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-text-muted">
                    {t("learningPath")} · {t("pathSteps", { done: p.completedSteps, total: p.totalSteps })}
                  </span>
                  <ProgressBar pct={pct} label={t("progressLabel")} className="mt-1.5 h-1" />
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand motion-reduce:transition-none rtl:rotate-180" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );

  // With one book in flight there is nothing "also in progress", and beside
  // the taller "Your reading" card the hero would be a tall box with a gap
  // under its buttons. That space gets a job instead: where to go next.
  const nextSteps = (
    <div className="mt-auto border-t border-divider bg-paper/50 px-5 py-4 dark:bg-paper/25 sm:px-6">
      <h3 className="mb-2.5 text-[12px] font-semibold text-text-muted">{t("findNextRead")}</h3>
      <ul className="grid grid-cols-3 gap-2">
        {[
          { href: "/books", icon: Library, label: t("quickBrowse") },
          { href: "/paths", icon: Compass, label: t("quickPaths") },
          { href: REQUEST_A_BOOK_HREF, icon: MessageSquarePlus, label: t("quickRequest") },
        ].map(({ href, icon: Icon, label }) => (
          <li key={href}>
            <Link
              href={href}
              className="focus-field group flex h-full flex-col items-start gap-2 rounded-xl border border-divider bg-bg-surface p-3 text-[12.5px] font-semibold leading-snug text-text-body transition-colors hover:border-brand/30 hover:text-brand sm:flex-row sm:items-center sm:text-[13px]"
            >
              <Icon className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              <span className="min-w-0 flex-1">{label}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand motion-reduce:transition-none max-sm:hidden rtl:rotate-180" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );

  if (!book) {
    return (
      <section aria-labelledby="continue-heading" className={`${CARD} flex h-full flex-col overflow-hidden`}>
        <div className="flex flex-1 flex-col items-start justify-center p-6 sm:p-8">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-brand-soft text-brand" aria-hidden="true">
            <GraduationCap className="h-6 w-6" />
          </span>
          <h2 id="continue-heading" className="font-khmer-serif text-[20px] font-bold leading-snug text-text-heading sm:text-[22px]">
            {t("startJourneyTitle")}
          </h2>
          <p className="mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-text-muted">{t("startJourneyDesc")}</p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link href="/books" className={BUTTON_PRIMARY}>
              <Library className="h-4 w-4" aria-hidden="true" />
              {t("browseCatalogue")}
            </Link>
            <Link href="/theses" className={BUTTON_SECONDARY}>
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              {t("exploreTheses")}
            </Link>
          </div>
        </div>
        {alsoInProgress}
      </section>
    );
  }

  const pct = clampPct(book.progressPct);
  const page = resumePage(book);
  const total = typeof book.lastPageCount === "number" && book.lastPageCount > 0 ? book.lastPageCount : null;
  const pageLabel = page && total && page <= total
    ? t("pageOfTotal", { page, total })
    : page
      ? t("pageOnly", { page })
      : t("progressLabel");

  return (
    <section aria-labelledby="continue-heading" className={`${CARD} flex h-full flex-col overflow-hidden`}>
      {/* flex-1 + items-center: beside a taller "Your reading" card, the
          spare height is shared above and below instead of pooling under
          the buttons when there is no "Also in progress" strip. */}
      <div className="flex flex-1 items-center gap-4 p-5 sm:gap-6 sm:p-6">
        <Link
          href={`/books/${book.slug}`}
          tabIndex={-1}
          aria-hidden="true"
          className="relative h-[138px] w-[92px] shrink-0 overflow-hidden rounded-lg shadow-md ring-1 ring-divider sm:h-[186px] sm:w-[124px]"
        >
          {/* Drawn at 150px and scaled to 92px / 124px (see CoverThumb): the
              generated card design clips its title below ~110px wide. */}
          <span className="absolute left-0 top-0 h-[225px] w-[150px] origin-top-left scale-[0.6134] sm:scale-[0.8267]">
            <SmartBookCover
              coverUrl={book.coverUrl}
              title={book.title}
              author={book.author}
              category={book.category}
              seed={book.slug}
              sizes="150px"
              priority
            />
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id="continue-heading" className="text-[11.5px] font-bold uppercase tracking-wider text-brand">
            {t("continueReading")}
          </h2>
          <h3 className="mt-1.5 font-khmer-serif text-[17px] font-bold leading-snug text-text-heading line-clamp-2 sm:text-[22px]" dir="auto">
            <Link href={`/books/${book.slug}`} className="focus-field rounded-sm transition-colors hover:text-brand">
              {book.title}
            </Link>
          </h3>
          <p className="mt-1 truncate text-[13px] text-text-muted" dir="auto">
            {book.author}
            {book.category && <span className="max-sm:hidden"> · {book.category}</span>}
          </p>
          {book.lastReadAt && (
            <p className="mt-0.5 text-[12px] text-text-muted">
              {t("lastOpened", { time: formatRelativeTime(book.lastReadAt, t) })}
            </p>
          )}

          <div className="mt-auto pt-4">
            <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="truncate font-medium text-text-body">{pageLabel}</span>
              <span className="shrink-0 font-bold tabular-nums text-brand">{t("progressPct", { pct })}</span>
            </div>
            <ProgressBar pct={pct} label={t("progressLabel")} className="mt-1.5 h-2" />

            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={readerHref(book)} className={`${BUTTON_PRIMARY} max-sm:flex-1`}>
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                {t("continueButton")}
              </Link>
              <Link href={`/books/${book.slug}`} className={`${BUTTON_SECONDARY} max-sm:hidden`}>
                {t("bookDetails")}
              </Link>
            </div>
          </div>
        </div>
      </div>
      {alsoInProgress || nextSteps}
    </section>
  );
}
