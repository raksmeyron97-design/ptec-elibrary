"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Download } from "lucide-react";
import {
  buildPublicationCitation,
  publicationCitationFile,
  type CiteFormat,
} from "@/lib/citations";
import type { Publication } from "@/lib/publications";

const FORMATS: { id: CiteFormat; label: string }[] = [
  { id: "apa", label: "APA" },
  { id: "mla", label: "MLA" },
  { id: "chicago", label: "Chicago" },
  { id: "ieee", label: "IEEE" },
  { id: "bibtex", label: "BibTeX" },
  { id: "ris", label: "RIS" },
];

/**
 * The citation builder: six formats, the formatted text, copy and download.
 *
 * Chrome-less on purpose — it is hosted by CiteArticleDialog. It used to be a
 * card in the article's side rail, which on a phone sat between the abstract
 * and the rest of the article; a reader who wanted a citation now opens it
 * from the Cite button they pressed, and everyone else never scrolls past it.
 * Every string it prints comes from lib/citations.ts — nothing is formatted
 * here.
 */
export default function CitePublication({ publication }: { publication: Publication }) {
  const t = useTranslations("publicationDetail");
  const [format, setFormat] = useState<CiteFormat>("apa");
  const [copied, setCopied] = useState(false);

  const text = buildPublicationCitation(format, publication);
  const file = publicationCitationFile(format, publication);
  const ext = file.name.split(".").pop() ?? "txt";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the text is selectable */
    }
  };

  const download = () => {
    const blob = new Blob([text], { type: file.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* Toggle buttons with aria-pressed: one choice among six, each a
          real button in the tab order. */}
      <div role="group" aria-label={t("citeFormatLabel")} className="flex flex-wrap gap-1.5">
        {FORMATS.map((f) => {
          const active = f.id === format;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFormat(f.id)}
              aria-pressed={active}
              className={`min-h-9 cursor-pointer rounded-lg border px-3 text-[13px] font-semibold transition-colors duration-150 ${
                active
                  ? "border-brand bg-brand text-brand-contrast"
                  : "border-divider bg-bg-surface text-text-body hover:border-brand/40 hover:text-brand"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <pre
        tabIndex={0}
        aria-label={FORMATS.find((f) => f.id === format)?.label}
        className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-divider bg-paper px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-text-body"
      >
        {text}
      </pre>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[14px] font-bold text-brand-contrast transition-colors hover:bg-brand-hover"
        >
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? t("copied") : t("copy")}
        </button>
        <button
          type="button"
          onClick={download}
          className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-divider bg-bg-surface px-4 text-[14px] font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {t("citeDownloadFile", { ext })}
        </button>
      </div>
      <p aria-live="polite" className="sr-only">
        {copied ? t("copied") : ""}
      </p>
    </div>
  );
}
