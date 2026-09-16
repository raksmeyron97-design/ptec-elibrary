"use client";

import { Fragment, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { useTranslations } from "next-intl";
import AbstractLanguageSwitch from "@/components/ui/publications/AbstractLanguageSwitch";
import AcademicText from "@/components/ui/publications/AcademicText";
import type { AbstractLang } from "@/lib/publications/abstract-language";
import ReaderDialog from "@/components/ui/reader/ReaderDialog";
import type { PublicationReference } from "@/lib/publications";

// The dialog needs its own panel ids: the page's abstract is still mounted
// behind it, carrying the same two languages. Constant, so it is not rebuilt
// on every render of a component that re-renders on each text-size step.
const PANEL_ID = { en: "abstract-reader-panel-en", km: "abstract-reader-panel-km" } as const;

type AbstractReaderDialogProps = {
  open: boolean;
  onClose: () => void;
  publicationTitle: string;
  heading: string;
  abstract: string;
  abstractKm: string | null;
  references: PublicationReference[];
  locale: string;
  /** Shared with the page's abstract, like textSize: one choice, two surfaces. */
  activeLang: AbstractLang;
  onLangChange: (lang: AbstractLang) => void;
  /** Both languages carry text, so the switch is offered here too. */
  switchable: boolean;
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
  activeLang,
  onLangChange,
  switchable,
  textSize,
  canDecrease,
  canIncrease,
  onDecrease,
  onIncrease,
  onReset,
  returnFocusRef,
}: AbstractReaderDialogProps) {
  const t = useTranslations("publicationDetail");

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

  const languageSection = (lang: AbstractLang) => {
    const text = lang === "km" ? abstractKm : abstract;
    if (!text) return null;
    const hidden = switchable && lang !== activeLang;
    const headingId = `abstract-reader-${lang}-heading`;
    return (
      // A direct <section lang> child of the dialog's <article>: the reading
      // surface is one document per language, not one document in two halves.
      <section
        id={PANEL_ID[lang]}
        lang={lang}
        hidden={hidden}
        aria-labelledby={headingId}
      >
        <h3
          id={headingId}
          className={
            lang === "km"
              ? "mb-[0.9em] flex items-center gap-2 font-khmer-serif text-[0.72em] font-bold tracking-[0.03em] text-text-muted"
              : "mb-[0.9em] flex items-center gap-2 text-[0.72em] font-bold uppercase tracking-[0.13em] text-text-muted"
          }
        >
          <span aria-hidden="true" className="h-0.5 w-7 shrink-0 bg-accent-line" />
          {lang === "km" ? t("abstractKhmer") : t("abstractEnglish")}
        </h3>
        <div className={lang === "km" ? "font-khmer-serif" : "font-sans"}>
          <AcademicText
            text={text}
            references={references}
            sourceId={`abstract-reader-${lang}`}
            paragraphClassName="mt-[1em] first:mt-0"
            citationLabel={(number) => t("citationReference", { number })}
            missingCitationLabel={() => t("citationMissing")}
          />
        </div>
      </section>
    );
  };

  // Reader's language first in the DOM, so the reading order matches the choice.
  const order: AbstractLang[] = activeLang === "km" ? ["km", "en"] : ["en", "km"];

  const body =
    !abstract && !abstractKm ? (
      <p className="text-text-muted">{t("abstractNone")}</p>
    ) : (
      <>
        {switchable && (
          <div className="mb-[1.6em]">
            <AbstractLanguageSwitch
              active={activeLang}
              onChange={onLangChange}
              groupLabel={t("abstractLanguageLabel")}
              options={[
                { lang: "en", label: t("abstractLanguageEnShort"), name: t("abstractEnglish"), controls: PANEL_ID.en },
                { lang: "km", label: t("abstractLanguageKmShort"), name: t("abstractKhmer"), controls: PANEL_ID.km },
              ]}
            />
          </div>
        )}
        {order.map((lang) => (
          <Fragment key={lang}>{languageSection(lang)}</Fragment>
        ))}
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
