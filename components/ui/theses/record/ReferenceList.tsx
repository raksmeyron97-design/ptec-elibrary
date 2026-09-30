"use client";

import { Fragment, useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { useTranslations } from "next-intl";

/** How many references show before "Show all". A long list is the tail of
 *  the reading card; ten tells a reader what kind of sources it drew on. */
const INITIAL = 10;

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
  const t = useTranslations("thesisDetail");
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
    <li className="group grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-x-3 border-b border-divider py-2.5 last:border-b-0">
      <span aria-hidden="true" className="text-right text-[12px] font-semibold leading-[22px] tabular-nums text-text-muted">
        {index + 1}
      </span>
      <span className="min-w-0 break-words text-[14px] leading-[22px] text-text-body">{linkify(reference)}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? t("referenceCopied") : t("copyReference")}
        className="shrink-0 cursor-pointer rounded-md p-1.5 text-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:text-brand focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 [@media(hover:none)]:opacity-100"
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

/**
 * The thesis's numbered reference list. Long lists show the first ten with a
 * "Show all" control. The rest are in the HTML from the start (hidden, not
 * fetched later), so the page's markup always carries the whole list.
 */
export default function ReferenceList({ references }: { references: string[] }) {
  const t = useTranslations("thesisDetail");
  const [expanded, setExpanded] = useState(false);
  const collapsible = references.length > INITIAL;

  return (
    <>
      <ol className="mt-4">
        {references.map((ref, i) => (
          <Fragment key={i}>
            {collapsible && !expanded && i >= INITIAL ? (
              <li hidden>{ref}</li>
            ) : (
              <ReferenceRow index={i} reference={ref} />
            )}
          </Fragment>
        ))}
      </ol>
      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-3 inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13.5px] font-semibold text-brand transition-colors duration-150 hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-150 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
          {expanded ? t("referencesShowFewer") : t("referencesShowAll", { count: references.length })}
        </button>
      )}
    </>
  );
}
