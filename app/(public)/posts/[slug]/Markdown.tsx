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
        <code key={key} className="rounded bg-paper px-1.5 py-0.5 font-mono text-[0.85em] text-text-heading">
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
            className="font-medium text-brand underline underline-offset-2 hover:text-text-heading"
          >
            {m[1]}
          </a>
        );
      } else if (m) {
        // Unsafe scheme — render the link text as plain text, drop the href.
        nodes.push(<React.Fragment key={key}>{m[1]}</React.Fragment>);
      }
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key} className="font-bold text-text-heading">{token.slice(2, -2)}</strong>);
    } else {
      // *italic* or _italic_
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
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
        <pre key={key++} className="my-4 overflow-x-auto rounded-lg bg-blue-950 p-4 text-sm leading-relaxed text-slate-100">
          <code className="font-mono">{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // ── Horizontal rule ──
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="my-6 border-divider" />);
      i++;
      continue;
    }

    // ── Headings ──
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const hText = heading[2];
      const content = renderInline(hText, `h-${key}`);
      const cls = [
        "mt-8 mb-3 font-title text-3xl text-text-heading",
        "mt-7 mb-3 font-title text-2xl text-text-heading scroll-mt-24",
        "mt-6 mb-2 font-title text-xl text-text-heading scroll-mt-24",
        "mt-5 mb-2 font-title text-lg text-text-heading",
        "mt-4 mb-2 font-title text-base text-text-body",
        "mt-4 mb-2 font-title text-sm uppercase tracking-wide text-text-muted",
      ][level - 1];
      const Tag = (`h${level}` as keyof React.JSX.IntrinsicElements);
      const id = level >= 2 ? slugifyHeading(hText) : undefined;
      blocks.push(<Tag key={key++} id={id} className={cls}>{content}</Tag>);
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
        <blockquote key={key++} className="my-4 border-l-4 border-brand bg-cyan-50/40 py-2 pl-4 pr-2 text-text-body italic">
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
        <ul key={key++} className="my-4 list-disc space-y-1.5 pl-6 text-text-body">
          {items.map((it, idx) => (
            <li key={idx} className="leading-relaxed">{renderInline(it, `ul-${key}-${idx}`)}</li>
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
        <ol key={key++} className="my-4 list-decimal space-y-1.5 pl-6 text-text-body">
          {items.map((it, idx) => (
            <li key={idx} className="leading-relaxed">{renderInline(it, `ol-${key}-${idx}`)}</li>
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