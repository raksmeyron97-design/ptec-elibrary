"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Check, Copy, Download, Quote } from "lucide-react";
import {
  buildCitation,
  citationFile,
  type CiteFormat,
} from "@/lib/theses/citation";
import type { ResearchReport } from "@/lib/theses/report-fields";

const FORMATS: { id: CiteFormat; label: string }[] = [
  { id: "apa", label: "APA" },
  { id: "mla", label: "MLA" },
  { id: "chicago", label: "Chicago" },
  { id: "ieee", label: "IEEE" },
  { id: "bibtex", label: "BibTeX" },
  { id: "ris", label: "RIS" },
];

export default function CiteThis({
  report,
  reportId,
  compact = false,
  institution,
  showRecordNotes = true,
}: {
  report: ResearchReport;
  reportId: string;
  /** compact = a small button that expands inline (used in list rows) */
  compact?: boolean;
  /** Published institution name, threaded from the server (never compiled in). */
  institution: string;
  /**
   * Whether this panel also carries the "unverified record" warning and the
   * "report incorrect details" link.
   *
   * True everywhere this component stands alone — the listing rows and
   * /theses/summary, where nothing else on screen says the record is
   * unverified. The record detail page passes FALSE, because its
   * <RecordStatusCard> owns both, and printing the same warning twice in one
   * sidebar was the duplication that moved them there.
   */
  showRecordNotes?: boolean;
}) {
  const t = useTranslations("cite");
  const [open, setOpen] = useState(!compact);
  const [format, setFormat] = useState<CiteFormat>("apa");
  const [copied, setCopied] = useState(false);

  const text = buildCitation(format, report, reportId, institution);

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
    const { name, mime } = citationFile(format, report);
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (compact && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-divider bg-paper px-3 py-1.5 text-[12px] font-semibold text-text-body transition-colors duration-150 hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
      >
        <Quote className="h-3.5 w-3.5" />
        {t("cite")}
      </button>
    );
  }

  const panel = (
    <>
      {/* Format picker. `aria-pressed` on six buttons announced them as six
          independent toggles; a radiogroup says what this actually is — one
          choice out of six. Wrapping flex rather than a 3-column grid, so
          "Chicago" and "BibTeX" size to their labels instead of forcing every
          cell to the widest one. */}
      <div role="radiogroup" aria-label={t("citeThesis")} className="flex flex-wrap gap-1.5">
        {FORMATS.map((f) => {
          const active = f.id === format;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setFormat(f.id)}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 ${
                active
                  ? "bg-brand text-brand-contrast"
                  : "bg-bg-app text-text-muted hover:text-text-heading"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Citation text */}
      <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-bg-app px-3.5 py-3 font-mono text-[12px] leading-[1.7] text-text-body">
        {text}
      </pre>

      {/* Actions. The copy result is announced through a polite live region
          as well as by the icon swap — otherwise a screen-reader user pressing
          "Copy" gets no confirmation that anything happened. */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-[40px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand px-4 text-[13px] font-bold text-brand-contrast transition-colors duration-150 hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {copied ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          {copied ? t("copied") : t("copy")}
        </button>
        <button
          type="button"
          onClick={download}
          className="inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-divider px-4 text-[13px] font-semibold text-text-body transition-colors duration-150 hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          {format === "bibtex" || format === "ris" ? format.toUpperCase() : "TXT"}
        </button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {copied ? t("copied") : ""}
      </p>

      {showRecordNotes && !report.verified_at && (
        // Status SURFACE tokens, not a hand-written amber triplet plus a
        // second `dark:` one — the pairing lib/status-tokens.test.ts exists to
        // keep.
        <p className="mt-3 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-[12px] leading-[1.6] text-warning-text">
          {t("unverifiedNote")}
        </p>
      )}

      {showRecordNotes && (
        // Routes readers who spot bad metadata to the contact form with the
        // record pre-identified (the form clamps subject to its 200-char max).
        <Link
          href={{
            pathname: "/contact",
            query: {
              subject: `Incorrect record details: ${report.title ?? reportId}`.slice(0, 200),
              category: "other",
            },
          }}
          className="mt-3 inline-block rounded-sm text-[12px] font-semibold text-text-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          {t("reportMetadata")}
        </Link>
      )}

    </>
  );

  // Compact (expanded inline) wraps the panel in a thin bordered box with a close affordance.
  if (compact) {
    return (
      <div className="mt-3 w-full rounded-xl border border-divider bg-bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-text-muted">
            <Quote className="h-3.5 w-3.5" /> {t("citeThesis")}
          </span>
          <button type="button" onClick={() => setOpen(false)}
            aria-label={t("closeAria")}
            className="cursor-pointer rounded-sm text-[12px] font-medium text-text-muted transition-colors duration-150 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          >
            {t("close")}
          </button>
        </div>
        {panel}
      </div>
    );
  }

  // Full sidebar card.
  return (
    <section
      aria-labelledby="cite-heading"
      className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm"
    >
      <h2
        id="cite-heading"
        className="mb-4 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted"
      >
        {t("citeThesis")}
      </h2>
      {panel}
    </section>
  );
}
