"use client";

import { Fragment, useState } from "react";
import { Check, Copy } from "lucide-react";

/** Turn bare URLs and doi.org links inside a reference string into anchors. */
function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-sm text-brand underline decoration-brand/30 underline-offset-2 transition-colors hover:decoration-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
      >
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

function ReferenceRow({ index, reference }: { index: number; reference: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — non-fatal */
    }
  };

  return (
    <li className="group flex items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 text-[13.5px] leading-relaxed text-text-body transition-colors duration-150 hover:border-divider hover:bg-bg-app">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/8 text-[10px] font-bold text-brand">
        {index + 1}
      </span>
      <span className="min-w-0 flex-1 break-words">{linkify(reference)}</span>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy reference"
        title="Copy reference"
        className="shrink-0 cursor-pointer rounded-md p-1 text-text-muted opacity-0 transition-all duration-150 group-hover:opacity-100 hover:text-brand focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </li>
  );
}

export default function ReferenceList({ references }: { references: string[] }) {
  if (!references.length) {
    return (
      <div className="fade-rise-in flex flex-col items-center gap-3 py-10 text-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-10 w-10 text-text-muted/30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-[14px] text-text-muted">
          No references have been added for this report.
        </p>
      </div>
    );
  }

  return (
    <ol className="space-y-1.5">
      {references.map((ref, i) => (
        <ReferenceRow key={i} index={i} reference={ref} />
      ))}
    </ol>
  );
}
