"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Download, Quote } from "lucide-react";
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

export default function CitePublication({ publication }: { publication: Publication }) {
  const t = useTranslations("publicationDetail");
  const [format, setFormat] = useState<CiteFormat>("apa");
  const [copied, setCopied] = useState(false);

  const text = buildPublicationCitation(format, publication);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — user can still select the text */
    }
  };

  const download = () => {
    const { name, mime } = publicationCitationFile(format, publication);
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="gradient-top-border overflow-hidden rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
      <h3 className="mb-3 inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-text-heading">
        <Quote className="h-4 w-4 text-brand" /> {t("citeArticle")}
      </h3>

      {/* Format tabs */}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-bg-app p-1">
        {FORMATS.map((f) => {
          const active = f.id === format;
          return (
            <button key={f.id} type="button" onClick={() => setFormat(f.id)}
              aria-pressed={active}
              className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition-all duration-150 ${
                active
                  ? "bg-brand text-white shadow-sm"
                  : "text-text-muted hover:bg-bg-surface hover:text-text-body"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Citation text */}
      <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-divider bg-bg-app px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-text-body">
        {text}
      </pre>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-divider bg-paper px-3 py-2 text-[12px] font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? t("copied") : t("copy")}
        </button>
        <button
          type="button"
          onClick={download}
          className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-divider bg-paper px-3 py-2 text-[12px] font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand"
        >
          <Download className="h-4 w-4" />
          {format === "bibtex" || format === "ris" ? format.toUpperCase() : "TXT"}
        </button>
      </div>
    </div>
  );
}
