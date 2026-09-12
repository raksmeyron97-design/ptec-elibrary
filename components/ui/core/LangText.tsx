import type { ElementType, ReactNode } from "react";
import { langFor, splitBilingual } from "@/lib/i18n/script";

/**
 * Renders a string with a `lang` attribute when its script disagrees with the
 * page locale — so a Khmer title on an English page is announced in Khmer and
 * picks up the Khmer typography rules (`[lang="km"]` in globals.css), and an
 * English subtitle on the Khmer page is not read with a Khmer voice.
 *
 * Server-safe: no hooks, no client boundary. Pass the active locale in.
 */
export function LangText({
  text,
  locale,
  as: Tag = "span",
  className,
}: {
  text: string | null | undefined;
  locale: string;
  as?: ElementType;
  className?: string;
}) {
  if (!text) return null;
  const lang = langFor(text, locale);
  return (
    <Tag lang={lang ?? undefined} className={className}>
      {text}
    </Tag>
  );
}

/**
 * A " / "-joined bilingual field rendered as two runs, each in its own
 * language, with the page locale's half FIRST. The separator is decorative
 * and hidden from assistive tech: "ខ្មែរ slash English" is not a sentence.
 */
export function Bilingual({
  value,
  locale,
  separator = " · ",
  className,
}: {
  value: string | null | undefined;
  locale: string;
  separator?: ReactNode;
  className?: string;
}) {
  const { km, en } = splitBilingual(value);
  if (!km && !en) return null;
  const first = locale === "km" ? km : en;
  const second = locale === "km" ? en : km;
  const firstLang = locale === "km" ? "km" : "en";
  const secondLang = locale === "km" ? "en" : "km";
  return (
    <span className={className}>
      {first && <span lang={firstLang}>{first}</span>}
      {first && second && <span aria-hidden="true">{separator}</span>}
      {second && <span lang={secondLang}>{second}</span>}
    </span>
  );
}
