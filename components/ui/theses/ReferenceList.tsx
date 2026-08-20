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
    // Hanging indent, the way a printed bibliography sets one: the number is a
    // fixed 2rem gutter and the entry wraps flush under itself, so the eye can
    // run down the left edge of the citations. The number is zero-padded and
    // tabular so 9 and 10 keep the same width.
    <li className="group grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-3 rounded-lg px-2 py-2.5 transition-colors duration-150 hover:bg-bg-app">
      <span
        aria-hidden="true"
        className="pt-px text-[12px] font-semibold tabular-nums text-text-muted"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="min-w-0 break-words text-[13.5px] leading-[1.7] text-text-body">
        {linkify(reference)}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Reference copied" : "Copy reference"}
        className="shrink-0 cursor-pointer rounded-md p-1.5 text-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:text-brand focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    </li>
  );
}

export default function ReferenceList({ references }: { references: string[] }) {
  if (!references.length) {
    // An empty state, not an error: most student deposits arrive without a
    // structured reference list, and library staff add one during
    // verification. Left-aligned and compact — a centred illustration for a
    // routine absence gives it more weight than it deserves.
    return (
      <p className="rounded-xl border border-dashed border-divider px-4 py-5 text-[13.5px] leading-[1.6] text-text-muted">
        No structured reference list has been recorded for this thesis yet.
        Library staff add references while verifying a record.
      </p>
    );
  }

  return (
    <ol className="-mx-2">
      {references.map((ref, i) => (
        <ReferenceRow key={i} index={i} reference={ref} />
      ))}
    </ol>
  );
}
