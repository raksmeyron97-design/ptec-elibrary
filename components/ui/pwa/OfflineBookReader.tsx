"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Icon from "@/components/ui/core/Icon";
import PDFViewer from "@/components/ui/reader/PDFViewerClient";
import {
  getOfflineBook,
  getOfflineBookBlob,
  isOfflineStorageSupported,
  removeOfflineBook,
  type OfflineBook,
} from "@/lib/offline";

// ─────────────────────────────────────────────────────────────────────────────
// The offline reader.
//
// It reads ONE book, from Cache Storage, and talks to nothing:
//
//     record (localStorage) → cache.match → Blob → object URL → pdf.js
//
// No book API, no database, no session check, no server render of the book.
// That is the whole point — every one of those is a network call, and the
// reader has to work when there is no network. Authorisation happened once,
// online, when the reader pressed "Save offline" against an auth-gated
// endpoint; this surface only re-opens bytes that are already on the device.
//
// Download logic deliberately lives in lib/offline.ts, not here. A reader that
// could also fetch is a reader that can be offline-broken by a network path.
// ─────────────────────────────────────────────────────────────────────────────

type State =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "no-id" }
  | { kind: "not-saved" }
  | { kind: "missing-file"; book: OfflineBook }
  | { kind: "ready"; book: OfflineBook; objectUrl: string };

export default function OfflineBookReader({ bookId }: { bookId: string | null }) {
  const t = useTranslations("offline");
  const locale = useLocale();
  // The library lives under (public), which is locale-prefixed. Built the same
  // way the listing pages build `basePath` — not hard-coded to one locale.
  const libraryHref = locale === "km" ? "/km/offline-books" : "/offline-books";
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    // Owned by THIS run: the cleanup below revokes exactly the URL this run
    // created. Without that, a long session (or a switch between books) leaks
    // a whole PDF into memory per open.
    let objectUrl: string | null = null;

    (async () => {
      if (!bookId) return setState({ kind: "no-id" });
      if (!isOfflineStorageSupported()) return setState({ kind: "unsupported" });

      const book = getOfflineBook(bookId);
      if (!book) return setState({ kind: "not-saved" });

      const blob = await getOfflineBookBlob(book);
      if (!active) return;
      if (!blob) return setState({ kind: "missing-file", book });

      objectUrl = URL.createObjectURL(blob);
      if (!active) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
        return;
      }
      setState({ kind: "ready", book, objectUrl });
    })().catch(() => {
      if (active) setState({ kind: "not-saved" });
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [bookId]);

  // The badge is a claim about this device's storage, so it is rendered only
  // where that claim is true — never above an error saying the copy is gone.
  const header = (title: string, available = false) => (
    <div className="border-b border-divider bg-bg-surface px-3 py-2.5 sm:px-6">
      <div className="mx-auto flex max-w-[1400px] items-center gap-2">
        <a
          href={libraryHref}
          className="focus-field inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand transition-colors hover:bg-brand/5"
        >
          <Icon name="arrow-left" className="text-[15px]" />
          <span className="hidden sm:inline">{t("backToLibrary")}</span>
          <span className="sr-only sm:hidden">{t("backToLibrary")}</span>
        </a>
        <h1 className="font-khmer-serif min-w-0 flex-1 truncate text-[15px] font-bold text-text-heading">
          {title}
        </h1>
        {available && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-semibold text-success-text">
            <Icon name="check" className="text-[13px]" aria-hidden />
            {t("availableOffline")}
          </span>
        )}
      </div>
    </div>
  );

  if (state.kind === "loading") {
    return (
      <div className="min-h-screen bg-bg-body">
        {header(t("openingBook"))}
        <div
          className="flex min-h-[60vh] flex-col items-center justify-center gap-3"
          role="status"
          aria-live="polite"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-divider border-t-brand" aria-hidden />
          <span className="text-sm font-medium text-text-muted">{t("openingBook")}</span>
        </div>
      </div>
    );
  }

  if (state.kind === "ready") {
    return (
      <div className="min-h-screen bg-bg-body">
        {header(state.book.title, true)}
        <div className="mx-auto max-w-[1400px] px-1 py-2 sm:px-4 sm:py-4">
          <PDFViewer
            title={state.book.title}
            pdfUrl={state.objectUrl}
            bookId={state.book.id}
            offline
            allowDownload
            isLoggedIn={false}
          />
        </div>
      </div>
    );
  }

  const body =
    state.kind === "unsupported" ? t("unsupportedBody")
    : state.kind === "no-id" ? t("noIdBody")
    : state.kind === "not-saved" ? t("notSavedBody")
    : t("missingFileBody");

  return (
    <div className="min-h-screen bg-bg-body">
      {header(state.kind === "missing-file" ? state.book.title : t("offlineReader"))}
      {state.kind === "missing-file"
        ? (
            <Notice
              heading={t("missingFileTitle")}
              body={body}
              action={{
                label: t("removeAndBrowse"),
                onClick: async () => {
                  await removeOfflineBook(state.book.id);
                  window.location.assign(libraryHref);
                },
              }}
            />
          )
        : (
            <Notice
              heading={state.kind === "unsupported" ? t("unsupportedTitle") : t("notSavedTitle")}
              body={body}
              action={{ label: t("backToLibrary"), href: libraryHref }}
            />
          )}
    </div>
  );
}

/** An empty/error state for the reader. Module scope: it closes over nothing,
 *  so rebuilding it on every render of a PDF viewer buys nothing. */
function Notice({
  heading,
  body,
  action,
}: {
  heading: string;
  body: string;
  action?: { label: string; onClick?: () => void; href?: string };
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 rounded-full bg-divider p-5">
        <Icon name="bookmark" className="text-3xl text-text-muted" aria-hidden />
      </div>
      <h2 className="mb-2 font-khmer-serif text-xl font-bold text-text-heading">{heading}</h2>
      <p className="max-w-md text-[15px] leading-6 text-text-muted">{body}</p>
      {action &&
        (action.href ? (
          <a
            href={action.href}
            className="focus-field mt-6 inline-flex min-h-[48px] items-center rounded-[12px] bg-brand px-6 py-3 font-bold text-brand-contrast transition-colors hover:bg-brand-hover"
          >
            {action.label}
          </a>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className="focus-field mt-6 inline-flex min-h-[48px] items-center rounded-[12px] bg-brand px-6 py-3 font-bold text-brand-contrast transition-colors hover:bg-brand-hover"
          >
            {action.label}
          </button>
        ))}
    </div>
  
  );
}
