// app/[locale]/(public)/posts/[slug]/Markdown.tsx
// ──────────────────────────────────────────────────────────────────
// Renders a post body. The grammar lives in `lib/markdown/parse.ts` (pure,
// unit-tested); this file owns only how each node looks.
//
// Everything is React elements — no `dangerouslySetInnerHTML`, no sanitiser
// in the path — so an author cannot inject markup through a post body, and
// the two URL-bearing nodes (links, images) are scheme-checked by
// `isSafeHref()` before they are rendered at all.
//
// Rhythm, measure, images, figures and tables are styled by `.prose-content`
// in globals.css; the classes here add colour and the accent details. Both
// the public post page and the admin preview modal wrap this in
// `.prose-content`, so anything typographic belongs there, not here.
// ──────────────────────────────────────────────────────────────────

import React from "react";
import {
  isExternalHref,
  parseDocument,
  type BlockNode,
  type InlineNode,
} from "@/lib/markdown/parse";

export { extractToc, computeReadingTime } from "@/lib/markdown/parse";
export type { TocEntry } from "@/lib/markdown/parse";

/**
 * A body image from the post's Markdown.
 *
 * Deliberately a plain <img>, not next/image: the URL comes from whatever an
 * editor pasted into the body, and next/image throws at request time for any
 * host missing from `images.remotePatterns` in next.config.ts — which would
 * take the whole article down over one image. Sizing and rounding come from
 * `.prose-content :where(img)` in globals.css.
 */
function InlineImage({ src, alt }: { src: string; alt: string }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={src} alt={alt} loading="lazy" decoding="async" />
  );
}

// ── Inline nodes ──────────────────────────────────────────────────

function renderInline(nodes: InlineNode[], keyPrefix: string): React.ReactNode[] {
  return nodes.map((node, idx) => {
    const key = `${keyPrefix}-${idx}`;
    switch (node.type) {
      case "text":
        return <React.Fragment key={key}>{node.value}</React.Fragment>;

      case "break":
        return <br key={key} />;

      case "code":
        return (
          <code
            key={key}
            className="rounded-md border border-brand/10 bg-brand/5 px-1.5 py-0.5 font-mono text-[0.85em] text-brand"
          >
            {node.value}
          </code>
        );

      case "strong":
        return (
          <strong key={key} className="font-bold text-brand">
            {renderInline(node.children, key)}
          </strong>
        );

      case "em":
        return <em key={key}>{renderInline(node.children, key)}</em>;

      case "del":
        return (
          <s key={key} className="text-text-muted decoration-text-muted/60">
            {renderInline(node.children, key)}
          </s>
        );

      case "link": {
        // Only links that leave the site open in a new tab. An in-page
        // anchor or an internal path opening a tab is a bug readers feel:
        // the table of contents and "see the rules" links both land here.
        const external = isExternalHref(node.href);
        return (
          <a
            key={key}
            href={node.href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="font-semibold text-brand underline underline-offset-2 decoration-brand/40 transition-colors hover:text-accent hover:decoration-accent"
          >
            {renderInline(node.children, key)}
          </a>
        );
      }

      case "image":
        return <InlineImage key={key} src={node.src} alt={node.alt} />;
    }
  });
}

// ── Block nodes ───────────────────────────────────────────────────

/** H3–H6. H1 and H2 carry their own ornament and are built inline below. */
const HEADING_CLASS: Record<number, string> = {
  3: "mt-6 mb-2 font-title text-xl text-brand scroll-mt-24",
  4: "mt-5 mb-2 font-title text-lg text-brand/80",
  5: "mt-4 mb-2 font-title text-base text-text-body",
  6: "mt-4 mb-2 font-title text-sm uppercase tracking-widest text-text-muted",
};

function renderBlocks(blocks: BlockNode[], keyPrefix: string, depth = 0): React.ReactNode[] {
  return blocks.map((block, idx) => {
    const key = `${keyPrefix}-${idx}`;

    switch (block.type) {
      case "heading": {
        const inline = renderInline(block.children, key);

        // H1 — large PTEC navy with a gold accent underline.
        if (block.level === 1) {
          return (
            <h1 key={key} className="mt-8 mb-4 font-title text-3xl text-brand pb-2 border-b-2 border-accent/40">
              {inline}
            </h1>
          );
        }

        // H2 — the gold pill bar the design spec asks for. The bar is
        // decorative, so it is hidden from assistive tech and the heading
        // reads as its text alone.
        if (block.level === 2) {
          return (
            <h2
              key={key}
              id={block.id ?? undefined}
              className="mt-8 mb-4 flex items-center gap-3 font-title text-2xl text-brand scroll-mt-24"
            >
              <span className="w-1.5 h-7 rounded-full bg-accent shrink-0" aria-hidden="true" />
              <span>{inline}</span>
            </h2>
          );
        }

        const Tag = `h${block.level}` as "h3" | "h4" | "h5" | "h6";
        return (
          <Tag key={key} id={block.id ?? undefined} className={HEADING_CLASS[block.level]}>
            {inline}
          </Tag>
        );
      }

      case "paragraph":
        return (
          <p key={key} className="text-text-body">
            {renderInline(block.children, key)}
          </p>
        );

      case "codeBlock":
        return (
          <div key={key} className="my-5 overflow-hidden rounded-xl border border-brand/20 shadow-sm">
            {block.lang && (
              <div className="border-b border-white/10 bg-plate px-5 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-slate-400">
                {block.lang}
              </div>
            )}
            <pre className="overflow-x-auto bg-plate p-5 text-sm leading-relaxed text-slate-100">
              <code className={`font-mono${block.lang ? ` language-${block.lang}` : ""}`}>
                {block.value}
              </code>
            </pre>
          </div>
        );

      case "blockquote":
        return (
          <blockquote
            key={key}
            className="my-5 rounded-r-lg border-l-4 border-accent bg-accent/[0.07] py-3 pl-5 pr-3 italic text-text-body [&>:last-child]:mb-0"
          >
            {renderBlocks(block.children, key, depth + 1)}
          </blockquote>
        );

      case "list": {
        const spacing = depth > 0 ? "mt-2 mb-0" : "my-4";
        const items = block.items.map((item, i) => {
          const itemKey = `${key}-i${i}`;
          // Only a loose item holds <p> children, and only its last one needs
          // the trailing paragraph margin taken back.
          const flush = block.tight ? "" : " [&>p:last-child]:mb-0";
          // A tight item's paragraphs render as bare inline runs: wrapping
          // them in <p> would add the 1.5em paragraph rhythm between one-line
          // bullets and the list would read as a stack of paragraphs.
          const body =
            block.tight
              ? item.children.flatMap((child, ci) =>
                  child.type === "paragraph"
                    ? renderInline(child.children, `${itemKey}-${ci}`)
                    : renderBlocks([child], `${itemKey}-${ci}`, depth + 1)
                )
              : renderBlocks(item.children, itemKey, depth + 1);

          // A task item replaces the marker with its checkbox.
          if (item.checked !== null) {
            return (
              <li key={itemKey} className={`flex items-start gap-2.5${flush}`}>
                <input
                  type="checkbox"
                  checked={item.checked}
                  readOnly
                  disabled
                  aria-label={item.checked ? "Completed" : "Not completed"}
                  className="mt-[0.45em] h-3.5 w-3.5 shrink-0 accent-accent"
                />
                <span className={item.checked ? "text-text-muted line-through" : undefined}>{body}</span>
              </li>
            );
          }

          if (block.ordered) {
            return (
              <li key={itemKey} className={`pl-1${flush}`}>
                {body}
              </li>
            );
          }

          return (
            <li
              key={itemKey}
              className={`relative pl-5${flush} before:absolute before:left-0 before:top-[0.6em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-accent`}
            >
              {body}
            </li>
          );
        });

        return block.ordered ? (
          <ol
            key={key}
            start={block.start === 1 ? undefined : block.start}
            className={`${spacing} list-decimal space-y-2 pl-6 text-text-body marker:font-bold marker:text-brand`}
          >
            {items}
          </ol>
        ) : (
          <ul key={key} className={`${spacing} list-none space-y-2 pl-6 text-text-body`}>
            {items}
          </ul>
        );
      }

      case "table":
        // Borders, padding and the header fill come from `.prose-content`,
        // which also makes the table its own horizontal scroll container so a
        // wide one never widens the article column.
        return (
          <table key={key} className="my-6">
            <thead>
              <tr>
                {block.header.map((cell, ci) => (
                  <th key={`${key}-h${ci}`} style={block.align[ci] ? { textAlign: block.align[ci]! } : undefined}>
                    {renderInline(cell, `${key}-h${ci}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={`${key}-r${ri}`}>
                  {row.map((cell, ci) => (
                    <td
                      key={`${key}-r${ri}c${ci}`}
                      style={block.align[ci] ? { textAlign: block.align[ci]! } : undefined}
                    >
                      {renderInline(cell, `${key}-r${ri}c${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );

      case "figure":
        return (
          <figure key={key}>
            <InlineImage src={block.src} alt={block.alt} />
            {block.alt.trim() !== "" && <figcaption>{block.alt}</figcaption>}
          </figure>
        );

      case "thematicBreak":
        return (
          <hr
            key={key}
            className="my-8 h-px border-0 bg-gradient-to-r from-brand/30 via-accent/50 to-brand/30"
          />
        );
    }
  });
}

export default function Markdown({ content }: { content: string }) {
  if (!content?.trim()) return null;
  return <>{renderBlocks(parseDocument(content), "b")}</>;
}
