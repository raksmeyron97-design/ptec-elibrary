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
        className="break-all rounded-sm text-brand underline decoration-brand/30 underline-offset-2 transition-colors hover:decoration-brand"
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
      // A bibliography, not a stack of cards: a hanging number, the entry,
      // and its links on one quiet line under it. The :target tint is what a
      // reader lands on from an inline citation.
      className="group -mx-2 flex scroll-mt-24 items-start gap-3 rounded-lg px-2 py-3 text-[14.5px] leading-[1.65] text-text-body target:bg-brand/5 focus:outline-none [&:lang(km)]:leading-[1.9]"
    >
      <span aria-hidden="true" className="w-7 shrink-0 pt-px text-right text-[13px] font-semibold tabular-nums text-text-muted">
        {number}.
      </span>
      <div className="min-w-0 flex-1">
        <span className="sr-only">{t("citationReference", { number })}: </span>
        <span className="break-words">{linkify(reference.text)}</span>
        {(reference.doi || reference.url || backlinks.length > 0) && (
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
            {reference.doi && (
              <a
                href={`https://doi.org/${reference.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-6 items-center gap-1 break-all font-mono text-brand underline decoration-brand/30 underline-offset-2 transition-colors hover:decoration-brand"
              >
                doi:{reference.doi}
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
              </a>
            )}
            {reference.url && !reference.text.includes(reference.url) && (
              <a
                href={reference.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-6 items-center gap-1 font-semibold text-brand underline decoration-brand/30 underline-offset-2 transition-colors hover:decoration-brand"
              >
                {t("referenceSource")}
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
              </a>
            )}
            {backlinks.map((occurrence, position) => (
              <a
                key={occurrence.citationId}
                href={`#${occurrence.citationId}`}
                aria-label={t("referenceBackToText", { position: position + 1 })}
                className="inline-flex min-h-6 items-center gap-0.5 rounded px-1 text-[12px] font-semibold text-brand transition-colors hover:bg-brand/8"
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
        // Visible on touch screens, where there is no hover to reveal it; on a
        // mouse it appears on hover or focus so forty copy icons do not line
        // the right edge of the list.
        className="-my-1 inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-muted transition-opacity duration-150 hover:text-brand [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
      >
        {copied ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
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
      <ol ref={listRef} className="divide-y divide-divider/70">
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
          className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[14px] font-semibold text-brand transition-colors hover:bg-brand/5"
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
