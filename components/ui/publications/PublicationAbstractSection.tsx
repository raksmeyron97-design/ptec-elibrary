"use client";

// Publication-specific abstract with expand/collapse and linked inline
// citations. Deliberately separate from the shared detail AbstractSection so
// thesis pages keep their existing behavior.
//
// The full abstract always stays in the DOM (collapse is pure CSS clipping),
// so SEO, printing (print: overrides), no-JS readers (noscript override), and
// citation fragment anchors all see the complete text.
//
// The same rule governs the LANGUAGE switch. A bilingual record used to print
// both abstracts one below the other, so a reader who could read one of them
// still paid the other's height before reaching the rest of the article. Only
// one is visible now, but the other is `hidden` — still in the DOM — because
// everything above depends on it being there: a crawler, the print stylesheet,
// a reader without JavaScript, and the reference back-links that point INTO
// whichever abstract cited them.

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
import AbstractLanguageSwitch from "@/components/ui/publications/AbstractLanguageSwitch";
import AbstractReaderDialog from "@/components/ui/publications/AbstractReaderDialog";
import AcademicText from "@/components/ui/publications/AcademicText";
import ArticleSectionHeading from "@/components/ui/publications/article/ArticleSectionHeading";
import ReaderToolbar from "@/components/ui/reader/ReaderToolbar";
import { useReaderPreferences } from "@/components/ui/reader/useReaderPreferences";
import type { PublicationReference } from "@/lib/publications";
import { academicTextToPlainText } from "@/lib/publications/citations";
import {
  resolveAbstractLanguage,
  wordCountIsMeaningful,
  type AbstractLang,
} from "@/lib/publications/abstract-language";

const WORDS_PER_MINUTE = 200;
// Only a genuinely long abstract is ever clipped, and the decision is made on
// its LENGTH, not on how many lines it happens to wrap to.
//
// It used to be a 14-line height cap. That rendered a normal abstract whole
// on a laptop and clipped the same abstract on a phone, where 14 lines is ~80
// words: the live 86-word abstract arrived behind "Show more" at 375 px. A
// scholarly abstract runs 150-300 words; past ~2,400 characters (≈400 words,
// or a long Khmer abstract) it is long enough that the rest of the article
// deserves to be reachable, and the block folds to 28 lines.
const LONG_ABSTRACT_CHARS = 2400;
// Stable ids: the language switch names the panel it governs, the no-JS
// stylesheet reveals both, and the reference back-links are resolved by
// asking which panel CONTAINS the target. The section renders once per page.
const PANEL_ID = { en: "abstract-panel-en", km: "abstract-panel-km" } as const;
const LANGUAGE_SWITCH_ID = "abstract-language-switch";
const COLLAPSED_MAX_HEIGHT = "49em";

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
  collapsible,
}: {
  text: string;
  references: PublicationReference[];
  sourceId: string;
  lang: "en" | "km";
  languageLabel: string;
  textSize: number;
  className?: string;
  /** Whether this block is long enough to fold at all. */
  collapsible: boolean;
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
    ...(expanded || !collapsible ? {} : { maxHeight: COLLAPSED_MAX_HEIGHT }),
  };

  // Only show the control when the collapsed block actually clips content.
  useLayoutEffect(() => {
    if (expanded) return; // keep the last collapsed measurement
    const el = contentRef.current;
    if (!el || !collapsible) {
      setOverflowing(false);
      return;
    }
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, text, collapsible]);

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
          className={`abstract-reader-copy abstract-reader-copy--article overflow-hidden text-text-body print:!max-h-none ${className}`}
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
            className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-bg-surface to-transparent print:hidden"
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
  /** Page locale: it decides which language OPENS. Both stay in the DOM. */
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

  // Pure, and shared with nothing else on the page: which language opens, and
  // whether the reader is offered a choice at all.
  const choice = resolveAbstractLanguage(abstract, abstractKm, locale);
  const [activeLang, setActiveLang] = useState<AbstractLang>(choice.active);
  // The effects below read the current language without re-subscribing.
  const activeLangRef = useRef(activeLang);
  const [announceLang, setAnnounceLang] = useState(false);

  const selectLang = (lang: AbstractLang) => {
    activeLangRef.current = lang;
    setActiveLang(lang);
    setAnnounceLang(true);
  };

  // A reference back-link points INTO one of the two abstracts, and the one it
  // points into may be the language currently folded away. Following it has to
  // bring that language forward — otherwise the link silently does nothing,
  // which is the same defect the collapse used to have before it learned to
  // reveal its own hash target.
  useEffect(() => {
    const revealLanguageOfHashTarget = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const target = document.getElementById(hash);
      if (!target) return;
      const holder = (["en", "km"] as const).find((lang) =>
        document.getElementById(PANEL_ID[lang])?.contains(target),
      );
      if (!holder || holder === activeLangRef.current) return;
      activeLangRef.current = holder;
      setActiveLang(holder);
      // Two frames: the first lets React commit the reveal, the second scrolls
      // to an element that is now actually laid out. Scrolling to a `hidden`
      // element is a no-op, which is why the block's own reveal is not enough.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          target.scrollIntoView({
            block: "center",
            behavior: prefersReducedMotion() ? "auto" : "smooth",
          });
          target.focus?.({ preventScroll: true });
        }),
      );
    };
    revealLanguageOfHashTarget();
    window.addEventListener("hashchange", revealLanguageOfHashTarget);
    return () => window.removeEventListener("hashchange", revealLanguageOfHashTarget);
  }, []);

  // The meter describes the text on show. It used to be computed from the
  // English abstract whichever language was leading, so a Khmer reader was told
  // how long a paragraph they were not looking at would take.
  const meterText = activeLang === "km" ? abstractKm ?? "" : abstract;
  const plain = meterText ? academicTextToPlainText(meterText, references) : "";
  const words = plain ? plain.split(/\s+/).filter(Boolean).length : 0;
  const readingMinutes = words > 0 ? Math.max(1, Math.round(words / WORDS_PER_MINUTE)) : 0;
  const showMeter = words > 0 && wordCountIsMeaningful(activeLang);

  const englishBlock = abstract ? (
    <ExpandableAcademicBlock
      text={abstract}
      references={references}
      sourceId="abstract-en"
      lang="en"
      languageLabel={t("abstractEnglish")}
      textSize={textSize}
      className="font-sans"
      collapsible={abstract.length > LONG_ABSTRACT_CHARS}
    />
  ) : null;

  const khmerBlock = abstractKm ? (
    <ExpandableAcademicBlock
      text={abstractKm}
      references={references}
      sourceId="abstract-km"
      lang="km"
      languageLabel={t("abstractKhmer")}
      textSize={textSize}
      className="font-khmer-serif"
      collapsible={abstractKm.length > LONG_ABSTRACT_CHARS}
    />
  ) : null;

  return (
    <article className="max-w-[70ch]">
      {/* Heading first, then the reading cost. The word count used to sit
          above the heading, so the section opened on "6 min read · 1,166
          words" and only then said what was being read. */}
      <ArticleSectionHeading
        id="abstract-heading"
        className="mb-3"
        aside={
          <ReaderToolbar
            textSize={textSize}
            canDecrease={canDecrease}
            canIncrease={canIncrease}
            onDecrease={decreaseTextSize}
            onIncrease={increaseTextSize}
            onReset={resetTextSize}
            mode="inline"
            // One "Aa" beside the heading rather than a four-button strip: the
            // heading of the section a reader came for should outweigh the
            // control that resizes it.
            variant="compact"
            onOpen={() => setReaderOpen(true)}
            announce={!readerOpen}
            actionButtonRef={openReaderButtonRef}
          />
        }
      >
        {heading}
      </ArticleSectionHeading>

      {/* One meta line about the text you are about to read: which language it
          is in, then how long it is. The switch is FIRST and stays put — right
          -aligning it against the meter looked balanced until you pressed it,
          because the meter is withheld for Khmer and the control then jumped
          across the row. */}
      {(choice.switchable || showMeter) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          {choice.switchable && (
            <div id={LANGUAGE_SWITCH_ID}>
              <AbstractLanguageSwitch
                active={activeLang}
                onChange={selectLang}
                groupLabel={t("abstractLanguageLabel")}
                options={[
                  {
                    lang: "en",
                    label: t("abstractLanguageEnShort"),
                    name: t("abstractEnglish"),
                    controls: PANEL_ID.en,
                  },
                  {
                    lang: "km",
                    label: t("abstractLanguageKmShort"),
                    name: t("abstractKhmer"),
                    controls: PANEL_ID.km,
                  },
                ]}
              />
            </div>
          )}
          {showMeter && (
            <p className="flex flex-wrap items-center gap-3 text-[12px] text-text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {t("abstractMinRead", { count: readingMinutes })}
              </span>
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                {t("abstractWordCount", { count: words })}
              </span>
            </p>
          )}
        </div>
      )}

      <div className="mt-3">
        {choice.none ? (
          <p className="text-[15px] text-text-muted">{t("abstractNone")}</p>
        ) : (
          <>
            {/* DOM order is the reader's language first, so a screen reader
                and a no-JS browser both meet the useful one first. */}
            {(activeLang === "km" ? ["km", "en"] : ["en", "km"] as const).map((lang) => {
              const block = lang === "km" ? khmerBlock : englishBlock;
              if (!block) return null;
              const hidden = choice.switchable && lang !== activeLang;
              return (
                <div
                  key={lang}
                  id={PANEL_ID[lang as AbstractLang]}
                  hidden={hidden}
                  // On paper there is no control to switch with, so both
                  // languages print — the record is bilingual either way.
                  className={hidden ? "print:!block" : undefined}
                >
                  <h3 className="sr-only">
                    {lang === "km" ? t("abstractKhmer") : t("abstractEnglish")}
                  </h3>
                  {block}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Without JavaScript the switch cannot switch, so it is removed and
          both languages are shown — the pre-switch behaviour exactly. */}
      <noscript>
        <style>
          {`#${PANEL_ID.en},#${PANEL_ID.km}{display:block!important}#${LANGUAGE_SWITCH_ID}{display:none!important}`}
        </style>
      </noscript>

      {/* Polite live text, not a second role="status": the toolbar already owns
          one on this section, and two status regions on one heading is two
          things competing to be read. Announced only after a real choice — on
          load it would describe a state the reader never asked for. */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announceLang
          ? activeLang === "km"
            ? t("abstractShowingKhmer")
            : t("abstractShowingEnglish")
          : ""}
      </span>

      <AbstractReaderDialog
        open={readerOpen}
        onClose={() => setReaderOpen(false)}
        publicationTitle={publicationTitle}
        heading={heading}
        abstract={abstract}
        abstractKm={abstractKm}
        references={references}
        locale={locale}
        activeLang={activeLang}
        onLangChange={selectLang}
        switchable={choice.switchable}
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
