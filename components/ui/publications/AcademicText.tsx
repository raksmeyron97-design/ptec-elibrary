// Constrained academic-text renderer shared by the public publication page
// and the admin live preview. It parses the stored plain-text syntax
// (paragraphs, **bold**, *italic*/_italic_, <sub>/<sup>, [cite:ref-id])
// straight into React nodes — never through dangerouslySetInnerHTML — so the
// existing React-escaping security model is preserved.

import { Fragment, type ReactNode } from "react";
import type { PublicationReference } from "@/lib/publications";
import {
  getCitationOccurrenceId,
  getReferenceTargetId,
  resolveCitationGroup,
  splitCitationKeys,
} from "@/lib/publications/citations";

export interface AcademicTextProps {
  text: string;
  references: readonly PublicationReference[];
  /** Stable per-content-block ID; keeps citation anchors unique on a page. */
  sourceId: string;
  /** Render citations as in-page links to the reference list (default true). */
  linkCitations?: boolean;
  /** Localized accessible name for a resolved citation number. */
  citationLabel?: (number: number) => string;
  /** Localized label for an unresolvable token; omit to hide such tokens. */
  missingCitationLabel?: (referenceKey: string) => string;
  paragraphClassName?: string;
}

type InlineKind = "citation" | "sub" | "sup" | "bold" | "italic";

// Fresh (non-global) regexes; earliest match in the string wins. The italic
// patterns cannot fire at a `**` opener because `[^*]` excludes `*`.
const INLINE_PATTERNS: { kind: InlineKind; re: RegExp }[] = [
  { kind: "citation", re: /\[cite:([^\]]*)\]/i },
  { kind: "sub", re: /<sub>([\s\S]*?)<\/sub>/i },
  { kind: "sup", re: /<sup>([\s\S]*?)<\/sup>/i },
  { kind: "bold", re: /\*\*([^*]+)\*\*/ },
  { kind: "italic", re: /\*([^*\n]+)\*/ },
  { kind: "italic", re: /_([^_\n]+)_/ },
];

const MAX_NESTING_DEPTH = 4;

type RenderContext = {
  references: readonly PublicationReference[];
  sourceId: string;
  linkCitations: boolean;
  citationLabel?: (number: number) => string;
  missingCitationLabel?: (referenceKey: string) => string;
  /** In-document-order occurrence counter per reference ID. Must mirror
   * collectCitationOccurrences() so reference backlinks target real anchors. */
  occurrenceByReference: Map<string, number>;
  nextKey: () => number;
};

function renderPlainRun(text: string, ctx: RenderContext): ReactNode[] {
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) nodes.push(<br key={ctx.nextKey()} />);
    if (line) nodes.push(<Fragment key={ctx.nextKey()}>{line}</Fragment>);
  });
  return nodes;
}

function renderResolvedCitation(
  resolved: ReturnType<typeof resolveCitationGroup>[number],
  ctx: RenderContext,
): ReactNode {
  const { reference, number } = resolved;
  const occurrence = (ctx.occurrenceByReference.get(reference.id) ?? 0) + 1;
  ctx.occurrenceByReference.set(reference.id, occurrence);
  const citationId = getCitationOccurrenceId(ctx.sourceId, reference.id, occurrence);
  const label = ctx.citationLabel?.(number) ?? `Reference ${number}`;
  const preview = reference.text.replace(/\s+/g, " ").trim();
  const citationClass =
    "rounded-sm px-0.5 font-semibold text-brand underline decoration-brand/30 decoration-dotted underline-offset-2 transition-colors hover:bg-brand/8 hover:decoration-brand hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50";

  if (!ctx.linkCitations) {
    return (
      <span key={ctx.nextKey()} id={citationId} title={preview || label} className={citationClass}>
        {number}
      </span>
    );
  }

  return (
    <a
      key={ctx.nextKey()}
      id={citationId}
      href={`#${getReferenceTargetId(reference.id)}`}
      aria-label={label}
      title={preview || label}
      className={citationClass}
    >
      {number}
    </a>
  );
}

function renderCitation(rawKey: string, ctx: RenderContext): ReactNode {
  const keys = splitCitationKeys(rawKey);
  const resolved = resolveCitationGroup(keys, ctx.references);
  const missingCount = Math.max(0, keys.length - resolved.length);

  if (resolved.length === 0 && (!ctx.missingCitationLabel || missingCount === 0)) {
    return null;
  }

  const children: ReactNode[] = [];
  resolved.forEach((item, index) => {
    if (index > 0) children.push(<span key={ctx.nextKey()}>, </span>);
    children.push(renderResolvedCitation(item, ctx));
  });
  if (missingCount > 0 && ctx.missingCitationLabel) {
    if (children.length > 0) children.push(<span key={ctx.nextKey()}>, </span>);
    const missingKey = keys.find(
      (key) => resolveCitationGroup([key], ctx.references).length === 0,
    ) ?? "?";
    const label = ctx.missingCitationLabel(missingKey);
    children.push(
      <span key={ctx.nextKey()} title={label} className="font-semibold text-danger">
        ?<span className="sr-only"> {label}</span>
      </span>,
    );
  }

  return (
    <span
      key={ctx.nextKey()}
      className="mx-0.5 inline-flex whitespace-nowrap rounded-[0.3rem] bg-brand/8 px-0.5 font-medium tabular-nums text-brand"
    >
      <span aria-hidden="true">[</span>
      {children}
      <span aria-hidden="true">]</span>
    </span>
  );
}

function renderInline(text: string, ctx: RenderContext, depth: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;

  while (rest) {
    let best: { kind: InlineKind; match: RegExpExecArray } | null = null;
    for (const pattern of INLINE_PATTERNS) {
      const match = pattern.re.exec(rest);
      if (match && (best === null || match.index < best.match.index)) {
        best = { kind: pattern.kind, match };
      }
    }

    if (!best) {
      nodes.push(...renderPlainRun(rest, ctx));
      break;
    }

    if (best.match.index > 0) {
      nodes.push(...renderPlainRun(rest.slice(0, best.match.index), ctx));
    }

    const inner = best.match[1];
    const children =
      depth < MAX_NESTING_DEPTH ? renderInline(inner, ctx, depth + 1) : inner;
    switch (best.kind) {
      case "citation":
        // Citations never nest; parse the raw key, not children.
        nodes.push(renderCitation(inner, ctx));
        break;
      case "sub":
        nodes.push(<sub key={ctx.nextKey()}>{children}</sub>);
        break;
      case "sup":
        nodes.push(<sup key={ctx.nextKey()}>{children}</sup>);
        break;
      case "bold":
        nodes.push(
          <strong key={ctx.nextKey()} className="font-semibold">
            {children}
          </strong>,
        );
        break;
      case "italic":
        nodes.push(<em key={ctx.nextKey()}>{children}</em>);
        break;
    }

    rest = rest.slice(best.match.index + best.match[0].length);
  }

  return nodes;
}

export default function AcademicText({
  text,
  references,
  sourceId,
  linkCitations = true,
  citationLabel,
  missingCitationLabel,
  paragraphClassName,
}: AcademicTextProps) {
  let keyCounter = 0;
  const ctx: RenderContext = {
    references,
    sourceId,
    linkCitations,
    citationLabel,
    missingCitationLabel,
    occurrenceByReference: new Map(),
    nextKey: () => keyCounter++,
  };

  const paragraphs = text.split(/\n{2,}/).filter((paragraph) => paragraph.trim());

  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className={paragraphClassName}>
          {renderInline(paragraph.trim(), ctx, 0)}
        </p>
      ))}
    </>
  );
}
