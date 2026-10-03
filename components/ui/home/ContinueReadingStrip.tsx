"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import SmartBookCover from "@/components/ui/books/SmartBookCover";
import { toBookCardList, type BookCardData } from "@/lib/books/card-data";
import { useSession } from "@/components/providers/SessionProvider";

type Position = { page: number | null; pageCount: number | null };

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Page 1 needs no parameter — the reader starts there anyway (the
 *  dashboard's ContinueReadingHero rule). */
function resumePage(position: Position | undefined): number | null {
  return position?.page && position.page > 1 ? position.page : null;
}

/**
 * One row above the homepage shelf, for a signed-in reader with a book in
 * progress: the latest book, how far in, and a Resume button straight into
 * the reader at the saved page.
 *
 * It ADDS to the band rather than replacing it. The shelf below is identical
 * for every visitor and stays in the prerendered HTML; this strip is a client
 * island fed by <SessionProvider> and a private no-store route
 * (/api/me/continue-reading), so nothing here makes the homepage dynamic.
 * Signed out, loading, or nothing in progress: it renders nothing.
 */
export default function ContinueReadingStrip() {
  const t = useTranslations("home");
  const tDash = useTranslations("dashboard");
  const tDetail = useTranslations("bookDetail");
  const { user, loading } = useSession();
  const [current, setCurrent] = useState<{ book: BookCardData; position?: Position } | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    let active = true;
    fetch("/api/me/continue-reading", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : { books: [] }))
      .then((data: { books?: unknown[]; positions?: Record<string, Position> }) => {
        // `res.json()` is `any`, so an annotation here would ASSERT the card
        // type rather than produce it. Narrowing the rows for real is the
        // honest type, whatever the route sends.
        const [book] = toBookCardList((data.books ?? []) as never[]);
        if (active && book) setCurrent({ book, position: data.positions?.[book.slug] });
      })
      // A failed personalisation fetch shows nothing; the shelf is unaffected.
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user, loading]);

  if (!user || !current) return null;

  const { book, position } = current;
  const pct = clampPct(book.progressPct ?? 0);
  const page = resumePage(position);
  const total = position?.pageCount && position.pageCount > 0 ? position.pageCount : null;
  const pageLabel =
    page && total && page <= total
      ? tDash("pageOfTotal", { page, total })
      : page
        ? tDash("pageOnly", { page })
        : t("readPct", { pct });
  const readerHref = `/books/${book.slug}/read${page ? `?page=${page}` : ""}`;

  return (
    <div className="mb-8 flex items-center gap-4 rounded-xl border border-border bg-paper p-3 shadow-sm sm:gap-5 sm:p-4">
      <Link
        href={`/books/${book.slug}`}
        tabIndex={-1}
        aria-hidden="true"
        className="relative aspect-[2/3] w-12 shrink-0 overflow-hidden rounded shadow-cover sm:w-14"
      >
        <SmartBookCover
          coverUrl={book.coverUrl}
          title={book.title}
          author={book.author}
          category={book.category}
          seed={book.slug}
          variant="thumbnail"
          sizes="56px"
        />
      </Link>

      <div className="min-w-0 flex-1">
        <h3 className="text-[11.5px] font-bold text-accent-text">{t("continueReading")}</h3>
        <p className="mt-0.5 truncate text-[15px] font-semibold text-text-heading" dir="auto">
          <Link href={`/books/${book.slug}`} className="rounded-sm transition-colors hover:text-brand">
            {book.title}
          </Link>
        </p>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-1.5 max-w-[240px] flex-1 overflow-hidden rounded-full bg-bg-surface" aria-hidden>
            <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-[12.5px] text-text-muted">{pageLabel}</span>
        </div>
      </div>

      <Link
        href={readerHref}
        className="inline-flex min-h-[40px] shrink-0 items-center rounded-lg bg-brand px-4 text-[13.5px] font-semibold text-brand-contrast transition-colors hover:bg-brand-hover"
      >
        {tDetail("resume")}
        <span className="sr-only">: {book.title}</span>
      </Link>
    </div>
  );
}
