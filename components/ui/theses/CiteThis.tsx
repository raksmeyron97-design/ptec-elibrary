"use client";

import { useState } from "react";
import { Check, Copy, Download, Quote } from "lucide-react";
import {
  buildCitation,
  citationFile,
  type CiteFormat,
} from "@/lib/theses/citation";
import type { ResearchReport } from "@/lib/theses/report-fields";

const FORMATS: { id: CiteFormat; label: string }[] = [
  { id: "apa", label: "APA" },
  { id: "bibtex", label: "BibTeX" },
  { id: "ris", label: "RIS" },
];

export default function CiteThis({
  report,
  reportId,
  compact = false,
}: {
  report: ResearchReport;
  reportId: string;
  /** compact = a small button that expands inline (used in list rows) */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(!compact);
  const [format, setFormat] = useState<CiteFormat>("apa");
  const [copied, setCopied] = useState(false);

  const text = buildCitation(format, report, reportId);

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
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-divider bg-paper px-3 py-1.5 text-[12px] font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand"
      >
        <Quote className="h-3.5 w-3.5" />
        Cite
      </button>
    );
  }

  const panel = (
    <>
      {/* Format tabs */}
      <div className="flex items-center gap-1 rounded-xl bg-bg-app p-1">
        {FORMATS.map((f) => {
          const active = f.id === format;
          return (
            <button key={f.id} type="button" onClick={() => setFormat(f.id)}
              aria-pressed={active}
              className={`flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all duration-150 ${
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
        <button type="button">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied!" : "Copy"}
        </button>
        <button type="button">
          <Download className="h-4 w-4" />
          {format === "apa" ? "TXT" : format.toUpperCase()}
        </button>
      </div>
    </>
  );

  // Compact (expanded inline) wraps the panel in a thin bordered box with a close affordance.
  if (compact) {
    return (
      <div className="mt-3 w-full rounded-xl border border-divider bg-bg-surface p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-text-muted">
            <Quote className="h-3.5 w-3.5" /> Cite this report
          </span>
          <button type="button" onClick={() => setOpen(false)}
            aria-label="Close citation panel"
            className="cursor-pointer text-[12px] font-medium text-text-muted transition-colors hover:text-brand"
          >
            Close
          </button>
        </div>
        {panel}
      </div>
    );
  }

  // Full sidebar card.
  return (
    <div className="gradient-top-border overflow-hidden rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
      <h3 className="mb-3 inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-text-heading">
        <Quote className="h-4 w-4 text-brand" /> Cite this report
      </h3>
      {panel}
    </div>
  );
}
