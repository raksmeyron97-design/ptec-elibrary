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
import { Link } from "@/i18n/navigation";
import { BookOpen, Library, GraduationCap } from "lucide-react";
import { getTranslations } from "next-intl/server";
import SmartBookCover from "@/components/ui/books/SmartBookCover";
import { formatRelativeTime } from "@/lib/dashboard/relative-time";

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
};

export default async function ContinueReadingHero({ book }: { book: ContinueReadingBook | null }) {
  const t = await getTranslations("dashboard");

  if (!book) {
    return (
      <section aria-label={t("continueReading")} className="rounded-2xl border border-divider bg-bg-surface p-6 sm:p-8">
        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/8 text-brand" aria-hidden="true">
            <GraduationCap className="h-7 w-7" />
          </div>
          <h2 className="font-khmer-serif text-[19px] font-bold text-text-heading">{t("startJourneyTitle")}</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-text-muted">{t("startJourneyDesc")}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2.5">
            <Link href="/books"
              className="focus-field inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-5 text-[13.5px] font-semibold text-brand-contrast transition hover:bg-brand-hover">
              <Library className="h-4 w-4" />
              {t("browseCatalogue")}
            </Link>
            <Link href="/theses"
              className="focus-field inline-flex h-10 items-center gap-2 rounded-xl border border-divider bg-paper px-5 text-[13.5px] font-semibold text-text-body transition hover:border-brand/30 hover:text-brand">
              <BookOpen className="h-4 w-4" />
              {t("exploreTheses")}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const pct = Math.max(0, Math.min(100, Math.round(book.progressPct)));
  // Page 1 needs no parameter — a bare reader URL is the cleaner link, and
  // the viewer starts there anyway.
  const page = typeof book.lastPage === "number" && book.lastPage > 1 ? book.lastPage : null;
  const continueHref = `/books/${book.slug}/read${page ? `?page=${page}` : ""}`;

  return (
    <section aria-label={t("continueReading")} className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-7">
        <Link href={`/books/${book.slug}`} className="focus-field relative mx-auto h-40 w-28 shrink-0 overflow-hidden rounded-xl shadow-lg sm:mx-0">
          <SmartBookCover
            coverUrl={book.coverUrl}
            title={book.title}
            author={book.author}
            category={book.category}
            seed={book.slug}
            sizes="112px"
            alt={book.title}
          />
        </Link>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-[11px] font-bold uppercase tracking-widest text-brand">{t("continueReading")}</p>
          <h2 className="mt-1 font-khmer-serif text-[20px] font-bold leading-snug text-text-heading line-clamp-2">
            {book.title}
          </h2>
          <p className="mt-0.5 truncate text-[13.5px] text-text-muted">{book.author}</p>

          {book.lastReadAt && (
            <p className="mt-2 text-[12px] text-text-muted">
              {t("lastOpened", { time: formatRelativeTime(book.lastReadAt, t) })}
            </p>
          )}

          <div className="mt-3.5 flex items-center gap-3">
            <div className="h-2 flex-1 max-w-xs overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("progressLabel")}>
              <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 text-[12.5px] font-bold tabular-nums text-brand">{t("progressPct", { pct })}</span>
          </div>

          <Link href={continueHref}
            className="focus-field mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-5 text-[13.5px] font-semibold text-brand-contrast transition hover:bg-brand-hover">
            <BookOpen className="h-4 w-4" />
            {t("continueButton")}
            {page && (
              <span className="text-[12px] font-normal opacity-80 tabular-nums">
                {t("continueAtPage", { page })}
              </span>
            )}
          </Link>
        </div>
      </div>
    </section>
  );
}
