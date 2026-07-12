"use client";

// Publication-specific abstract with expand/collapse and linked inline
// citations. Deliberately separate from the shared detail AbstractSection so
// thesis pages keep their existing behavior.
//
// The full abstract always stays in the DOM (collapse is pure CSS clipping),
// so SEO, printing (print: overrides), no-JS readers (noscript override), and
// citation fragment anchors all see the complete text.

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Clock, FileText } from "lucide-react";
import AbstractReaderDialog from "@/components/ui/publications/AbstractReaderDialog";
import AcademicText from "@/components/ui/publications/AcademicText";
import ReaderToolbar from "@/components/ui/reader/ReaderToolbar";
import { useReaderPreferences } from "@/components/ui/reader/useReaderPreferences";
import type { PublicationReference } from "@/lib/publications";
import { academicTextToPlainText } from "@/lib/publications/citations";

const WORDS_PER_MINUTE = 200;
// ~6 clipped lines at the block's own 1.8 line-height.
const COLLAPSED_MAX_HEIGHT = "10.8em";

type ReaderScaleStyle = CSSProperties & { "--reader-scale": number };

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function ExpandableAcademicBlock({
  text,
  references,
  sourceId,
  lang,
  languageLabel,
  textSize,
  className = "",
}: {
  text: string;
  references: PublicationReference[];
  sourceId: string;
  lang: "en" | "km";
  languageLabel: string;
  textSize: number;
  className?: string;
}) {
  const t = useTranslations("publicationDetail");
  const reactId = useId();
  const contentId = `abstract-content-${reactId.replace(/:/g, "")}`;
  const blockRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const contentStyle: ReaderScaleStyle = {
    "--reader-scale": textSize / 100,
    ...(expanded ? {} : { maxHeight: COLLAPSED_MAX_HEIGHT }),
  };

  // Only show the control when the collapsed block actually clips content.
  useLayoutEffect(() => {
    if (expanded) return; // keep the last collapsed measurement
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, text]);

  // A citation backlink (#citation-…) must reveal its clipped target before
  // the browser can meaningfully scroll to and focus it.
  useEffect(() => {
    const revealHashTarget = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const target = document.getElementById(hash);
      if (!target || !contentRef.current?.contains(target)) return;
      setExpanded(true);
      requestAnimationFrame(() => {
        target.scrollIntoView({
          block: "center",
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
        target.focus?.({ preventScroll: true });
      });
    };
    revealHashTarget();
    window.addEventListener("hashchange", revealHashTarget);
    return () => window.removeEventListener("hashchange", revealHashTarget);
  }, []);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (!next) {
      // Collapsing a long block can leave the reader far below it; bring the
      // block back into view while focus stays on this same button.
      requestAnimationFrame(() => {
        const block = blockRef.current;
        if (block && block.getBoundingClientRect().top < 0) {
          block.scrollIntoView({
            block: "start",
            behavior: prefersReducedMotion() ? "auto" : "smooth",
          });
        }
      });
    }
  };

  return (
    <div ref={blockRef} className="scroll-mt-24">
      <div className="relative">
        <div
          id={contentId}
          ref={contentRef}
          lang={lang}
          className={`abstract-reader-copy overflow-hidden text-text-body print:!max-h-none ${className}`}
          style={contentStyle}
        >
          <AcademicText
            text={text}
            references={references}
            sourceId={sourceId}
            paragraphClassName="mt-[0.75em] first:mt-0"
            citationLabel={(number) => t("citationReference", { number })}
            missingCitationLabel={() => t("citationMissing")}
          />
        </div>
        {!expanded && overflowing && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-bg-body to-transparent print:hidden"
          />
        )}
        {/* Without JavaScript the control never appears, so never clip. */}
        <noscript>
          <style>{`#${contentId}{max-height:none!important}`}</style>
        </noscript>
      </div>

      {(overflowing || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={toggle}
          className="mt-2 inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-[13px] font-semibold text-brand transition-colors hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 print:hidden"
        >
          {expanded ? t("abstractShowLess") : t("abstractShowMore")}
          <span className="sr-only"> — {languageLabel}</span>
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </div>
  );
}

export default function PublicationAbstractSection({
  abstract,
  abstractKm,
  references,
  heading,
  publicationTitle,
  locale = "en",
}: {
  abstract: string;
  abstractKm: string | null;
  references: PublicationReference[];
  heading: string;
  publicationTitle: string;
  /** Page locale: on /km the Khmer abstract leads. Both stay in the DOM. */
  locale?: string;
}) {
  const t = useTranslations("publicationDetail");
  const [readerOpen, setReaderOpen] = useState(false);
  const openReaderButtonRef = useRef<HTMLButtonElement>(null);
  const {
    textSize,
    decreaseTextSize,
    increaseTextSize,
    resetTextSize,
    canDecrease,
    canIncrease,
  } = useReaderPreferences();
  const plain = academicTextToPlainText(abstract, references);
  const words = plain ? plain.split(/\s+/).filter(Boolean).length : 0;
  const readingMinutes = words > 0 ? Math.max(1, Math.round(words / WORDS_PER_MINUTE)) : 0;
  const khmerFirst = locale === "km" && !!abstractKm;

  const englishBlock = abstract ? (
    <ExpandableAcademicBlock
      text={abstract}
      references={references}
      sourceId="abstract-en"
      lang="en"
      languageLabel={t("abstractEnglish")}
      textSize={textSize}
      className="font-sans"
    />
  ) : (
    <p className="text-[15px] text-text-muted">{t("abstractNone")}</p>
  );

  const khmerBlock = abstractKm ? (
    <ExpandableAcademicBlock
      text={abstractKm}
      references={references}
      sourceId="abstract-km"
      lang="km"
      languageLabel={t("abstractKhmer")}
      textSize={textSize}
      className="font-khmer-serif"
    />
  ) : null;

  return (
    <article className="max-w-[70ch]">
      {words > 0 && (
        <header className="mb-4 flex flex-wrap items-center gap-3 text-[12px] text-text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {t("abstractMinRead", { count: readingMinutes })}
          </span>
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {t("abstractWordCount", { count: words })}
          </span>
        </header>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="abstract-heading" className="text-[12px] font-bold uppercase tracking-[0.14em] text-text-muted">
          {heading}
        </h2>
        <ReaderToolbar
          textSize={textSize}
          canDecrease={canDecrease}
          canIncrease={canIncrease}
          onDecrease={decreaseTextSize}
          onIncrease={increaseTextSize}
          onReset={resetTextSize}
          mode="inline"
          onOpen={() => setReaderOpen(true)}
          announce={!readerOpen}
          actionButtonRef={openReaderButtonRef}
        />
      </div>

      <div className="mt-3">
        {khmerFirst ? (
          <>
            <h3 className="sr-only">{t("abstractKhmer")}</h3>
            {khmerBlock}
            {abstract && (
              <div className="mt-5 border-t border-divider pt-4">
                <h3 className="sr-only">{t("abstractEnglish")}</h3>
                {englishBlock}
              </div>
            )}
          </>
        ) : (
          <>
            {englishBlock}
            {khmerBlock && (
              <div className="mt-5 border-t border-divider pt-4">
                <h3 className="sr-only">{t("abstractKhmer")}</h3>
                {khmerBlock}
              </div>
            )}
          </>
        )}
      </div>

      <AbstractReaderDialog
        open={readerOpen}
        onClose={() => setReaderOpen(false)}
        publicationTitle={publicationTitle}
        heading={heading}
        abstract={abstract}
        abstractKm={abstractKm}
        references={references}
        locale={locale}
        textSize={textSize}
        canDecrease={canDecrease}
        canIncrease={canIncrease}
        onDecrease={decreaseTextSize}
        onIncrease={increaseTextSize}
        onReset={resetTextSize}
        returnFocusRef={openReaderButtonRef}
      />
    </article>
  );
}
