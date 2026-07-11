"use client";

// Structured reference list for publication detail pages. Every reference is
// a citation target (#reference-<id>) and links back to each inline citation
// that cites it. All items stay in the DOM even while the list is collapsed,
// so fragment navigation from citations always has a real target — the list
// expands itself before scrolling when the target is in the hidden tail.

import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown, ChevronUp, Copy, CornerLeftUp, ExternalLink } from "lucide-react";
import type { PublicationReference } from "@/lib/publications";
import {
  getReferenceTargetId,
  type CitationOccurrence,
} from "@/lib/publications/citations";

const COLLAPSE_THRESHOLD = 10;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Turn bare URLs inside a reference string into anchors. */
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

function copyText(reference: PublicationReference): string {
  const link = reference.url ?? (reference.doi ? `https://doi.org/${reference.doi}` : null);
  return link && !reference.text.includes(link) ? `${reference.text} ${link}` : reference.text;
}

function ReferenceRow({
  reference,
  number,
  hidden,
  backlinks,
}: {
  reference: PublicationReference;
  number: number;
  hidden: boolean;
  backlinks: CitationOccurrence[];
}) {
  const t = useTranslations("publicationDetail");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText(reference));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — non-fatal */
    }
  };

  return (
    <li
      id={getReferenceTargetId(reference.id)}
      tabIndex={-1}
      hidden={hidden}
      className="group flex scroll-mt-24 items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 text-[13.5px] leading-relaxed text-text-body transition-colors duration-150 target:border-brand/40 target:bg-brand/5 hover:border-divider hover:bg-bg-app focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/8 text-[10px] font-bold text-brand"
      >
        {number}
      </span>
      <div className="min-w-0 flex-1">
        <span className="sr-only">{t("citationReference", { number })}: </span>
        <span className="break-words">{linkify(reference.text)}</span>
        {(reference.doi || reference.url || backlinks.length > 0) && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {reference.doi && (
              <a
                href={`https://doi.org/${reference.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-divider px-2 py-0.5 text-[11px] font-medium text-text-muted transition-colors hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                DOI: {reference.doi}
              </a>
            )}
            {reference.url && !reference.text.includes(reference.url) && (
              <a
                href={reference.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-divider px-2 py-0.5 text-[11px] font-medium text-text-muted transition-colors hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                {t("referenceSource")}
              </a>
            )}
            {backlinks.map((occurrence, position) => (
              <a
                key={occurrence.citationId}
                href={`#${occurrence.citationId}`}
                aria-label={t("referenceBackToText", { position: position + 1 })}
                className="inline-flex min-h-6 items-center gap-0.5 rounded-full px-1.5 text-[11px] font-semibold text-brand transition-colors hover:bg-brand/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
              >
                <CornerLeftUp className="h-3 w-3" aria-hidden="true" />
                {backlinks.length > 1 ? String.fromCharCode(97 + position) : null}
              </a>
            ))}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={t("referenceCopy")}
        title={t("referenceCopy")}
        className="shrink-0 cursor-pointer rounded-md p-1 text-text-muted opacity-0 transition-all duration-150 group-hover:opacity-100 hover:text-brand focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
    </li>
  );
}

export default function ReferencesSection({
  references,
  occurrences,
}: {
  references: PublicationReference[];
  occurrences: CitationOccurrence[];
}) {
  const t = useTranslations("publicationDetail");
  const listRef = useRef<HTMLOListElement>(null);
  const [expanded, setExpanded] = useState(false);
  const shouldCollapse = references.length > COLLAPSE_THRESHOLD;

  // Citation links (#reference-…) must reveal a target hidden in the
  // collapsed tail before the browser can scroll to and focus it.
  useEffect(() => {
    const revealHashTarget = () => {
      const hash = window.location.hash.slice(1);
      if (!hash.startsWith("reference-")) return;
      const target = document.getElementById(hash);
      if (!target || !listRef.current?.contains(target)) return;
      if (target.hidden) setExpanded(true);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          target.scrollIntoView({
            block: "center",
            behavior: prefersReducedMotion() ? "auto" : "smooth",
          });
          target.focus({ preventScroll: true });
        }),
      );
    };
    revealHashTarget();
    window.addEventListener("hashchange", revealHashTarget);
    return () => window.removeEventListener("hashchange", revealHashTarget);
  }, []);

  if (references.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-divider px-4 py-8 text-center text-[14px] text-text-muted">
        {t("referencesEmpty")}
      </p>
    );
  }

  return (
    <div>
      <ol ref={listRef} className="space-y-1.5">
        {references.map((reference, index) => (
          <ReferenceRow
            key={reference.id}
            reference={reference}
            number={index + 1}
            hidden={shouldCollapse && !expanded && index >= COLLAPSE_THRESHOLD}
            backlinks={occurrences.filter((o) => o.reference.id === reference.id)}
          />
        ))}
      </ol>
      {shouldCollapse && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-brand transition-colors hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          {expanded ? (
            <>
              <ChevronUp className="h-4 w-4" aria-hidden="true" /> {t("showFewerReferences")}
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" aria-hidden="true" /> {t("showAllReferences", { count: references.length })}
            </>
          )}
        </button>
      )}
    </div>
  );
}
