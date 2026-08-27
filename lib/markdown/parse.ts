// lib/markdown/parse.ts
// ──────────────────────────────────────────────────────────────────
// Dependency-free Markdown parser for post bodies.
//
// Pure by design — no React, no server imports — so the block and inline
// grammars are unit-testable on their own (`parse.test.ts`), the same split
// the SEO and OAI helpers use. Rendering lives in
// `app/[locale]/(public)/posts/[slug]/Markdown.tsx`.
//
// Supported: ATX headings, paragraphs, fenced code (with an info string),
// blockquotes (nestable, with lazy continuation), bullet/ordered lists
// (nested, tight/loose, `start`, GFM task items), GFM tables with column
// alignment, thematic breaks, standalone images as figures, and the inline
// grammar: code spans, images, links, autolinks, bold, italic,
// strikethrough, backslash escapes and hard line breaks.
//
// Deliberately NOT supported:
//   - raw HTML. Post bodies are rendered as React elements, so any markup an
//     author pastes stays literal text. That is the property that keeps this
//     renderer XSS-free with no sanitiser in the path.
//   - setext headings (text underlined with `---`). The admin editor's
//     "horizontal rule" tool inserts `---`, and existing posts have it
//     sitting directly under a paragraph; reading that as an <h2> would
//     silently retitle published articles.
// ──────────────────────────────────────────────────────────────────

export type Align = "left" | "center" | "right" | null;

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "break" }
  | { type: "code"; value: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "del"; children: InlineNode[] }
  | { type: "link"; href: string; children: InlineNode[] }
  | { type: "image"; src: string; alt: string };

export interface ListItem {
  /** `null` for a plain bullet, `true`/`false` for a GFM task item. */
  checked: boolean | null;
  children: BlockNode[];
}

export type BlockNode =
  | { type: "heading"; level: number; id: string | null; text: string; children: InlineNode[] }
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "codeBlock"; lang: string | null; value: string }
  | { type: "blockquote"; children: BlockNode[] }
  | { type: "list"; ordered: boolean; start: number; tight: boolean; items: ListItem[] }
  | { type: "table"; align: Align[]; header: InlineNode[][]; rows: InlineNode[][][] }
  | { type: "figure"; src: string; alt: string }
  | { type: "thematicBreak" };

/**
 * Drops C0 control characters, keeping the newline and tab the block grammar
 * relies on. Written as a loop rather than a character-class regex so no
 * control character has to appear in this source file.
 */
function stripControl(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (code >= 32 || ch === "\n" || ch === "\t") out += ch;
  }
  return out;
}

// ── URL safety ────────────────────────────────────────────────────
//
// Only these schemes reach an `href`/`src`. Everything else (javascript:,
// data:, vbscript:, and the control-character-obfuscated spellings of them)
// is dropped by the renderer. Control characters are stripped before the
// test, so a tab smuggled into "java<TAB>script:" cannot carry that string
// past the scheme check.
export function isSafeHref(url: string): boolean {
  const cleaned = stripControl(url).trim();
  return /^(https?:\/\/|mailto:|tel:|\/|#|\.\/|\.\.\/)/i.test(cleaned);
}

/** A link that leaves the site — the renderer opens only these in a new tab. */
export function isExternalHref(url: string): boolean {
  return /^(https?:\/\/|mailto:|tel:)/i.test(url.trim());
}

// ── Heading slugs ─────────────────────────────────────────────────
//
// The character class is kept exactly as it shipped (Latin, digits, Khmer,
// hyphen) because published posts already carry these anchors and links to
// them exist off-site. What is new is de-duplication: two "Overview"
// headings used to render the same `id`, so the table of contents' second
// entry scrolled to the first heading.
export function slugifyHeading(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9ក-៿-]/g, "")
    .toLowerCase();
}

function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text) => {
    const base = slugifyHeading(text) || "section";
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}-${n + 1}`;
  };
}

// ── Normalisation ─────────────────────────────────────────────────
//
// Line endings and tabs only. Trailing spaces survive on purpose: they are
// how the inline tokenizer recognises a hard line break, and stripping them
// here would lose that before it ever sees the text.
function normalize(src: string): string {
  return stripControl(src.replace(/\r\n?/g, "\n")).replace(/\t/g, "    ");
}

// ── Inline grammar ────────────────────────────────────────────────

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!>~|]/;

function runLength(src: string, i: number, ch: string): number {
  let n = 0;
  while (i + n < src.length && src[i + n] === ch) n++;
  return n;
}

/**
 * Finds the closing run for an emphasis delimiter.
 *
 * `strict` (single-character delimiters only) rejects a closer preceded by
 * whitespace, so `2 * 3 * 4` stays arithmetic. Double delimiters are
 * deliberately permissive: published posts were written as `** text **`,
 * which CommonMark reads as literal asterisks and the previous renderer
 * bolded. Tightening that would put stray `**` into live articles.
 */
function findEmphasisClose(src: string, from: number, ch: string, width: number, strict: boolean): number {
  for (let j = from; j < src.length; j++) {
    if (src[j] === "\\") { j++; continue; }
    if (src[j] === "`") {
      const run = runLength(src, j, "`");
      const close = src.indexOf("`".repeat(run), j + run);
      if (close === -1) return -1;
      j = close + run - 1;
      continue;
    }
    if (src[j] !== ch) continue;
    const run = runLength(src, j, ch);
    if (run < width) { j += run - 1; continue; }
    if (strict && /\s/.test(src[j - 1] ?? "")) { j += run - 1; continue; }
    if (ch === "_" && /[\p{L}\p{N}]/u.test(src[j + run] ?? "")) { j += run - 1; continue; }
    return j;
  }
  return -1;
}

/** Reads `[label](destination)` starting at `[`, tolerating nesting. */
function matchLink(src: string, start: number): { label: string; href: string; end: number } | null {
  let depth = 0;
  let i = start;
  for (; i < src.length; i++) {
    if (src[i] === "\\") { i++; continue; }
    if (src[i] === "[") depth++;
    else if (src[i] === "]") { depth--; if (depth === 0) break; }
  }
  if (depth !== 0 || src[i + 1] !== "(") return null;
  const label = src.slice(start + 1, i);

  let j = i + 2;
  let parens = 1;
  for (; j < src.length; j++) {
    if (src[j] === "\\") { j++; continue; }
    if (src[j] === "(") parens++;
    else if (src[j] === ")") { parens--; if (parens === 0) break; }
  }
  if (parens !== 0) return null;

  // Destination plus an optional `"title"`, which we accept and discard.
  const dest = src.slice(i + 2, j).trim().replace(/\s+"[^"]*"$/, "").trim();
  return { label, href: dest.replace(/^</, "").replace(/>$/, ""), end: j + 1 };
}

export function parseInline(src: string, depth = 0): InlineNode[] {
  const nodes: InlineNode[] = [];
  let text = "";
  const flush = () => {
    if (text) { nodes.push({ type: "text", value: text }); text = ""; }
  };
  const descend = (inner: string): InlineNode[] =>
    depth >= 6 ? [{ type: "text", value: inner }] : parseInline(inner, depth + 1);

  let i = 0;
  while (i < src.length) {
    const c = src[i];

    if (c === "\\" && ESCAPABLE.test(src[i + 1] ?? "")) { text += src[i + 1]; i += 2; continue; }

    // End of a line inside a block. Two trailing spaces or a trailing
    // backslash make it a hard break; otherwise it is a soft break, which
    // renders as a single space.
    if (c === "\n") {
      if (/(?: {2,}|\\)$/.test(text)) {
        text = text.replace(/(?: +|\\)$/, "");
        flush();
        nodes.push({ type: "break" });
      } else {
        text = text.replace(/ +$/, "") + " ";
      }
      i++;
      continue;
    }

    if (c === "`") {
      const run = runLength(src, i, "`");
      const close = src.indexOf("`".repeat(run), i + run);
      if (close !== -1 && runLength(src, close, "`") === run) {
        let value = src.slice(i + run, close).replace(/\n/g, " ");
        if (value.length > 2 && value.startsWith(" ") && value.endsWith(" ")) value = value.slice(1, -1);
        flush();
        nodes.push({ type: "code", value });
        i = close + run;
        continue;
      }
    }

    // Images before links: `![alt](url)` also matches the link grammar, and
    // reading it as one leaves a stray "!" beside a link to the image file.
    if (c === "!" && src[i + 1] === "[") {
      const m = matchLink(src, i + 1);
      if (m) {
        if (isSafeHref(m.href)) {
          flush();
          nodes.push({ type: "image", src: m.href.trim(), alt: m.label });
        }
        i = m.end;
        continue;
      }
    }

    if (c === "[") {
      const m = matchLink(src, i);
      if (m) {
        flush();
        const children = descend(m.label);
        // Unsafe scheme: keep the label, drop the destination.
        if (isSafeHref(m.href)) nodes.push({ type: "link", href: m.href.trim(), children });
        else nodes.push(...children);
        i = m.end;
        continue;
      }
    }

    if (c === "<") {
      const m = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/.exec(src.slice(i));
      if (m) {
        flush();
        nodes.push({ type: "link", href: m[1], children: [{ type: "text", value: m[1].replace(/^mailto:/, "") }] });
        i += m[0].length;
        continue;
      }
    }

    if (c === "~" && src[i + 1] === "~") {
      const close = findEmphasisClose(src, i + 2, "~", 2, false);
      if (close !== -1) {
        flush();
        nodes.push({ type: "del", children: descend(src.slice(i + 2, close)) });
        i = close + 2;
        continue;
      }
    }

    if (c === "*" || c === "_") {
      const run = runLength(src, i, c);
      const width = run >= 2 ? 2 : 1;
      const next = src[i + width] ?? "";
      const prev = src[i - 1] ?? "";
      // Only `*`/`_` (italic) require the opener to hug its text; `**` is
      // permissive for the reason findEmphasisClose() documents.
      const strict = width === 1;
      const opens =
        next !== "" &&
        (!strict || !/\s/.test(next)) &&
        !(c === "_" && /[\p{L}\p{N}]/u.test(prev));
      if (opens) {
        const close = findEmphasisClose(src, i + width, c, width, strict);
        if (close !== -1) {
          flush();
          const children = descend(src.slice(i + width, close));
          nodes.push(width === 2 ? { type: "strong", children } : { type: "em", children });
          i = close + width;
          continue;
        }
      }
    }

    text += c;
    i++;
  }

  flush();
  return nodes;
}

/** Plain text of an inline tree — heading slugs and reading time use it. */
export function inlineText(nodes: InlineNode[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text": return n.value;
        case "code": return n.value;
        case "break": return " ";
        case "image": return n.alt;
        default: return inlineText(n.children);
      }
    })
    .join("");
}

// ── Block grammar ─────────────────────────────────────────────────

const THEMATIC = /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;
const FIGURE = /^ {0,3}!\[([^\]]*)\]\([ \t]*([^\s)]+)(?:[ \t]+"[^"]*")?[ \t]*\)[ \t]*$/;

interface ItemMatch { indent: number; ordered: boolean; start: number; contentIndent: number; text: string }

function matchListItem(line: string): ItemMatch | null {
  const bullet = /^( *)([-*+])( +)(.*)$/.exec(line);
  if (bullet && !THEMATIC.test(line)) {
    return {
      indent: bullet[1].length,
      ordered: false,
      start: 1,
      contentIndent: bullet[1].length + 1 + bullet[3].length,
      text: bullet[4],
    };
  }
  const ordered = /^( *)(\d{1,9})([.)])( +)(.*)$/.exec(line);
  if (ordered) {
    return {
      indent: ordered[1].length,
      ordered: true,
      start: Number(ordered[2]),
      contentIndent: ordered[1].length + ordered[2].length + 1 + ordered[4].length,
      text: ordered[5],
    };
  }
  return null;
}

function startsBlock(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    THEMATIC.test(line) ||
    FIGURE.test(line) ||
    /^ {0,3}>/.test(line) ||
    matchListItem(line) !== null
  );
}

function splitRow(row: string): string[] {
  const cells: string[] = [];
  const s = row.trim();
  let cur = "";
  let i = s.startsWith("|") ? 1 : 0;
  for (; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") { cur += "|"; i++; continue; }
    if (s[i] === "|") { cells.push(cur.trim()); cur = ""; continue; }
    cur += s[i];
  }
  if (cur.trim() !== "" || !s.endsWith("|")) cells.push(cur.trim());
  return cells;
}

function isDelimiterRow(line: string): boolean {
  if (!line.includes("-")) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

/**
 * A table needs a header row and a delimiter row with the same number of
 * cells. Requiring the counts to match is what keeps a prose line containing
 * a pipe, followed by a horizontal rule, from being eaten as a table.
 */
function isTableStart(lines: string[], i: number): boolean {
  if (!lines[i]?.includes("|")) return false;
  const next = lines[i + 1];
  if (!next || !isDelimiterRow(next)) return false;
  return splitRow(lines[i]).length === splitRow(next).length;
}

function cellAlign(cell: string): Align {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

interface Ctx { slug: (text: string) => string; depth: number }

function parseLines(lines: string[], ctx: Ctx): BlockNode[] {
  const blocks: BlockNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") { i++; continue; }

    // ── Fenced code ──
    const fence = FENCE.exec(line);
    if (fence) {
      const indent = fence[1].length;
      const marker = fence[2][0];
      const width = fence[2].length;
      const info = fence[3].trim();
      const closer = new RegExp("^ {0,3}" + (marker === "~" ? "~" : "`") + "{" + width + ",}[ \\t]*$");
      const body: string[] = [];
      i++;
      while (i < lines.length && !closer.test(lines[i])) {
        const l = lines[i];
        body.push(l.slice(0, indent).trim() === "" ? l.slice(indent) : l);
        i++;
      }
      i++; // closing fence, or the end of the input for an unclosed one
      blocks.push({
        type: "codeBlock",
        lang: info ? info.split(/\s+/)[0].replace(/[^\w+#.-]/g, "").toLowerCase() || null : null,
        value: body.join("\n"),
      });
      continue;
    }

    // ── Thematic break (before lists: `- - -` is a rule, not a bullet) ──
    if (THEMATIC.test(line)) { blocks.push({ type: "thematicBreak" }); i++; continue; }

    // ── Heading ──
    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      const raw = (heading[2] ?? "").replace(/[ \t]+#+[ \t]*$/, "");
      const children = parseInline(raw);
      const text = inlineText(children).trim();
      blocks.push({ type: "heading", level, text, id: level >= 2 ? ctx.slug(text) : null, children });
      i++;
      continue;
    }

    // ── Standalone image → figure, captioned by its alt text ──
    const figure = FIGURE.exec(line);
    if (figure) {
      if (isSafeHref(figure[2])) blocks.push({ type: "figure", src: figure[2].trim(), alt: figure[1] });
      i++;
      continue;
    }

    // ── Blockquote ──
    if (/^ {0,3}>/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (/^ {0,3}>/.test(l)) { quoted.push(l.replace(/^ {0,3}>[ \t]?/, "")); i++; continue; }
        // Lazy continuation: a bare paragraph line still belongs to the quote.
        if (l.trim() === "" || startsBlock(l)) break;
        quoted.push(l);
        i++;
      }
      blocks.push({ type: "blockquote", children: parseNested(quoted, ctx) });
      continue;
    }

    // ── GFM table ──
    if (isTableStart(lines, i)) {
      const header = splitRow(lines[i]).map((c) => parseInline(c));
      const align = splitRow(lines[i + 1]).map(cellAlign);
      i += 2;
      const rows: InlineNode[][][] = [];
      while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|") && !startsBlock(lines[i])) {
        const cells = splitRow(lines[i]).slice(0, header.length).map((c) => parseInline(c));
        while (cells.length < header.length) cells.push([]);
        rows.push(cells);
        i++;
      }
      blocks.push({ type: "table", align, header, rows });
      continue;
    }

    // ── List ──
    if (matchListItem(line)) {
      const [list, next] = parseList(lines, i, ctx);
      blocks.push(list);
      i = next;
      continue;
    }

    // ── Paragraph ──
    // Only the leading indent is trimmed: trailing spaces are the hard-break
    // signal the inline tokenizer reads.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !startsBlock(lines[i]) &&
      !isTableStart(lines, i)
    ) {
      para.push(lines[i].replace(/^ +/, ""));
      i++;
    }
    // Consuming nothing here would spin forever. Unreachable in practice —
    // every block form is handled above — but the guard is one comparison.
    if (para.length === 0) { i++; continue; }
    blocks.push({ type: "paragraph", children: parseInline(para.join("\n")) });
  }

  return blocks;
}

/** Recursion guard: pathological nesting degrades to paragraphs, not a stack overflow. */
function parseNested(lines: string[], ctx: Ctx): BlockNode[] {
  if (ctx.depth >= 8) return [{ type: "paragraph", children: parseInline(lines.join("\n")) }];
  return parseLines(lines, { ...ctx, depth: ctx.depth + 1 });
}

function makeItem(raw: string[], ctx: Ctx): ListItem {
  const task = /^\[([ xX])\][ \t]+/.exec(raw[0] ?? "");
  const lines = task ? [raw[0].slice(task[0].length), ...raw.slice(1)] : raw;
  return { checked: task ? task[1].toLowerCase() === "x" : null, children: parseNested(lines, ctx) };
}

function parseList(lines: string[], start: number, ctx: Ctx): [BlockNode, number] {
  const first = matchListItem(lines[start])!;
  const items: ListItem[] = [];
  let current: string[] | null = null;
  let contentIndent = first.contentIndent;
  let loose = false;
  let i = start;

  const flush = () => {
    if (current) { items.push(makeItem(current, ctx)); current = null; }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      let j = i;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j >= lines.length) { i = j; break; }
      const indent = lines[j].length - lines[j].trimStart().length;
      const next = matchListItem(lines[j]);
      const continues =
        indent >= contentIndent ||
        (next !== null && next.ordered === first.ordered && next.indent <= first.indent + 3);
      if (!continues) { i = j; break; }
      // A blank line anywhere inside the list makes it loose: the items
      // become paragraphs and take the taller rhythm.
      loose = true;
      current?.push("");
      i = j;
      continue;
    }

    // Indented past the marker: content of the current item (a nested list, a
    // second paragraph, a code block…). Checked before the sibling test, or
    // `  - b` under `- a` would read as a sibling rather than a child.
    const indent = line.length - line.trimStart().length;
    if (current && indent >= contentIndent) { current.push(line.slice(contentIndent)); i++; continue; }

    const item = matchListItem(line);
    if (item) {
      // A bullet list following an ordered one (or vice versa) is a new list.
      if (item.ordered !== first.ordered) break;
      flush();
      contentIndent = item.contentIndent;
      current = [item.text];
      i++;
      continue;
    }

    // Lazy continuation of the item's paragraph.
    if (current && !startsBlock(line)) { current.push(line.trim()); i++; continue; }
    break;
  }

  flush();
  return [{ type: "list", ordered: first.ordered, start: first.start, tight: !loose, items }, i];
}

// ── Document API ──────────────────────────────────────────────────

// A post page parses the same body three times (reading time, table of
// contents, render) and the admin editor re-parses on every keystroke. One
// small cache keyed by the source keeps that to a single pass; it is bounded
// so a long-running server never accumulates article bodies.
const CACHE_LIMIT = 8;
const cache = new Map<string, BlockNode[]>();

export function parseDocument(content: string): BlockNode[] {
  const hit = cache.get(content);
  if (hit) return hit;

  const blocks = parseLines(normalize(content).split("\n"), { slug: createSlugger(), depth: 0 });

  cache.set(content, blocks);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return blocks;
}

export interface TocEntry { id: string; text: string }

/**
 * Level-2 headings, in document order, with the ids the renderer actually
 * emits. Built from the parse tree rather than a line scan, so `## …` inside
 * a fenced code block no longer appears in the sidebar pointing at an anchor
 * that does not exist.
 */
export function extractToc(content: string): TocEntry[] {
  const toc: TocEntry[] = [];
  const walk = (blocks: BlockNode[]) => {
    for (const block of blocks) {
      if (block.type === "heading" && block.level === 2 && block.id) {
        toc.push({ id: block.id, text: block.text });
      } else if (block.type === "blockquote") walk(block.children);
      else if (block.type === "list") block.items.forEach((it) => walk(it.children));
    }
  };
  walk(parseDocument(content));
  return toc;
}

function blockText(blocks: BlockNode[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "heading":
        case "paragraph": return inlineText(b.children);
        case "codeBlock": return b.value;
        case "blockquote": return blockText(b.children);
        case "list": return b.items.map((it) => blockText(it.children)).join(" ");
        case "table": return [b.header, ...b.rows].map((r) => r.map(inlineText).join(" ")).join(" ");
        case "figure": return b.alt;
        default: return "";
      }
    })
    .join(" ");
}

/**
 * Reading time in whole minutes, at ~150 wpm.
 *
 * Counted over the parsed text rather than the raw source, so URLs, fence
 * markers and `**` no longer inflate the estimate. Khmer is the reason this
 * is not a bare `split(/\s+/)`: the script does not put spaces between
 * words, so a 2,000-word Khmer article counted as a handful of "words" and
 * every long post on /km read "1 min". Khmer base consonants and independent
 * vowels stand in for syllables, at ~4 to the word.
 */
export function computeReadingTime(content: string): number {
  const text = blockText(parseDocument(content));
  const khmerSyllables = (text.match(/[ក-ឳ]/g) ?? []).length;
  const latinWords = text.replace(/[ក-៿]+/g, " ").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil((latinWords + khmerSyllables / 4) / 150));
}
