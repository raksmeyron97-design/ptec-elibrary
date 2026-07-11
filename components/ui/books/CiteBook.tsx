"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Check, Copy, Download, Quote } from "lucide-react";
import {
  buildBookCitation,
  bookCitationFile,
  type CiteFormat,
} from "@/lib/books/citation";
import type { Book } from "@/lib/book-utils";

const FORMATS: { id: CiteFormat; label: string }[] = [
  { id: "apa",    label: "APA" },
  { id: "bibtex", label: "BibTeX" },
  { id: "ris",    label: "RIS" },
];

export default function CiteBook({ book }: { book: Book }) {
  const t = useTranslations("cite");
  const [format, setFormat] = useState<CiteFormat>("apa");
  const [copied, setCopied] = useState(false);

  const text = buildBookCitation(format, book);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  const download = () => {
    const { name, mime } = bookCitationFile(format, book);
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
        <Quote className="h-4 w-4 text-brand" /> {t("citeBook")}
      </h3>

      {/* Format tabs */}
      <div className="flex items-center gap-1 rounded-xl bg-bg-app p-1">
        {FORMATS.map((f) => {
          const active = f.id === format;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFormat(f.id)}
              aria-pressed={active}
              className={`flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all duration-150 ${
                active
                  ? "bg-brand text-brand-contrast shadow-sm"
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

      {/* Records a librarian hasn't verified may carry imported/placeholder
          metadata — warn instead of presenting the citation as authoritative. */}
      {!book.verifiedAt && (
        <p className="mt-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
          {t("unverifiedNote")}
        </p>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-divider bg-paper px-3 py-1.5 text-[12px] font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t("copied") : t("copy")}
        </button>
        <button
          type="button"
          onClick={download}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-divider bg-paper px-3 py-1.5 text-[12px] font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand"
        >
          <Download className="h-3.5 w-3.5" />
          {format === "apa" ? "TXT" : format.toUpperCase()}
        </button>
      </div>

      {/* Route readers who spot bad metadata to the contact form with the
          record pre-identified (the form clamps subject to its 200-char max). */}
      <Link
        href={{
          pathname: "/contact",
          query: { subject: `Incorrect record details: ${book.title}`.slice(0, 200), category: "other" },
        }}
        className="mt-3 inline-block text-[11.5px] font-medium text-text-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-brand"
      >
        {t("reportMetadata")}
      </Link>
    </div>
  );
}
