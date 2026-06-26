// app/posts/[slug]/Markdown.tsx
// ──────────────────────────────────────────────────────────────────
// Minimal, dependency-free Markdown renderer.
//
// Supports: headings (#..######), bold (**), italic (*/_), inline code (`),
// links [text](url), unordered (-/*) and ordered (1.) lists, blockquotes (>),
// fenced code blocks (```), horizontal rules (---), and paragraphs.
//
// If you'd rather use a full library, install `react-markdown` + `remark-gfm`
// and replace this component with:
//   import ReactMarkdown from "react-markdown";
//   import remarkGfm from "remark-gfm";
//   <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
// ──────────────────────────────────────────────────────────────────

import React from "react";

// Only allow safe URL schemes in links — blocks javascript:, data:, vbscript:,
// etc. that could execute in the reader's session via a crafted [text](url).
function isSafeHref(url: string): boolean {
  const trimmed = url.trim();
  return /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(trimmed);
}

// ── Inline formatting: bold, italic, code, links ──────────────────
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Order matters: code first (so we don't format inside it), then links, bold, italic.
  const pattern =
    /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded-md border border-brand/10 bg-brand/5 px-1.5 py-0.5 font-mono text-[0.85em] text-brand">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("[")) {
      const m = /\[([^\]]+)\]\(([^)]+)\)/.exec(token);
      if (m && isSafeHref(m[2])) {
        nodes.push(
          <a
            key={key}
            href={m[2].trim()}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand underline underline-offset-2 decoration-brand/40 transition-colors hover:text-accent hover:decoration-accent"
          >
            {m[1]}
          </a>
        );
      } else if (m) {
        // Unsafe scheme — render the link text as plain text, drop the href.
        nodes.push(<React.Fragment key={key}>{m[1]}</React.Fragment>);
      }
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key} className="font-bold text-brand">{token.slice(2, -2)}</strong>);
    } else {
      // *italic* or _italic_
      nodes.push(<em key={key} className="text-text-body">{token.slice(1, -1)}</em>);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

function slugifyHeading(text: string): string {
  return text
    .trim()
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9ក-៿-]/g, "")
    .toLowerCase();
}

export function extractToc(content: string): { id: string; text: string }[] {
  const toc: { id: string; text: string }[] = [];
  for (const line of content.split("\n")) {
    const m = /^##\s+(.+)$/.exec(line);
    if (m) toc.push({ id: slugifyHeading(m[1]), text: m[1].trim() });
  }
  return toc;
}

export function computeReadingTime(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 150));
}

export default function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];

  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block ──
    if (line.trimStart().startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push(
        <pre key={key++} className="my-5 overflow-x-auto rounded-xl border border-brand/20 bg-[#0B1530] p-5 text-sm leading-relaxed text-slate-100 shadow-sm">
          <code className="font-mono">{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // ── Horizontal rule ──
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="my-8 border-0 h-px bg-gradient-to-r from-brand/30 via-accent/50 to-brand/30" />);
      i++;
      continue;
    }

    // ── Headings ──
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const hText = heading[2];
      const content = renderInline(hText, `h-${key}`);
      const id = level >= 2 ? slugifyHeading(hText) : undefined;

      if (level === 1) {
        // H1 — large PTEC navy with gold accent underline
        blocks.push(
          <h1 key={key++} className="mt-8 mb-4 font-title text-3xl text-brand pb-2 border-b-2 border-accent/40">
            {content}
          </h1>
        );
      } else if (level === 2) {
        // H2 — flex with gold rounded pill bar (matching design spec)
        blocks.push(
          <h2 key={key++} id={id} className="mt-8 mb-4 flex items-center gap-3 font-title text-2xl text-brand scroll-mt-24">
            <span className="w-1.5 h-7 rounded-full bg-accent shrink-0" aria-hidden="true" />
            <span>{content}</span>
          </h2>
        );
      } else {
        const cls = [
          "",  // H1 handled above
          "",  // H2 handled above
          // H3 — PTEC navy
          "mt-6 mb-2 font-title text-xl text-brand scroll-mt-24",
          // H4 — slightly muted
          "mt-5 mb-2 font-title text-lg text-brand/80",
          // H5
          "mt-4 mb-2 font-title text-base text-text-body",
          // H6 — uppercase label
          "mt-4 mb-2 font-title text-sm uppercase tracking-widest text-text-muted",
        ][level - 1];
        const Tag = (`h${level}` as keyof React.JSX.IntrinsicElements);
        blocks.push(<Tag key={key++} id={id} className={cls}>{content}</Tag>);
      }
      i++;
      continue;
    }

    // ── Blockquote (consecutive > lines) ──
    if (line.trimStart().startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith(">")) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote key={key++} className="my-5 rounded-r-lg border-l-4 border-accent bg-amber-50/60 py-3 pl-5 pr-3 text-text-body italic dark:bg-amber-950/20">
          {renderInline(quoteLines.join(" "), `q-${key}`)}
        </blockquote>
      );
      continue;
    }

    // ── Unordered list ──
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="my-4 space-y-2 pl-6 text-text-body" style={{ listStyleType: "none" }}>
          {items.map((it, idx) => (
            <li key={idx} className="relative leading-relaxed pl-5 before:absolute before:left-0 before:top-[0.6em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-accent">
              {renderInline(it, `ul-${key}-${idx}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // ── Ordered list ──
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++} className="my-4 list-decimal space-y-2 pl-6 text-text-body marker:font-bold marker:text-brand">
          {items.map((it, idx) => (
            <li key={idx} className="leading-relaxed pl-1">{renderInline(it, `ol-${key}-${idx}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // ── Blank line ──
    if (line.trim() === "") {
      i++;
      continue;
    }

    // ── Paragraph (gather consecutive non-blank, non-special lines) ──
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trimStart().startsWith("```") &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !lines[i].trimStart().startsWith(">") &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*(---|\*\*\*|___)\s*$/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="my-4 leading-relaxed text-text-body">
        {renderInline(paraLines.join(" "), `p-${key}`)}
      </p>
    );
  }

  return <div className="text-[15px]">{blocks}</div>;
}