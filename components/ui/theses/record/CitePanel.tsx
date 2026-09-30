"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Download } from "lucide-react";
import type { CitationEntry } from "@/lib/theses/record";
import { ANCHOR_OFFSET, BUTTON_QUIET, BUTTON_SECONDARY, LABEL } from "./styles";

/**
 * Cite this thesis: six formats, one copy, one export.
 *
 * Every citation is rendered on the server (lib/theses/record.ts) and arrives
 * here as a string. The panel it replaces was handed the whole database row to
 * format in the browser, which put the row's `file_url` — a storage address
 * that answers without the Top-10 or sign-in gate — into every page's payload.
 *
 * The formats are a tablist: arrow keys move between them, one Tab reaches
 * the text. Prose styles read as prose; BibTeX and RIS are code for a
 * reference manager, with a line saying which.
 */
export default function CitePanel({ citations, permalink }: { citations: CitationEntry[]; permalink: string }) {
  const t = useTranslations("thesisDetail");
  const tCite = useTranslations("cite");
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = citations[index];
  if (!current) return null;

  const select = (next: number) => {
    const i = (next + citations.length) % citations.length;
    setIndex(i);
    setCopied(false);
    tabs.current[i]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") select(index + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") select(index - 1);
    else if (event.key === "Home") select(0);
    else if (event.key === "End") select(citations.length - 1);
    else return;
    event.preventDefault();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(current.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the text can still be selected */
    }
  };

  const exportFile = () => {
    const url = URL.createObjectURL(new Blob([current.text], { type: current.file.mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = current.file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const extension = current.file.name.split(".").pop()?.toUpperCase() ?? "TXT";
  const hint = current.format === "bibtex" ? t("citeHintBibtex") : current.format === "ris" ? t("citeHintRis") : null;

  return (
    <section
      id="cite"
      aria-labelledby="cite-heading"
      className={`rounded-xl border border-border bg-bg-surface p-5 ${ANCHOR_OFFSET}`}
    >
      <h2 id="cite-heading" className={LABEL}>
        {tCite("citeThesis")}
      </h2>

      <div role="tablist" aria-label={t("citeFormats")} className="mt-3 flex flex-wrap gap-0.5" onKeyDown={onKeyDown}>
        {citations.map((c, i) => (
          <button
            key={c.format}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`cite-tab-${c.format}`}
            aria-selected={i === index}
            aria-controls="cite-panel"
            tabIndex={i === index ? 0 : -1}
            onClick={() => select(i)}
            className={`min-h-8 cursor-pointer rounded-md px-2.5 text-[13px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 ${
              i === index ? "bg-brand text-brand-contrast" : "text-text-muted hover:bg-paper hover:text-text-heading"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div id="cite-panel" role="tabpanel" aria-labelledby={`cite-tab-${current.format}`} tabIndex={0} className="mt-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50">
        {current.code ? (
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-paper px-4 py-3 font-mono text-[12.5px] leading-5 text-text-heading">
            {current.text}
          </pre>
        ) : (
          <p className="rounded-lg bg-paper px-4 py-3 text-[14px] leading-[22px] text-text-heading [overflow-wrap:anywhere]">
            {current.text}
          </p>
        )}
      </div>
      {hint && <p className="mt-2 text-[12.5px] leading-[18px] text-text-muted">{hint}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={copy} className={`${BUTTON_SECONDARY} flex-1`}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? tCite("copied") : tCite("copy")}
        </button>
        <button type="button" onClick={exportFile} className={BUTTON_QUIET}>
          <Download aria-hidden="true" />
          {t("citeExport", { ext: extension })}
        </button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {copied ? tCite("copied") : ""}
      </p>

      <div className="mt-4 grid gap-1 border-t border-divider pt-3">
        <p className={LABEL}>{t("permalink")}</p>
        <code className="select-all font-mono text-[12.5px] leading-[18px] text-text-heading [overflow-wrap:anywhere]">
          {permalink}
        </code>
      </div>
    </section>
  );
}
