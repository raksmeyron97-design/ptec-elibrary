/**
 * A book's description from its publisher's own page — "About this book",
 * the blurb — for the catalogue's description field. Pure: the page is fetched
 * by lib/net/public-fetch.ts, this only reads it.
 *
 * Several places can carry the text, and they do not agree. Measured
 * 2026-10-04 on link.springer.com/book/10.1007/978-0-387-09742-8: the
 * "About this book" section has 3 paragraphs and a 6-item list; `<meta
 * name="description">` the same text flattened (1,732 characters); the
 * JSON-LD Book `description` CUT at 200 characters with no ellipsis. SAGE's
 * meta descriptions end in "...". So no source is trusted for being
 * "structured": the page's own section wins when there is one, otherwise the
 * LONGEST candidate, and a text that ends in an ellipsis is reported as
 * shortened so the librarian knows to look.
 *
 * No DOM: the server has no HTML parser in production, and none is needed for
 * meta tags, JSON-LD and one section. Text goes through lib/text/plain-text.ts.
 */
import { MAX_TEXT } from "@/lib/catalog";
import { normalizeDoi } from "@/lib/seo/identifiers";
import { plainParagraphs, plainText } from "@/lib/text/plain-text";

export type DescriptionSource = "about_section" | "json_ld" | "og" | "meta" | "crossref";

export type ExtractedDescription = {
  text: string;
  source: DescriptionSource;
  /** Ends in an ellipsis: the page only gave a shortened text. */
  truncated: boolean;
};

/** Shorter than this is a tagline or "Buy this book", not a description. */
export const MIN_DESCRIPTION_CHARS = 60;

const clip = (s: string) => s.slice(0, MAX_TEXT.description).trim();
const isTruncated = (s: string) => /(\.\.\.|…)\s*$/.test(s);

function withoutScripts(html: string): string {
  return html.replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, " ");
}

/** A section's text: paragraphs kept, list items as bullets on consecutive lines. */
function sectionText(fragment: string): string {
  const paragraphs = plainParagraphs(withoutScripts(fragment).replace(/<li\b[^>]*>/gi, "• "))
    .split("\n\n")
    // The page's own controls (Routledge ends its blurb with a "Read More" button).
    .filter((p) => !/^(?:(?:read|show|see|view) (?:more|less)|more|less|expand|collapse)\s*[.…]*$/i.test(p));
  let out = "";
  paragraphs.forEach((p, i) => {
    const listContinues = i > 0 && p.startsWith("• ") && paragraphs[i - 1].startsWith("• ");
    out += (i === 0 ? "" : listContinues ? "\n" : "\n\n") + p;
  });
  return out;
}

// ── The page's own "About this book" ─────────────────────────────────────────

const HEADINGS = /^(about this book|about the book|book description|description|synopsis|summary|overview|blurb)$/i;

function aboutSection(html: string): string | null {
  // Springer Nature: <section data-title="About this book"> … </section>.
  const springer = /<section\b[^>]*data-title\s*=\s*["']About this book["'][^>]*>([\s\S]*?)<\/section>/i.exec(html);
  if (springer) {
    const text = sectionText(springer[1]).replace(/^About this book\s*/i, "").trim();
    if (text.length >= MIN_DESCRIPTION_CHARS) return text;
  }
  // Elsewhere: a real heading named like a description, and what follows it up
  // to the next heading or the end of its section. A tab label is not a heading.
  const heading = /<h([1-4])\b[^>]*>([\s\S]{1,80}?)<\/h\1\s*>/gi;
  for (let m; (m = heading.exec(html)); ) {
    if (!HEADINGS.test(plainText(m[2]))) continue;
    const rest = html.slice(m.index + m[0].length, m.index + m[0].length + 40_000);
    const stop = rest.search(/<h[1-4]\b|<\/section\s*>|<\/article\s*>|<footer\b/i);
    const text = sectionText(stop === -1 ? rest : rest.slice(0, stop));
    if (text.length >= MIN_DESCRIPTION_CHARS) return text;
  }
  return null;
}

// ── Metadata ─────────────────────────────────────────────────────────────────

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = m[3] ?? m[4] ?? "";
  return out;
}

function metaDescriptions(html: string): { og: string[]; meta: string[] } {
  const og: string[] = [];
  const meta: string[] = [];
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(tag);
    const key = (a.property ?? a.name ?? a.itemprop ?? "").toLowerCase();
    const content = plainText(a.content ?? "");
    if (!content) continue;
    if (key === "og:description" || key === "twitter:description") og.push(content);
    else if (key === "description" || key === "dc.description" || key === "dcterms.abstract" || key === "citation_abstract") meta.push(content);
  }
  return { og, meta };
}

const BOOKISH = /^(book|product|creativework|thesis|scholarlyarticle|chapter|publicationvolume)$/i;

function jsonLdDescriptions(html: string): string[] {
  const out: string[] = [];
  const visit = (node: unknown, depth: number): void => {
    if (depth > 4 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1));
    const o = node as Record<string, unknown>;
    const types = ([] as unknown[]).concat(o["@type"] ?? []).map(String);
    // An Organization's description is the publisher's, not the book's.
    if (types.some((t) => BOOKISH.test(t)) && typeof o.description === "string") out.push(plainParagraphs(o.description));
    for (const key of ["@graph", "mainEntity", "workExample"]) visit(o[key], depth + 1);
  };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try {
      visit(JSON.parse(m[1]), 0);
    } catch {
      // A malformed block is someone else's bug; the other sources still count.
    }
  }
  return out;
}

export function extractPublisherDescription(html: string): ExtractedDescription | null {
  const about = aboutSection(html);
  if (about) return { text: clip(about), source: "about_section", truncated: isTruncated(about) };

  const { og, meta } = metaDescriptions(html);
  const candidates: { text: string; source: DescriptionSource }[] = [
    ...jsonLdDescriptions(html).map((text) => ({ text, source: "json_ld" as const })),
    ...og.map((text) => ({ text, source: "og" as const })),
    ...meta.map((text) => ({ text, source: "meta" as const })),
  ].filter((c) => c.text.length >= MIN_DESCRIPTION_CHARS);
  if (candidates.length === 0) return null;

  // Longest wins; an untruncated text beats a longer one that says it was cut.
  candidates.sort((a, b) => Number(isTruncated(a.text)) - Number(isTruncated(b.text)) || b.text.length - a.text.length);
  const best = candidates[0];
  return { text: clip(best.text), source: best.source, truncated: isTruncated(best.text) };
}

// ── Pages that are not the book ──────────────────────────────────────────────

const WALL_TITLES = /^(client challenge|just a moment|attention required|access denied|are you a robot|security check|please wait|verifying you are human|one more step)/i;

/** A bot check, served instead of the page. Its text is never a description. */
export function looksLikeBotWall(html: string): boolean {
  const title = /<title\b[^>]*>([\s\S]{0,200}?)<\/title\s*>/i.exec(html);
  if (title && WALL_TITLES.test(plainText(title[1]))) return true;
  // Cloudflare, Springer's own (/_fs-ch-), DataDome, PerimeterX, AWS WAF (OUP).
  return /challenge-platform|cf-browser-verification|cf_chl_|\/_fs-ch-|captcha-delivery\.com|perimeterx|px-captcha|AwsWafIntegration|gokuProps/i.test(html.slice(0, 50_000));
}

/** The DOI in a publisher URL (Springer /book/10.1007/…, Wiley and T&F /doi/…), if any. */
export function doiFromUrl(raw: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(new URL(raw).pathname);
  } catch {
    return null;
  }
  const m = /(10\.\d{4,9}\/[^\s?#]+)/.exec(path);
  return m ? normalizeDoi(m[1].replace(/\/+$/, "")) : null;
}

/** A Crossref record's abstract as plain paragraphs, or null. */
export function crossrefAbstract(body: unknown): string | null {
  const m = (body as { message?: { abstract?: unknown } } | null)?.message;
  if (typeof m?.abstract !== "string") return null;
  const text = plainParagraphs(m.abstract).replace(/^abstract\s*:?\s*/i, "").trim();
  return text.length >= MIN_DESCRIPTION_CHARS ? clip(text) : null;
}
