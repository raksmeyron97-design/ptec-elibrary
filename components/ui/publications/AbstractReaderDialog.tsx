"use client";

import { type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { useTranslations } from "next-intl";
import AcademicText from "@/components/ui/publications/AcademicText";
import ReaderDialog from "@/components/ui/reader/ReaderDialog";
import type { PublicationReference } from "@/lib/publications";

type AbstractReaderDialogProps = {
  open: boolean;
  onClose: () => void;
  publicationTitle: string;
  heading: string;
  abstract: string;
  abstractKm: string | null;
  references: PublicationReference[];
  locale: string;
  textSize: number;
  canDecrease: boolean;
  canIncrease: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  onReset: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
};

/**
 * Publication-specific body for the shared {@link ReaderDialog}: bilingual
 * academic text with linked inline citations. The generic dialog owns focus,
 * scroll-lock, Escape, and layout; this composes only the reading content and
 * the reference-jump behavior.
 */
export default function AbstractReaderDialog({
  open,
  onClose,
  publicationTitle,
  heading,
  abstract,
  abstractKm,
  references,
  locale,
  textSize,
  canDecrease,
  canIncrease,
  onDecrease,
  onIncrease,
  onReset,
  returnFocusRef,
}: AbstractReaderDialogProps) {
  const t = useTranslations("publicationDetail");
  const khmerFirst = locale === "km" && !!abstractKm;

  // Clicking a citation closes the reader and jumps to the reference in the
  // page. The full abstract lives on the page too, so the anchor always exists.
  const jumpToReference = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target as Element;
    const link = target.closest<HTMLAnchorElement>('a[href^="#reference-"]');
    const hash = link?.getAttribute("href");
    if (!hash) return;

    event.preventDefault();
    onClose();
    window.setTimeout(() => {
      if (window.location.hash === hash) {
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      } else {
        window.location.hash = hash;
      }
    }, 0);
  };

  const englishContent = abstract ? (
    <section lang="en" aria-labelledby="abstract-reader-english-heading">
      <h3
        id="abstract-reader-english-heading"
        className="mb-[0.9em] flex items-center gap-2 text-[0.72em] font-bold uppercase tracking-[0.13em] text-text-muted"
      >
        <span aria-hidden="true" className="h-0.5 w-7 shrink-0 bg-accent-line" />
        {t("abstractEnglish")}
      </h3>
      <div className="font-sans">
        <AcademicText
          text={abstract}
          references={references}
          sourceId="abstract-reader-en"
          paragraphClassName="mt-[1em] first:mt-0"
          citationLabel={(number) => t("citationReference", { number })}
          missingCitationLabel={() => t("citationMissing")}
        />
      </div>
    </section>
  ) : null;

  const khmerContent = abstractKm ? (
    <section lang="km" aria-labelledby="abstract-reader-khmer-heading">
      <h3
        id="abstract-reader-khmer-heading"
        className="mb-[0.9em] flex items-center gap-2 font-khmer-serif text-[0.72em] font-bold tracking-[0.03em] text-text-muted"
      >
        <span aria-hidden="true" className="h-0.5 w-7 shrink-0 bg-accent-line" />
        {t("abstractKhmer")}
      </h3>
      <div className="font-khmer-serif">
        <AcademicText
          text={abstractKm}
          references={references}
          sourceId="abstract-reader-km"
          paragraphClassName="mt-[1em] first:mt-0"
          citationLabel={(number) => t("citationReference", { number })}
          missingCitationLabel={() => t("citationMissing")}
        />
      </div>
    </section>
  ) : null;

  const body = !abstract && !abstractKm ? (
    <p className="text-text-muted">{t("abstractNone")}</p>
  ) : khmerFirst ? (
    <>
      {khmerContent}
      {englishContent && (
        <>
          <div className="my-[2em] border-t border-divider" />
          {englishContent}
        </>
      )}
    </>
  ) : (
    <>
      {englishContent}
      {khmerContent && (
        <>
          {englishContent && <div className="my-[2em] border-t border-divider" />}
          {khmerContent}
        </>
      )}
    </>
  );

  return (
    <ReaderDialog
      open={open}
      onClose={onClose}
      eyebrow={heading}
      title={publicationTitle}
      locale={locale}
      textSize={textSize}
      canDecrease={canDecrease}
      canIncrease={canIncrease}
      onDecrease={onDecrease}
      onIncrease={onIncrease}
      onReset={onReset}
      returnFocusRef={returnFocusRef}
      onBodyClick={jumpToReference}
    >
      {body}
    </ReaderDialog>
  );
}
