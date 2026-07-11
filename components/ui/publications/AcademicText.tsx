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
  resolveCitation,
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

function renderCitation(rawKey: string, ctx: RenderContext): ReactNode {
  const resolved = resolveCitation(rawKey, ctx.references);

  if (!resolved) {
    if (!ctx.missingCitationLabel) return null;
    const label = ctx.missingCitationLabel(rawKey.trim() || "?");
    return (
      <span
        key={ctx.nextKey()}
        title={label}
        className="mx-0.5 rounded-sm bg-danger/10 px-1 font-medium text-danger"
      >
        (?)<span className="sr-only"> {label}</span>
      </span>
    );
  }

  const { reference, number } = resolved;
  const occurrence = (ctx.occurrenceByReference.get(reference.id) ?? 0) + 1;
  ctx.occurrenceByReference.set(reference.id, occurrence);
  const citationId = getCitationOccurrenceId(ctx.sourceId, reference.id, occurrence);
  const label = ctx.citationLabel?.(number) ?? `Reference ${number}`;
  const citationClass =
    "mx-0.5 rounded-sm font-medium text-brand underline decoration-brand/30 decoration-dotted underline-offset-2 transition-colors hover:decoration-brand hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50";

  if (!ctx.linkCitations) {
    return (
      <span key={ctx.nextKey()} id={citationId} title={label} className={citationClass}>
        ({number})
      </span>
    );
  }

  return (
    <a
      key={ctx.nextKey()}
      id={citationId}
      href={`#${getReferenceTargetId(reference.id)}`}
      aria-label={label}
      className={citationClass}
    >
      ({number})
    </a>
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
