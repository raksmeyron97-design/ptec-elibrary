"use client";

// Thesis abstract with the shared reader controls (text zoom + distraction-free
// fullscreen reader). Thesis abstracts are plain single-language text with no
// inline citations, so the body is simple paragraphs — the zoom, fullscreen
// dialog, focus management, and i18n all come from components/ui/reader/*.

import { useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Clock, FileText } from "lucide-react";
import KeywordList from "@/components/ui/detail/KeywordList";
import ReaderDialog from "@/components/ui/reader/ReaderDialog";
import ReaderToolbar from "@/components/ui/reader/ReaderToolbar";
import { useReaderPreferences } from "@/components/ui/reader/useReaderPreferences";

const WORDS_PER_MINUTE = 200;

type ReaderScaleStyle = CSSProperties & { "--reader-scale": number };

// Split into paragraphs on blank lines only. Single newlines are almost always
// PDF hard-wrap artifacts in stored thesis abstracts, so they collapse to spaces
// and the text reflows naturally at every zoom level (matching the prior render).
function toParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

/** Latin theses use the sans stack; Khmer-dominant abstracts use the serif Khmer face. */
function isKhmerDominant(text: string): boolean {
  const khmer = (text.match(/[ក-៿]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return khmer > latin;
}

function AbstractBody({ paragraphs }: { paragraphs: string[] }) {
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className={index === 0 ? "" : "mt-[0.9em]"}>
          {paragraph}
        </p>
      ))}
    </>
  );
}

export default function ThesisAbstractReader({
  abstract,
  keywords,
  basePath,
  title,
  locale = "en",
}: {
  abstract: string;
  keywords: string[];
  basePath: string;
  title: string;
  /** Page locale — drives the reader header/eyebrow typography and chrome. */
  locale?: string;
}) {
  const t = useTranslations("abstractReader");
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

  const trimmed = abstract.trim();
  const paragraphs = toParagraphs(abstract);
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const readingMinutes = words > 0 ? Math.max(1, Math.round(words / WORDS_PER_MINUTE)) : 0;
  const khmer = trimmed ? isKhmerDominant(trimmed) : false;
  const bodyLang = khmer ? "km" : "en";
  const bodyFont = khmer ? "font-khmer-serif" : "font-sans";
  const contentStyle: ReaderScaleStyle = { "--reader-scale": textSize / 100 };
  const heading = t("heading");

  const body =
    paragraphs.length > 0 ? (
      <AbstractBody paragraphs={paragraphs} />
    ) : (
      <p className="text-text-muted">{t("none")}</p>
    );

  return (
    <article className="max-w-[70ch]">
      {words > 0 && (
        <header className="mb-4 flex flex-wrap items-center gap-3 text-[12px] text-text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {t("minRead", { count: readingMinutes })}
          </span>
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {t("wordCount", { count: words })}
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
        <div
          lang={bodyLang}
          className={`abstract-reader-copy text-text-body ${bodyFont}`}
          style={contentStyle}
        >
          {body}
        </div>
      </div>

      {keywords.length > 0 && (
        <section className="mt-7 border-t border-divider pt-5">
          <KeywordList keywords={keywords} basePath={basePath} heading={t("keywordsHeading")} />
        </section>
      )}

      <ReaderDialog
        open={readerOpen}
        onClose={() => setReaderOpen(false)}
        eyebrow={heading}
        title={title}
        locale={locale}
        textSize={textSize}
        canDecrease={canDecrease}
        canIncrease={canIncrease}
        onDecrease={decreaseTextSize}
        onIncrease={increaseTextSize}
        onReset={resetTextSize}
        returnFocusRef={openReaderButtonRef}
      >
        <div lang={bodyLang} className={bodyFont}>
          {body}
        </div>
      </ReaderDialog>
    </article>
  );
}
