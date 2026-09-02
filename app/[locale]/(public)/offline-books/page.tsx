"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Icon, { type IconName } from "@/components/ui/core/Icon";
import { useSession } from "@/components/providers/SessionProvider";
import {
  formatBytes,
  getDeviceOwnerKey,
  getOfflineBooksFor,
  getOfflineStorageEstimate,
  isOfflineBookAvailable,
  isOfflineStorageSupported,
  reconcileOfflineOwnership,
  removeOfflineBook,
  type OfflineBook,
  type OfflineStorageEstimate,
} from "@/lib/offline";

// ─────────────────────────────────────────────────────────────────────────────
// Downloaded books — the device's own library.
//
// Two rules make this page honest rather than decorative:
//
//   1. Every row's status comes from a real Cache Storage probe, not from the
//      localStorage record. A record can outlive its bytes (browser eviction,
//      a cleared site, a failed write), and telling someone a book is available
//      when opening it would fail is the failure this whole redesign exists to
//      remove.
//   2. "Read offline" goes to /offline-reader, never to /books/<slug>. The book
//      page is a server-rendered, auth-gated route: with no network it cannot
//      render at all, which is exactly why saved books used to be unreadable.
// ─────────────────────────────────────────────────────────────────────────────

type Row = { book: OfflineBook; available: boolean | null };

export default function OfflineBooksPage() {
  const t = useTranslations("offline");
  const locale = useLocale();
  const { user, loading: sessionLoading } = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [estimate, setEstimate] = useState<OfflineStorageEstimate | null>(null);
  const [supported, setSupported] = useState(true);
  const [purged, setPurged] = useState(0);

  // ClientNavWrapper-style: build the prefix from the active locale rather than
  // hard-coding one. The reader is a plain document navigation on purpose — a
  // client-side transition would try to fetch an RSC payload that, offline,
  // is not there.
  const readerHref = (id: string) =>
    `${locale === "km" ? "/km" : ""}/offline-reader?id=${encodeURIComponent(id)}`;

  const load = useCallback(async (ownerKey: string | null) => {
    const books = getOfflineBooksFor(ownerKey);
    setRows(books.map((book) => ({ book, available: null })));
    setEstimate(await getOfflineStorageEstimate());
    const checked = await Promise.all(
      books.map(async (book) => ({ book, available: await isOfflineBookAvailable(book) })),
    );
    setRows(checked);
  }, []);

  useEffect(() => {
    if (!isOfflineStorageSupported()) {
      setSupported(false);
      setRows([]);
      return;
    }
    // Offline, `/api/me` cannot answer, so the device's last known owner is the
    // only identity available — and the right one: it is who saved these books.
    void load(getDeviceOwnerKey());
  }, [load]);

  // Online, the real session settles it. A different account signing in on this
  // device destroys the previous reader's downloads before anything is listed.
  useEffect(() => {
    if (sessionLoading || !user?.id) return;
    let active = true;
    reconcileOfflineOwnership(user.id).then((removed) => {
      if (!active) return;
      if (removed > 0) setPurged(removed);
      void load(user.id);
    });
    return () => {
      active = false;
    };
  }, [sessionLoading, user?.id, load]);

  const handleRemove = async (book: OfflineBook) => {
    if (!window.confirm(t("removeConfirm"))) return;
    await removeOfflineBook(book.id);
    setRows((prev) => prev?.filter((r) => r.book.id !== book.id) ?? null);
    setEstimate(await getOfflineStorageEstimate());
  };

  const count = rows?.length ?? 0;
  // Only books whose bytes are actually still there. Counting an evicted copy
  // would report storage the device is not using — the row right below it says
  // the file is gone.
  const booksBytes =
    rows?.reduce((sum, r) => sum + (r.available === false ? 0 : r.book.sizeBytes ?? 0), 0) ?? 0;

  return (
    <div className="min-h-screen bg-bg-body px-4 py-8 sm:px-6 md:px-12 md:py-10">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/books"
          className="focus-field mb-6 inline-flex min-h-[44px] items-center gap-2 text-[14.5px] font-semibold text-brand transition-colors hover:text-brand-hover"
        >
          <Icon name="arrow-left" className="text-[20px]" aria-hidden />
          {t("backToCatalogue")}
        </Link>

        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-khmer-serif text-3xl font-bold text-text-heading">
            {t("libraryTitle")}
          </h1>
          <span className="rounded-full bg-brand/10 px-3 py-1 text-sm font-semibold text-brand">
            {t("bookCount", { count })}
          </span>
        </div>

        {/* Storage: what the books actually weigh, plus the browser's own
            estimate when it offers one. Never a made-up total. */}
        <p className="mb-8 text-[13.5px] text-text-muted">
          {booksBytes > 0 && <>{t("storageUsed", { size: formatBytes(booksBytes) })} · </>}
          {estimate?.supported && estimate.usageBytes !== null
            ? t("storageDevice", { size: formatBytes(estimate.usageBytes) })
            : t("storageUnknown")}
        </p>

        {purged > 0 && (
          <p role="status" className="mb-6 rounded-[12px] border border-info-line bg-info-soft px-4 py-3 text-[13.5px] text-info-text">
            {t("purgedForAccountSwitch", { count: purged })}
          </p>
        )}

        {!supported ? (
          <EmptyState icon="bookmark" title={t("unsupportedTitle")} body={t("unsupportedBody")} />
        ) : rows === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-72 animate-pulse rounded-xl border border-divider bg-bg-surface" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="bookmark"
            title={t("emptyTitle")}
            body={t("emptyBody")}
            action={{ href: "/books", label: t("browseBooks") }}
          />
        ) : (
          <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(({ book, available }) => (
              <li
                key={book.id}
                className="flex flex-col overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm"
              >
                <div className="relative aspect-[3/4] w-full border-b border-divider/50 bg-paper">
                  {book.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={book.coverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className={`flex h-full w-full flex-col justify-end p-4 ${book.coverColor || "bg-brand"}`}>
                      <span className="line-clamp-3 font-khmer-serif text-lg font-bold leading-tight text-white">
                        {book.title}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-1 p-4">
                  <h2 className="line-clamp-2 font-khmer-serif text-[15px] font-bold leading-snug text-text-heading">
                    {book.title}
                  </h2>
                  {book.author && (
                    <p className="line-clamp-1 text-xs font-medium text-text-muted">{book.author}</p>
                  )}
                  <p className="text-[11px] font-medium text-text-muted">
                    {t("savedOn", { date: new Date(book.savedAt).toLocaleDateString(locale === "km" ? "km-KH" : "en-GB") })}
                    {book.sizeBytes ? ` · ${formatBytes(book.sizeBytes)}` : ""}
                  </p>

                  {/* Status is a badge, not a colour: it is the only thing that
                      tells a reader whether the copy still exists. */}
                  <p className="mt-2">
                    {available === null ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-divider px-2.5 py-1 text-[11px] font-semibold text-text-muted">
                        {t("checking")}
                      </span>
                    ) : available ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-semibold text-success-text">
                        <Icon name="check" className="text-[13px]" aria-hidden />
                        {t("availableOffline")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold text-warning-text">
                        <Icon name="alert-triangle" className="text-[13px]" aria-hidden />
                        {t("copyUnavailable")}
                      </span>
                    )}
                  </p>

                  <div className="mt-auto flex items-center gap-2 pt-4">
                    {available === false ? (
                      <Link
                        href={`/books/${book.slug}`}
                        className="focus-field inline-flex min-h-[44px] flex-1 items-center justify-center rounded-[10px] border border-divider px-3 text-[13px] font-semibold text-text-body transition hover:border-brand hover:text-brand"
                      >
                        {t("downloadAgain")}
                      </Link>
                    ) : (
                      <a
                        href={readerHref(book.id)}
                        aria-disabled={available === null}
                        className="focus-field inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-brand px-3 text-[13px] font-bold text-brand-contrast transition hover:bg-brand-hover aria-disabled:pointer-events-none aria-disabled:opacity-60"
                      >
                        <Icon name="library" className="text-[15px]" aria-hidden />
                        {t("readOffline")}
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemove(book)}
                      className="focus-field inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-danger transition-colors hover:bg-danger/10"
                      aria-label={t("removeLabel", { title: book.title })}
                    >
                      <Icon name="trash" className="text-[16px]" aria-hidden />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[20px] border border-divider bg-bg-surface px-6 py-16 text-center shadow-sm">
      <div className="mb-4 rounded-full bg-divider p-5">
        <Icon name={icon} className="text-4xl text-text-muted" aria-hidden />
      </div>
      <h2 className="mb-2 font-khmer-serif text-xl font-bold text-text-heading">{title}</h2>
      <p className="max-w-md text-base text-text-muted">{body}</p>
      {action && (
        <Link
          href={action.href}
          className="focus-field mt-6 inline-flex min-h-[48px] items-center rounded-[12px] bg-brand px-6 py-3 font-bold text-brand-contrast transition-colors hover:bg-brand-hover"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
