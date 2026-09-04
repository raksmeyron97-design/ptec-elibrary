"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { apa, chicago, inTextReference, mla, type CitationWork } from "@/lib/citations";
import ReaderModal from "./ReaderModal";

export type ReaderCitationSource = { work: CitationWork; verified: boolean };

type Style = "apa" | "mla" | "chicago";
const STYLES: { id: Style; label: string }[] = [
  { id: "apa", label: "APA 7" },
  { id: "mla", label: "MLA" },
  { id: "chicago", label: "Chicago" },
];

type CopyWhat = "citation" | "page" | "doi";

function CopyButton({
  what,
  value,
  label,
  copied,
  copiedLabel,
  onCopy,
}: {
  what: CopyWhat;
  value: string;
  label: string;
  copied: CopyWhat | null;
  copiedLabel: string;
  onCopy: (what: CopyWhat, value: string) => void;
}) {
  return (
    <button type="button" onClick={() => onCopy(what, value)} className="reader-btn reader-btn--outline px-3">
      {copied === what ? <Check className="reader-success h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      {copied === what ? copiedLabel : label}
    </button>
  );
}

function format(style: Style, work: CitationWork): string {
  if (style === "mla") return mla(work);
  if (style === "chicago") return chicago(work);
  return apa(work);
}

/* Cite from inside the reader: the same metadata and the same formatters the
   book page's "Cite this book" uses, plus a page reference for the page the
   reader is on, and the DOI when the record has one. Nothing is invented. */
export default function ReaderCitation({
  open,
  onClose,
  source,
  page,
  fmt,
}: {
  open: boolean;
  onClose: () => void;
  source: ReaderCitationSource;
  page: number;
  fmt: (n: number | string) => string;
}) {
  const t = useTranslations("reader");
  const cite = useTranslations("cite");
  const [style, setStyle] = useState<Style>("apa");
  const [copied, setCopied] = useState<CopyWhat | null>(null);

  const text = format(style, source.work);
  const pageRef = inTextReference(source.work, page);
  const copy = async (what: CopyWhat, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      window.setTimeout(() => setCopied((c) => (c === what ? null : c)), 1600);
    } catch {
      /* clipboard blocked — nothing to do */
    }
  };
  return (
    <ReaderModal open={open} onClose={onClose} title={t("citeThisBook")} size="md">
      <div role="radiogroup" aria-label={t("citationStyle")} className="reader-cluster mb-3 flex w-full">
        {STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={style === s.id}
            onClick={() => setStyle(s.id)}
            className={`reader-btn flex-1 ${style === s.id ? "reader-btn--active" : ""}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <pre className="reader-input max-h-40 overflow-auto whitespace-pre-wrap break-words py-3 font-mono text-[12px] leading-relaxed">
        {text}
      </pre>
      {!source.verified && (
        <p className="reader-muted mt-2 text-[12px] leading-5">{cite("unverifiedNote")}</p>
      )}
      <p className="reader-faint mt-3 text-[11px]">{t("page")} {fmt(page)} · {pageRef}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton what="citation" value={text} label={t("copyCitation")} copied={copied} copiedLabel={t("copied")} onCopy={copy} />
        <CopyButton what="page" value={pageRef} label={t("copyPageReference")} copied={copied} copiedLabel={t("copied")} onCopy={copy} />
        {source.work.doi && (
          <CopyButton what="doi" value={source.work.doi} label={t("copyDoi")} copied={copied} copiedLabel={t("copied")} onCopy={copy} />
        )}
      </div>
    </ReaderModal>
  );
}
