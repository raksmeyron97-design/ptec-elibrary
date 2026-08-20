"use client";

// The record's action set, in two tiers.
//
// The page previously rendered six buttons of near-identical weight, so
// "Copy Link" competed with "Download PDF" for the reader's attention. Here:
//
//   Tier 1 — Preview PDF and Download. The two things you came to do. Solid,
//            44px, side by side. Preview is the SOLID BRAND button and
//            download is the outlined one, deliberately: preview always works
//            for everyone, while download is gated behind sign-in for the
//            protected Top-10 records, and leading with a button that many
//            readers cannot use is a worse first impression than leading with
//            one that always opens.
//   Tier 2 — Bookmark, Share, Copy link, Cite. Quiet text buttons, no borders.
//
// The download control is passed in as a slot because its five states
// (loading / allowed / sign-in required / profile setup required / no file)
// are resolved client-side against a private endpoint — see
// <ThesisDownloadButton>. This component never decides who may download.

import { FileSearch, Loader2, Quote } from "lucide-react";
import { useState } from "react";
import BookmarkButton from "@/components/ui/detail/BookmarkButton";
import ShareButton from "@/components/ui/books/ShareButton";
import CopyLinkButton from "@/components/ui/detail/CopyLinkButton";
import { openThesisReader } from "@/lib/theses/reader-bus";

const PRIMARY =
  "inline-flex w-full min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand px-6 text-[15px] font-bold text-brand-contrast sm:w-auto transition-colors duration-150 hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

const UTILITY =
  "inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-text-muted transition-colors duration-150 hover:bg-bg-app hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50";

export function ThesisPrimaryActions({
  hasFile,
  downloadSlot,
}: {
  hasFile: boolean;
  downloadSlot: React.ReactNode;
}) {
  // "Opening…" is shown for one frame's worth of intent, then cleared. The
  // reader itself owns the real loading state (the PDF fetch happens inside
  // <FullTextSection>), so holding a spinner here would double-report it.
  const [opening, setOpening] = useState(false);

  const preview = () => {
    setOpening(true);
    openThesisReader();
    window.setTimeout(() => setOpening(false), 600);
  };

  return (
    <>
      {hasFile && (
        <button type="button" onClick={preview} disabled={opening} className={PRIMARY}>
          {opening ? (
            <Loader2 className="h-[18px] w-[18px] animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <FileSearch className="h-[18px] w-[18px]" aria-hidden="true" />
          )}
          {opening ? "Opening PDF…" : "Preview PDF"}
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
  return (
    <>
      <BookmarkButton
        id={id}
        contentType="thesis"
        label={{ saved: "Saved", unsaved: "Bookmark" }}
        className={UTILITY}
      />
      <ShareButton url={shareUrl} title={title} label="Share" className={UTILITY} />
      <CopyLinkButton url={shareUrl} compact className={UTILITY} />
      <a href="#cite-panel" className={UTILITY}>
        <Quote className="h-4 w-4" aria-hidden="true" />
        Cite
      </a>
    </>
  );
}
