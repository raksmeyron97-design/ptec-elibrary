"use client";

// The record's action set, in two tiers.
//
// The page previously rendered six buttons of near-identical weight, so
// "Copy Link" competed with "Download PDF" for the reader's attention. Here:
//
//   Tier 1 — the reader's main verb, then Download. What that verb IS comes
//            from lib/theses/access.ts — the same projection the file route
//            refuses by — and never from "a file exists":
//              canRead    → Preview PDF (solid) + the download control
//              sign_in    → Sign in to read (solid); one sign-in covers both
//                           reading and downloading, so no second button
//              protected  → no read button at all, and a sentence saying why
//                           (Top-10 or an admin block) and what to do instead
//              no_file    → the download control's own "PDF unavailable"
//            The old rule drew Preview PDF for every record with a file, so a
//            Top-10 thesis offered a reader that the file route answered
//            with 403.
//   Tier 2 — Bookmark, Share, Copy link, Cite. Quiet text buttons, no borders.
//
// The download control is passed in as a slot because its states are
// resolved client-side against a private endpoint — see
// <ThesisDownloadButton>. This component never decides who may download.

import { FileSearch, Loader2, Lock, LogIn, Quote } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import BookmarkButton from "@/components/ui/detail/BookmarkButton";
import ShareButton from "@/components/ui/books/ShareButton";
import CopyLinkButton from "@/components/ui/detail/CopyLinkButton";
import { openThesisReader } from "@/lib/theses/reader-bus";
import { TOP_N_PROTECTED, type ThesisAccess } from "@/lib/theses/access";

const PRIMARY =
  "inline-flex w-full min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand px-6 text-[15px] font-bold text-brand-contrast sm:w-auto transition-colors duration-150 hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

const UTILITY =
  "inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-text-muted transition-colors duration-150 hover:bg-bg-app hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50";

export function ThesisPrimaryActions({
  access,
  downloadSlot,
  signInHref,
  contactHref,
}: {
  access: ThesisAccess;
  downloadSlot: React.ReactNode;
  /** Login URL that returns to this record. */
  signInHref: string;
  /** Where a protected record sends a reader who wants the full text. */
  contactHref: string;
}) {
  const t = useTranslations("thesisDetail");
  const tReader = useTranslations("reader");
  // "Opening…" is shown for one frame's worth of intent, then cleared. The
  // reader itself owns the real loading state (the PDF fetch happens inside
  // <FullTextSection>), so holding a spinner here would double-report it.
  const [opening, setOpening] = useState(false);

  const preview = () => {
    setOpening(true);
    openThesisReader();
    window.setTimeout(() => setOpening(false), 600);
  };

  if (access.state === "protected") {
    return (
      <div
        role="note"
        className="flex w-full items-start gap-3 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-warning-text sm:max-w-[60ch]"
      >
        <Lock className="mt-0.5 h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        <div className="min-w-0 text-[13.5px] leading-[1.6]">
          <p className="font-semibold">{t("accessProtectedTitle")}</p>
          <p>
            {access.blockedBy === "top_ten" && access.rank != null
              ? t("accessProtectedTopTen", { count: TOP_N_PROTECTED, rank: access.rank })
              : t("accessProtectedAdmin")}
          </p>
          <a
            href={contactHref}
            className="mt-1 inline-block rounded-sm font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          >
            {t("accessContact")}
          </a>
        </div>
      </div>
    );
  }

  if (access.state === "sign_in") {
    return (
      <div className="w-full space-y-1.5 sm:w-auto">
        <a href={signInHref} className={PRIMARY}>
          <LogIn className="h-[18px] w-[18px]" aria-hidden="true" />
          {tReader("signInToRead")}
        </a>
        <p className="text-[12px] leading-snug text-text-muted">{t("accessSignInHint")}</p>
      </div>
    );
  }

  return (
    <>
      {access.canRead && (
        <button type="button" onClick={preview} disabled={opening} className={PRIMARY}>
          {opening ? (
            <Loader2 className="h-[18px] w-[18px] animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <FileSearch className="h-[18px] w-[18px]" aria-hidden="true" />
          )}
          {opening ? t("openingPdf") : t("previewPdf")}
        </button>
      )}
      {downloadSlot}
    </>
  );
}

export function ThesisSecondaryActions({
  id,
  title,
  shareUrl,
}: {
  id: string;
  title: string;
  shareUrl: string;
}) {
  const t = useTranslations("thesisDetail");
  return (
    <>
      <BookmarkButton
        id={id}
        contentType="thesis"
        label={{ saved: t("saved"), unsaved: t("bookmark") }}
        className={UTILITY}
      />
      <ShareButton url={shareUrl} title={title} label={t("share")} className={UTILITY} />
      <CopyLinkButton url={shareUrl} compact className={UTILITY} />
      <a href="#cite-panel" className={UTILITY}>
        <Quote className="h-4 w-4" aria-hidden="true" />
        {t("cite")}
      </a>
    </>
  );
}
