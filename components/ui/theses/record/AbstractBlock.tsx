"use client";

// The record's abstract, with the shared reader controls (text zoom +
// distraction-free fullscreen reader) and the keywords that search the
// collection. Thesis abstracts are plain text with no inline
// citations, so the body is simple paragraphs — the zoom, fullscreen dialog,
// focus management, and i18n all come from components/ui/reader/*.
//
// A thesis may also carry its abstract in Khmer (`abstract_km`, 0160). Then a
// two-button switch offers both, each named in its own language, and a reader
// on /km starts on the Khmer one. The switch is offered only when the two are
// genuinely different languages: a Khmer abstract stored twice is one abstract.

import { useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Clock, FileText } from "lucide-react";
import { LABEL, SECTION_HEADING } from "./styles";
import { Link } from "@/i18n/navigation";
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

export default function AbstractBlock({
  abstract,
  abstractKm,
  keywords,
  title,
  locale = "en",
}: {
  abstract: string;
  /** The Khmer abstract, when the record has one (0160). */
  abstractKm?: string | null;
  /** Each one searches the theses listing's own keyword facet. */
  keywords: string[];
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

  const primary = abstract.trim();
  const km = abstractKm?.trim() ?? "";
  const bilingual = Boolean(km) && km !== primary && !isKhmerDominant(primary) && isKhmerDominant(km);
  const [showKm, setShowKm] = useState(bilingual && locale === "km");
  const current = bilingual && showKm ? km : abstract;

  const trimmed = current.trim();
  const paragraphs = toParagraphs(current);
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const readingMinutes = words > 0 ? Math.max(1, Math.round(words / WORDS_PER_MINUTE)) : 0;
  const khmer = trimmed ? isKhmerDominant(trimmed) : false;
  const bodyLang = khmer ? "km" : "en";
  const bodyFont = khmer ? "font-kh" : "font-sans";
  const contentStyle: ReaderScaleStyle = { "--reader-scale": textSize / 100 };
  const heading = t("heading");

  const body =
    paragraphs.length > 0 ? (
      <AbstractBody paragraphs={paragraphs} />
    ) : (
      <p className="text-text-muted">{t("none")}</p>
    );

  return (
    <div>
      {/* Heading row: the section title, the reading stats as its caption,
          the language switch and reading controls flush right. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="abstract-heading" className={SECTION_HEADING}>
            {heading}
          </h2>
          {words > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-3 text-[12px] text-text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {t("minRead", { count: readingMinutes })}
              </span>
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                {t("wordCount", { count: words })}
              </span>
            </p>
          )}
        </div>
        {bilingual && (
          <div
            role="group"
            aria-label={t("languageAria")}
            className="inline-flex gap-0.5 rounded-lg border border-reader-control-border bg-bg-surface p-[3px]"
          >
            {([
              [false, t("languageEn"), "en"],
              [true, t("languageKm"), "km"],
            ] as const).map(([isKm, label, lang]) => (
              <button
                key={lang}
                type="button"
                lang={lang}
                aria-pressed={showKm === isKm}
                onClick={() => setShowKm(isKm)}
                className={`min-h-[32px] cursor-pointer rounded-md px-3 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 [&:lang(km)]:font-kh [&:lang(km)]:text-[14px] [&:lang(km)]:font-normal ${
                  showKm === isKm ? "bg-brand text-brand-contrast" : "text-text-muted hover:bg-paper hover:text-text-heading"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
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

      {/* The measure is capped here rather than on the wrapper, so the
          heading row and the keyword list still span the column while the
          running text stays at a readable ~68 characters. */}
      <div className="mt-4 max-w-[68ch]">
        <div
          lang={bodyLang}
          className={`abstract-reader-copy text-text-body ${bodyFont}`}
          style={contentStyle}
        >
          {body}
        </div>
      </div>

      {keywords.length > 0 && (
        <div className="mt-6">
          <h3 className={LABEL}>{t("keywordsHeading")}</h3>
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <li key={kw}>
                <Link
                  href={`/theses?keyword=${encodeURIComponent(kw)}`}
                  className="inline-flex min-h-8 items-center rounded-full border border-border bg-bg-surface px-3 text-[13.5px] font-medium text-text-heading transition-colors duration-150 hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
                >
                  {kw}
                </Link>
              </li>
            ))}
          </ul>
        </div>
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
    </div>
  );
}
