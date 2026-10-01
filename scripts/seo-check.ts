// scripts/seo-check.ts
//
//   npx tsx scripts/seo-check.ts --base http://localhost:3100
//   npx tsx scripts/seo-check.ts --base http://localhost:3100 --phase 1     # gate a phase
//   npx tsx scripts/seo-check.ts --base https://library.ptec.edu.kh          # BASELINE only
//   npx tsx scripts/seo-check.ts --base <url> --json reports/seo/check.json   # or --json alone: stdout
//   npx tsx scripts/seo-check.ts --base <url> --inventory                    # head facts per URL
//   npx tsx scripts/seo-check.ts --base <url> --description-gate             # the origin runs SEO_DESCRIPTION_GATE=on
//
// READ-ONLY. Fetches server HTML (no browser, no JavaScript) for a fixed list of
// URLs, one per public template in each locale (scripts/seo-urls.json), plus a
// sample of the sitemap, and checks each against the SEO invariants in
// docs/seo/AUDIT-VERIFICATION.md. Prints one row per finding and exits 1 if any
// ERROR at or below the gated phase remains.
//
// ── Levels ───────────────────────────────────────────────────────────────────
//
//   ok       the rule holds
//   error    the origin answered and the answer breaks a rule at or below --phase
//   todo     the same, for a rule a LATER phase delivers — reported, never fatal
//   warn     a content-length or heuristic check; never fatal
//   unknown  no answer was obtained; says nothing about the site (lib/verify/http)
//
// Every check carries the phase that makes it true. Phase 0 is what already
// works and must be protected (the master prompt's §3); a phase-N run gates
// phases 0..N and reports the rest as `todo`. The default gates everything,
// which is what a baseline wants: the full distance to the target.
//
// ── Why server HTML, and why "hidden" matters ────────────────────────────────
//
// Every public route streams behind its loading.tsx, so the page body arrives
// inside <div hidden id="S:n"> and is revealed by an inline script. Google
// renders JavaScript and sees it; a consumer that does not (most AI crawlers,
// HTML-to-text tools) sees the skeleton. `h1-visible-without-js` measures that
// directly — it is why an outside audit reported "no H1" on pages that have one.
//
// ── Production is fragile: this is not a crawler ─────────────────────────────
//
// Requests are strictly sequential with a pause (--delay, default 400 ms), and
// the run ABORTS on the second 5xx (--max-5xx): on 2026-09-24 six concurrent
// requests took the origin to 502. Point it at a local production build
// (`next build && next start`) for phase work; production is for baselines.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RETRY_DELAYS_MS, TransportError, type Outcome } from "../lib/verify/http";

// jsdom ships no type declarations and @types/jsdom is not installed; this is
// the whole surface used, typed against the DOM lib the repo already loads.
type JSDOMInstance = { window: { document: Document; close(): void } };
type JSDOMModule = {
  JSDOM: new (input: string, opts?: { contentType?: string; virtualConsole?: unknown }) => JSDOMInstance;
  VirtualConsole: new () => unknown;
};
// Loaded on first use, so the pure helpers below can be imported by a test
// without a DOM library, argv or network.
let jsdomModule: JSDOMModule | null = null;
function jsdom(): JSDOMModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- see the comment above
  jsdomModule ??= require("jsdom") as JSDOMModule;
  return jsdomModule;
}

/**
 * A value for one cell of a Markdown table. Backslashes are escaped FIRST:
 * escaping only `|` turns an input `\|` into `\\|`, which is an escaped
 * backslash followed by a live pipe — the cell splits (CodeQL
 * js/incomplete-sanitization, #155–#157).
 */
export function mdCell(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

// ── Arguments ────────────────────────────────────────────────────────────────

type Args = {
  base: string;
  site: string;
  urls: string;
  sitemapSample: number;
  json: string | null;
  phase: number;
  delay: number;
  max5xx: number;
  timeout: number;
  ua: string;
  only: string | null;
  inventory: boolean;
  verbose: boolean;
  strict: boolean;
  /** The origin runs SEO_DESCRIPTION_GATE=on (Phase 5.4): withheld books stay
   *  on /books but leave the sitemap, so the sitemap may hold FEWER. */
  descriptionGate: boolean;
};

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | null => {
    const i = argv.indexOf(`--${name}`);
    if (i === -1) return null;
    const v = argv[i + 1];
    return v && !v.startsWith("--") ? v : "";
  };
  const has = (name: string) => argv.includes(`--${name}`);
  const base = get("base");
  if (!base) {
    console.error("usage: npx tsx scripts/seo-check.ts --base <origin> [--phase N] [--json file] [--sitemap-sample N] [--inventory]");
    process.exit(2);
  }
  return {
    base: new URL(base).origin,
    site: new URL(get("site") || "https://library.ptec.edu.kh").origin,
    urls: get("urls") || join(__dirname, "seo-urls.json"),
    sitemapSample: Number(get("sitemap-sample") ?? 3) || 0,
    json: has("json") ? get("json") || "-" : null,
    phase: get("phase") === null ? 7 : Number(get("phase")),
    delay: Number(get("delay") ?? 400),
    max5xx: Number(get("max-5xx") ?? 2),
    timeout: Number(get("timeout") ?? 30_000),
    ua: get("ua") || "Mozilla/5.0 (compatible; ptec-seo-check/1.0; +https://library.ptec.edu.kh/llms.txt)",
    only: get("only"),
    inventory: has("inventory"),
    verbose: has("verbose"),
    strict: has("strict"),
    descriptionGate: has("description-gate"),
  };
}

let args!: Args;

// ── The check registry: every check id, the phase that makes it true ─────────

type Level = "ok" | "error" | "todo" | "warn" | "unknown";
type CheckDef = { phase: number; finding?: string; warnOnly?: boolean; about: string };

const CHECKS: Record<string, CheckDef> = {
  status: { phase: 0, about: "HTTP status as expected (200, 404, or the redirect under test)" },
  "redirect-target": { phase: 0, about: "a redirect under test lands where expected, in one hop" },
  "html-lang": { phase: 0, about: "<html lang> is en at the root and km under /km" },
  "title-present": { phase: 0, about: "exactly one non-empty <title>, in <head>" },
  "title-no-ellipsis": { phase: 1, finding: "F7", about: "no trailing … or ... unless the item title has one" },
  "title-contains-item": { phase: 1, finding: "F7", about: "a record's <title> contains its full item title (the H1)" },
  "title-length": { phase: 1, finding: "F7", warnOnly: true, about: "title ≤ 70 graphemes" },
  "hub-title-h1": { phase: 2, finding: "N5", about: "a hub's <title> names what its H1 says" },
  "title-km-brand": { phase: 1, finding: "F9", about: "a /km title does not end in the Latin brand" },
  "desc-present": { phase: 0, about: "exactly one non-empty meta description" },
  "desc-no-ellipsis": { phase: 1, finding: "F7", about: "no trailing … or ... (a cut mid-word or mid-sentence)" },
  "desc-length": { phase: 1, finding: "F7", warnOnly: true, about: "description 70–165 characters" },
  "desc-sentence-end": { phase: 1, finding: "F7", warnOnly: true, about: "description ends at sentence punctuation" },
  canonical: { phase: 0, about: "one absolute https canonical: self on indexable pages, the base list on filters" },
  robots: { phase: 0, about: "robots matches the template's expectation (meta + X-Robots-Tag)" },
  "hreflang-set": { phase: 0, finding: "F5", about: "indexable pages list en, km and x-default (x-default = en)" },
  "hreflang-reciprocal": { phase: 0, finding: "F5", about: "every hreflang target answers 200, is indexable and lists the page back" },
  "hreflang-on-noindex": { phase: 1, finding: "F5", about: "a noindex page carries no hreflang" },
  "h1-single": { phase: 0, finding: "F2", about: "exactly one non-empty <h1> in the document" },
  "h1-visible-without-js": { phase: 1, finding: "F2", about: "the <h1> is not inside a hidden streaming container" },
  "footer-headings": { phase: 1, finding: "F2", about: "the site footer uses no heading elements" },
  "jsonld-parse": { phase: 0, finding: "F10", about: "every application/ld+json block parses" },
  "jsonld-types": { phase: 0, finding: "F10", about: "the template's current JSON-LD @types are present" },
  "jsonld-target-types": { phase: 4, finding: "F10", about: "the Phase 4 target @types are present" },
  "jsonld-single-block": { phase: 4, finding: "F10", about: "one ld+json block holding an @graph" },
  "jsonld-no-searchaction": { phase: 4, finding: "F10", about: "no SearchAction in the graph" },
  "jsonld-empty-values": { phase: 4, finding: "F10", about: "no null, empty or 'undefined' value in any node" },
  "citation-required": { phase: 0, finding: "F4", about: "scholarly records: citation_title, ≥1 citation_author, valid date — on the page in the work's own language (a book with no trusted year warns, D11)" },
  "citation-date-precision": { phase: 1, finding: "F9", warnOnly: true, about: "citation date not padded to 01/01" },
  "citation-locale": { phase: 3, finding: "F4", about: "citation_* only on the locale matching citation_language" },
  "citation-pdf": { phase: 3, finding: "F4", about: "citation_pdf_url in the abstract's directory, robots-allowed, anonymous 200 application/pdf" },
  "og-type": { phase: 0, finding: "F9", about: "og:type matches the template" },
  "og-url": { phase: 0, about: "og:url equals the canonical" },
  cacheable: { phase: 0, about: "a page served from the ISR/static cache stays shared-cacheable (never private, no-store)" },
  "card-links": { phase: 0, finding: "F4", about: "listing cards are <a href> links to detail URLs" },
  "results-total-attr": { phase: 1, finding: "F1", about: "listings expose data-results-total" },
  "totals-parity": { phase: 0, finding: "F1", about: "/books, /books?page=1 and /km/books report the same total" },
  "robots-txt": { phase: 0, about: "robots.txt parses, has no directive Google rejects, and names a sitemap" },
  "robots-protected": { phase: 0, about: "private paths are disallowed in both locales for every group" },
  "robots-public": { phase: 0, about: "public URLs are allowed for Googlebot and the AI crawlers" },
  "robots-ai-group": { phase: 0, about: "an explicit AI-crawler group exists" },
  "llms-txt": { phase: 0, about: "/llms.txt answers 200" },
  "sitemap-fetch": { phase: 0, finding: "F6", about: "every sitemap named by robots.txt answers 200 and parses" },
  "sitemap-index": { phase: 1, finding: "F6", about: "a sitemap index with one child per type" },
  "sitemap-limits": { phase: 0, finding: "F6", about: "≤ 50,000 URLs and ≤ 50 MB per file" },
  "sitemap-locs": { phase: 0, finding: "F6", about: "every <loc> is absolute https on the site, unique, query-free and robots-allowed" },
  "sitemap-loc-encoding": { phase: 1, finding: "F6", about: "<loc> is percent-encoded, byte-identical to the canonical" },
  "sitemap-lastmod-format": { phase: 0, finding: "F6", about: "every lastmod is ISO 8601 with a timezone, not in the future" },
  "sitemap-lastmod-placeholder": { phase: 1, finding: "F6", about: "no placeholder lastmod (YYYY-01-01T00:00:00)" },
  "sitemap-xdefault": { phase: 1, finding: "F6", about: "every entry's alternates include x-default" },
  "sitemap-no-catalog-records": { phase: 2, finding: "F12", about: "catalogue records are not in the sitemap" },
  "sitemap-books-vs-listing": { phase: 0, finding: "F6", about: "sitemap book count equals the /books total (with --description-gate: at most it, the gap reported)" },
  "sitemap-sample": { phase: 0, finding: "F6", about: "sampled URLs: 200, indexable, self-canonical" },
  "sitemap-sample-alternates": { phase: 0, finding: "F6", about: "sampled URLs: sitemap alternates equal the page's hreflang" },
  "sitemap-sample-loc-exact": { phase: 1, finding: "F6", about: "sampled URLs: <loc> byte-identical to the page canonical" },
};

type Row = { url: string; check: string; level: Level; phase: number; finding: string; detail: string };
const rows: Row[] = [];

function record(url: string, check: string, outcome: Outcome, detail = "", phaseOverride?: number): void {
  const def = CHECKS[check];
  if (!def) throw new Error(`unregistered check ${check}`);
  const phase = phaseOverride ?? def.phase;
  let level: Level;
  if (outcome === "ok") level = "ok";
  else if (outcome === "unknown") level = "unknown";
  else if (def.warnOnly || outcome === "warn") level = "warn";
  else level = phase <= args.phase ? "error" : "todo";
  rows.push({ url, check, level, phase, finding: def.finding ?? "", detail });
}
const pass = (url: string, check: string, detail = "", p?: number) => record(url, check, "ok", detail, p);
const fail = (url: string, check: string, detail: string, p?: number) => record(url, check, "fail", detail, p);
const judge = (url: string, check: string, okay: boolean, detail: string, p?: number) =>
  record(url, check, okay ? "ok" : "fail", detail, p);

// ── HTTP: sequential, paced, bounded ─────────────────────────────────────────

type Res = { url: string; status: number; headers: Headers; body: string; ms: number };
class AbortRun extends Error {}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastRequestAt = 0;
let fiveXX = 0;
let requestCount = 0;

async function request(
  url: string,
  init: { headers?: Record<string, string>; readBody?: boolean } = {},
): Promise<Res> {
  let lastError = "";
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);
    const wait = lastRequestAt + args.delay - Date.now();
    if (wait > 0) await sleep(wait);
    const t0 = Date.now();
    lastRequestAt = t0;
    requestCount++;
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        headers: { "user-agent": args.ua, ...init.headers },
        signal: AbortSignal.timeout(args.timeout),
      });
    } catch (err) {
      lastError = (err as Error).message || String(err);
      continue;
    }
    lastRequestAt = Date.now();
    if (res.status >= 500) {
      fiveXX++;
      await res.body?.cancel().catch(() => {});
      if (fiveXX >= args.max5xx) throw new AbortRun(`${fiveXX} responses with 5xx (last: ${res.status} ${url}) — stopping so the run does not add load`);
      if (attempt < RETRY_DELAYS_MS.length) continue;
    } else if (res.status === 429 && attempt < RETRY_DELAYS_MS.length) {
      await res.body?.cancel().catch(() => {});
      continue;
    }
    let body = "";
    if (init.readBody === false) await res.body?.cancel().catch(() => {});
    else body = await res.text();
    return { url, status: res.status, headers: res.headers, body, ms: Date.now() - t0 };
  }
  throw new TransportError(lastError || "no response", RETRY_DELAYS_MS.length + 1);
}

/** The site origin (what canonicals name) mapped onto the origin under test. */
function toBase(u: string): string {
  const url = new URL(u);
  if (url.origin === args.site) return args.base + url.pathname + url.search;
  return url.href;
}
function sameUrl(a: string, b: string): boolean {
  try {
    return new URL(a).href === new URL(b).href;
  } catch {
    return false;
  }
}
function siteUrl(path: string): string {
  return new URL(path, args.site).href;
}

// ── Documents ────────────────────────────────────────────────────────────────

type Page = {
  requested: string; // site URL of the page
  res: Res;
  doc: Document | null;
  lang: string | null;
  titles: string[];
  titleInBody: number;
  descriptions: string[];
  canonicals: string[];
  robotsMeta: string[];
  xRobots: string;
  noindex: boolean;
  hreflang: Map<string, string>;
  /** `translated`: the full text of a sibling right after the H1 that is in
   *  another language — the bilingual record header's translated title. */
  h1s: { text: string; hidden: boolean; translated: string | null }[];
  footerHeadings: number;
  jsonldBlocks: { ok: boolean; error?: string; data?: unknown; inHead: boolean }[];
  jsonldTypes: Set<string>;
  citations: Map<string, string[]>;
  og: Map<string, string>;
  anchors: string[];
  resultsTotalAttr: string | null;
  bodyText: string;
};

const pages = new Map<string, Promise<Page>>();
let virtualConsole: unknown = null;
function quietConsole(): unknown {
  virtualConsole ??= new (jsdom().VirtualConsole)();
  return virtualConsole;
}

function parseHtml(html: string): Document {
  return new (jsdom().JSDOM)(html, { virtualConsole: quietConsole() }).window.document;
}

function textOf(el: Element | null): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function collectTypes(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const n of node) collectTypes(n, into);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  if (typeof t === "string") into.add(t);
  else if (Array.isArray(t)) for (const x of t) if (typeof x === "string") into.add(x);
  for (const [k, v] of Object.entries(obj)) if (k !== "@context") collectTypes(v, into);
}

function loadPage(siteHref: string): Promise<Page> {
  const key = new URL(siteHref).href;
  let p = pages.get(key);
  if (!p) {
    p = (async () => {
      const res = await request(toBase(key));
      const page: Page = {
        requested: key,
        res,
        doc: null,
        lang: null,
        titles: [],
        titleInBody: 0,
        descriptions: [],
        canonicals: [],
        robotsMeta: [],
        xRobots: res.headers.get("x-robots-tag") ?? "",
        noindex: false,
        hreflang: new Map(),
        h1s: [],
        footerHeadings: 0,
        jsonldBlocks: [],
        jsonldTypes: new Set(),
        citations: new Map(),
        og: new Map(),
        anchors: [],
        resultsTotalAttr: null,
        bodyText: "",
      };
      const type = res.headers.get("content-type") ?? "";
      if (res.status !== 200 || !type.includes("text/html")) return page;
      const doc = parseHtml(res.body);
      page.doc = doc;
      page.lang = doc.documentElement.getAttribute("lang");
      page.titles = [...doc.head.querySelectorAll("title")].map((t) => textOf(t));
      page.titleInBody = doc.body ? doc.body.querySelectorAll("title").length : 0;
      page.descriptions = [...doc.querySelectorAll('meta[name="description"]')].map((m) => m.getAttribute("content") ?? "");
      page.canonicals = [...doc.querySelectorAll('link[rel="canonical"]')].map((l) => l.getAttribute("href") ?? "");
      page.robotsMeta = [...doc.querySelectorAll('meta[name="robots"], meta[name="googlebot"]')].map((m) => (m.getAttribute("content") ?? "").toLowerCase());
      page.noindex = [...page.robotsMeta, page.xRobots.toLowerCase()].some((v) => /\b(noindex|none)\b/.test(v));
      for (const l of doc.querySelectorAll('link[rel="alternate"][hreflang]')) {
        page.hreflang.set((l.getAttribute("hreflang") ?? "").toLowerCase(), l.getAttribute("href") ?? "");
      }
      page.h1s = [...doc.querySelectorAll("h1")].map((h) => {
        const next = h.nextElementSibling;
        const nextLang = next?.getAttribute("lang");
        const translated = next && nextLang && nextLang !== (h.getAttribute("lang") ?? page.lang) ? textOf(next) : null;
        return { text: textOf(h), hidden: h.closest("[hidden]") !== null, translated };
      });
      page.footerHeadings = [...doc.querySelectorAll("footer")]
        .filter((f) => !f.closest("main, article, section"))
        .reduce((n, f) => n + f.querySelectorAll("h1, h2, h3, h4, h5, h6").length, 0);
      for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) {
        const inHead = s.closest("head") !== null;
        try {
          const data: unknown = JSON.parse(s.textContent ?? "");
          page.jsonldBlocks.push({ ok: true, data, inHead });
          collectTypes(data, page.jsonldTypes);
        } catch (err) {
          page.jsonldBlocks.push({ ok: false, error: (err as Error).message, inHead });
        }
      }
      for (const m of doc.querySelectorAll('meta[name^="citation_"]')) {
        const name = m.getAttribute("name") ?? "";
        const list = page.citations.get(name) ?? [];
        list.push(m.getAttribute("content") ?? "");
        page.citations.set(name, list);
      }
      for (const m of doc.querySelectorAll('meta[property^="og:"]')) {
        const prop = m.getAttribute("property") ?? "";
        if (!page.og.has(prop)) page.og.set(prop, m.getAttribute("content") ?? "");
      }
      page.anchors = [...doc.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") ?? "");
      page.resultsTotalAttr = doc.querySelector("[data-results-total]")?.getAttribute("data-results-total") ?? null;
      page.bodyText = textOf(doc.body);
      return page;
    })();
    pages.set(key, p);
  }
  return p;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

export const graphemes = (s: string) => [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)].length;
const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
export const ELLIPSIS = /(\.\.\.|…)\s*$/;
export const SENTENCE_END = /[.!?។៕)»”"'’:;]\s*$/;
const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩";
const toAsciiDigits = (s: string) => s.replace(/[០-៩]/g, (d) => String(KHMER_DIGITS.indexOf(d)));
export const localeOf = (path: string) => (path === "/km" || path.startsWith("/km/") || path.startsWith("/km?") ? "km" : "en");
/** Brand suffix: the part after the last " · " or " | ", if any. */
export function stripBrand(title: string): string {
  const m = title.match(/^(.*)\s[·|]\s[^·|]+$/);
  return m ? m[1] : title;
}

/** "Showing 1–18 of 1,956" / "… នៃ ១,៩៥៦" → 1956. The attribute wins when present. */
export function totalFromText(attr: string | null, text: string): number | null {
  if (attr) return Number(toAsciiDigits(attr).replace(/,/g, ""));
  const m = text.match(/(?:\bof|នៃ)\s*([0-9០-៩][0-9០-៩,]*)/);
  return m ? Number(toAsciiDigits(m[1]).replace(/,/g, "")) : null;
}
const resultsTotal = (page: Page) => totalFromText(page.resultsTotalAttr, page.bodyText);

/** W3C datetime with a timezone (a date alone has none). */
export const LASTMOD_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
/** Midnight on 1 January, or before 2000: a default written where no date was known. */
export const isPlaceholderLastmod = (v: string) =>
  /^\d{4}-01-01T00:00:00(\.0+)?(Z|\+00:00)$/.test(v) || Date.parse(v) < Date.parse("2000-01-01");

const REQUIRED_FIELDS: Record<string, string[]> = {
  Book: ["name"],
  Thesis: ["name", "author"],
  ScholarlyArticle: ["headline|name"],
  BreadcrumbList: ["itemListElement"],
  ItemList: ["itemListElement"],
  CollectionPage: ["name"],
  Person: ["name"],
  WebSite: ["name", "url"],
  Library: ["name"],
  EducationalOrganization: ["name"],
  CollegeOrUniversity: ["name"],
  Course: ["name"],
  LearningResource: ["name"],
  BlogPosting: ["headline"],
  NewsArticle: ["headline"],
  ProfilePage: ["mainEntity"],
  Periodical: ["name"],
};

export function emptyValuePaths(node: unknown, path = "$", out: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((n, i) => emptyValuePaths(n, `${path}[${i}]`, out));
    return out;
  }
  if (node === null) {
    out.push(`${path} = null`);
    return out;
  }
  if (typeof node === "string") {
    if (node.trim() === "" || node === "undefined" || node === "null" || node === "NaN") out.push(`${path} = "${node}"`);
    return out;
  }
  if (typeof node !== "object") return out;
  const obj = node as Record<string, unknown>;
  const types = typeof obj["@type"] === "string" ? [obj["@type"] as string] : Array.isArray(obj["@type"]) ? (obj["@type"] as string[]) : [];
  for (const t of types) {
    for (const req of REQUIRED_FIELDS[t] ?? []) {
      if (!req.split("|").some((k) => obj[k] !== undefined)) out.push(`${path} (${t}) missing ${req}`);
    }
  }
  for (const [k, v] of Object.entries(obj)) emptyValuePaths(v, `${path}.${k}`, out);
  return out;
}

// ── robots.txt, read as Googlebot reads it ───────────────────────────────────
//
// Groups by User-agent; the most specific matching group wins (groups naming
// the same agent merge), else `*`. Rules: `*` wildcard, `$` end anchor; the
// LONGEST matching pattern decides and Allow wins a tie. lib/verify/crawl-policy
// covers only the `*` group's Disallow lines, which cannot answer "is this
// allowed for GPTBot" or "does an Allow override this", so it is not reused.

type RobotsRule = { allow: boolean; pattern: string };
type Robots = { groups: { agents: string[]; rules: RobotsRule[] }[]; sitemaps: string[]; unknown: string[] };

export function parseRobots(txt: string): Robots {
  const robots: Robots = { groups: [], sitemaps: [], unknown: [] };
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) {
      robots.unknown.push(line);
      continue;
    }
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        robots.groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "allow" || key === "disallow") {
      if (current && value) current.rules.push({ allow: key === "allow", pattern: value });
    } else if (key === "sitemap") robots.sitemaps.push(value);
    else if (key !== "crawl-delay") robots.unknown.push(line);
  }
  return robots;
}

export function robotsAllows(robots: Robots, agent: string, pathAndQuery: string): { allowed: boolean; rule: string } {
  const a = agent.toLowerCase();
  let groups = robots.groups.filter((g) => g.agents.includes(a));
  if (groups.length === 0) groups = robots.groups.filter((g) => g.agents.includes("*"));
  let best: RobotsRule | null = null;
  for (const g of groups) {
    for (const r of g.rules) {
      const anchored = r.pattern.endsWith("$");
      const body = anchored ? r.pattern.slice(0, -1) : r.pattern;
      const re = new RegExp("^" + body.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : ""));
      if (!re.test(pathAndQuery)) continue;
      if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow && !best.allow)) best = r;
    }
  }
  return { allowed: best ? best.allow : true, rule: best ? `${best.allow ? "Allow" : "Disallow"}: ${best.pattern}` : "(no rule)" };
}

// ── The URL list ─────────────────────────────────────────────────────────────

type Template = {
  status?: number;
  location?: string;
  robots?: "index" | "noindex";
  robotsPhase?: number;
  hreflang?: boolean;
  record?: boolean;
  /** Phase 2 (N5): the hub's <title> must contain its H1. */
  hubTitleH1?: boolean;
  scholarly?: boolean;
  jsonld?: string[];
  jsonldTarget?: string[];
  ogType?: string;
  ogTypePhase?: number;
  cardLinks?: string;
  total?: boolean;
  /** The page is prerendered or ISR today and must stay shared-cacheable. */
  cacheable?: boolean;
};
type UrlEntry = {
  path: string;
  template: string;
  canonical?: string;
  location?: string;
  note?: string;
  /** Checks this environment cannot verify, with the reason — recorded as
   *  "could not be checked", never as a pass (e.g. a local stack with no
   *  storage server cannot serve a seed PDF). Only the part that needs the
   *  missing service is skipped; everything else is still judged. */
  unverifiable?: Record<string, string>;
};
type UrlFile = { sitewideJsonld: string[]; sitewideJsonldTarget: string[]; templates: Record<string, Template>; urls: UrlEntry[] };

let urlFile!: UrlFile;

// ── Per-URL checks ───────────────────────────────────────────────────────────

let robotsTxt: Robots | null = null;

async function checkUrl(entry: UrlEntry): Promise<void> {
  const tpl = urlFile.templates[entry.template];
  if (!tpl) throw new Error(`unknown template ${entry.template} for ${entry.path}`);
  const url = siteUrl(entry.path);
  const label = entry.path;
  const page = await loadPage(url);
  const { res } = page;
  const expectStatus = tpl.status ?? 200;

  if (expectStatus >= 300 && expectStatus < 400) {
    const loc = res.headers.get("location") ?? "";
    judge(label, "status", res.status === expectStatus, `${res.status} (expected ${expectStatus})`);
    const expectedLocation = entry.location ?? tpl.location;
    if (expectedLocation) {
      const target = new URL(loc, toBase(url));
      const want = new URL(expectedLocation, args.base);
      judge(label, "redirect-target", target.pathname + target.search === want.pathname + want.search, `→ ${loc || "(none)"}`);
    }
    return;
  }
  if (res.status !== expectStatus) {
    fail(label, "status", `${res.status}${res.headers.get("location") ? " → " + res.headers.get("location") : ""} (expected ${expectStatus})`);
    return;
  }
  pass(label, "status", String(res.status));
  if (expectStatus !== 200 || !page.doc) return;

  const locale = localeOf(entry.path);
  judge(label, "html-lang", page.lang === locale, `lang=${page.lang}`);

  // Title
  const title = page.titles[0] ?? "";
  judge(label, "title-present", page.titles.length === 1 && title !== "" && page.titleInBody === 0,
    `${page.titles.length} in head, ${page.titleInBody} in body: "${title}"`);
  const h1 = page.h1s.find((h) => h.text) ?? null;
  const itemEllipsis = h1 ? ELLIPSIS.test(h1.text) : false;
  judge(label, "title-no-ellipsis", !ELLIPSIS.test(stripBrand(title)) || itemEllipsis, `"${title}"`);
  // The item's full name, or its full translated title where the page shows
  // one under the H1 (a bilingual header): what must not happen is a CUT.
  if (tpl.record && h1) {
    // An English hub may follow its name with the Khmer one in parentheses
    // ("Mathematics (គណិតវិទ្យា)", Phase 2.1); the name before it is the item.
    const bare = h1.text.replace(/\s*\([\u1780-\u17FF\u19E0-\u19FF\s]+\)\s*$/u, "");
    const whole =
      norm(title).includes(norm(h1.text)) ||
      (bare !== h1.text && bare.trim() !== "" && norm(title).includes(norm(bare))) ||
      (h1.translated !== null && norm(title).includes(norm(h1.translated)));
    judge(label, "title-contains-item", whole, `title "${title}" vs H1 "${h1.text}"${h1.translated ? ` / "${h1.translated}"` : ""}`);
  }
  if (tpl.hubTitleH1 && h1) {
    judge(label, "hub-title-h1", norm(title).includes(norm(h1.text)), `title "${title}" vs H1 "${h1.text}"`);
  }
  const tlen = graphemes(title);
  record(label, "title-length", tlen <= 70 ? "ok" : "warn", `${tlen} graphemes`);
  if (locale === "km") judge(label, "title-km-brand", !/PTEC Library\s*$/.test(title), `"${title}"`);

  // Description
  const desc = page.descriptions[0] ?? "";
  judge(label, "desc-present", page.descriptions.length === 1 && desc.trim() !== "", `${page.descriptions.length} description(s)`);
  if (desc) {
    judge(label, "desc-no-ellipsis", !ELLIPSIS.test(desc), `…${desc.slice(-40)}`);
    const dlen = [...desc].length;
    record(label, "desc-length", dlen >= 70 && dlen <= 165 ? "ok" : "warn", `${dlen} characters`);
    record(label, "desc-sentence-end", SENTENCE_END.test(desc) && !ELLIPSIS.test(desc) ? "ok" : "warn", `…${desc.slice(-30)}`);
  }

  // Canonical — required on pages meant to be indexed; on a noindex page it is
  // optional, but one that exists must still be right (a filter → its base list).
  const expectIndex = tpl.robots !== "noindex";
  const canonical = page.canonicals[0] ?? "";
  if (expectIndex || page.canonicals.length > 0) {
    const wantCanonical = siteUrl(entry.canonical ?? entry.path);
    const canonicalOk = page.canonicals.length === 1 && canonical.startsWith("https://") && sameUrl(canonical, wantCanonical);
    judge(label, "canonical", canonicalOk, `${page.canonicals.length} canonical(s): ${canonical || "(none)"}${canonicalOk ? "" : ` (expected ${wantCanonical})`}`);
  }

  // Robots
  if (tpl.robots) {
    const got = page.noindex ? "noindex" : "index";
    judge(label, "robots", got === tpl.robots, `${got} [meta: ${page.robotsMeta.join(" | ") || "none"}; header: ${page.xRobots || "none"}]`, tpl.robotsPhase);
  }

  // Hreflang
  if (tpl.hreflang && !page.noindex) {
    const en = page.hreflang.get("en");
    const km = page.hreflang.get("km");
    const xd = page.hreflang.get("x-default");
    judge(label, "hreflang-set", Boolean(en && km && xd && sameUrl(xd, en)), `en=${en ?? "-"} km=${km ?? "-"} x-default=${xd ?? "-"}`);
    const problems: string[] = [];
    for (const [lang, href] of page.hreflang) {
      if (lang === "x-default" || sameUrl(href, canonical)) continue;
      try {
        const alt = await loadPage(href);
        if (alt.res.status !== 200) problems.push(`${lang}: ${alt.res.status}`);
        else if (alt.noindex) problems.push(`${lang}: noindex`);
        else {
          const back = alt.hreflang.get(locale);
          if (!back || !sameUrl(back, canonical)) problems.push(`${lang}: lists ${locale}=${back ?? "(none)"}`);
        }
      } catch (err) {
        if (err instanceof AbortRun) throw err;
        problems.push(`${lang}: no answer`);
      }
    }
    judge(label, "hreflang-reciprocal", problems.length === 0, problems.join("; ") || `${page.hreflang.size} targets reciprocal`);
  }
  if (page.noindex) judge(label, "hreflang-on-noindex", page.hreflang.size === 0, `${page.hreflang.size} hreflang link(s) on a noindex page`);

  // Headings — the H1 rules are about pages a search engine should read.
  const nonEmpty = page.h1s.filter((h) => h.text);
  if (expectIndex) {
    judge(label, "h1-single", nonEmpty.length === 1 && page.h1s.length === 1, `${page.h1s.length} h1: ${page.h1s.map((h) => `"${h.text.slice(0, 50)}"`).join(", ")}`);
    if (nonEmpty.length > 0) judge(label, "h1-visible-without-js", nonEmpty.some((h) => !h.hidden), nonEmpty[0].hidden ? "h1 is inside a hidden streaming container" : "visible");
  }
  judge(label, "footer-headings", page.footerHeadings === 0, `${page.footerHeadings} heading element(s) in the site footer`);

  // JSON-LD
  const badBlocks = page.jsonldBlocks.filter((b) => !b.ok);
  judge(label, "jsonld-parse", badBlocks.length === 0, badBlocks.length ? badBlocks.map((b) => b.error).join("; ") : `${page.jsonldBlocks.length} block(s)`);
  const types = page.jsonldTypes;
  // A noindex page may carry no structured data at all (the reader, search,
  // the offline shell): markup on a page crawlers are told not to index
  // describes nothing anyone will see. What it carries must still be sound.
  const optionalGraph = tpl.robots === "noindex" && page.jsonldBlocks.length === 0;
  const wantNow = optionalGraph ? [] : [...urlFile.sitewideJsonld, ...(tpl.jsonld ?? [])];
  const missingNow = wantNow.filter((t) => !types.has(t));
  judge(label, "jsonld-types", missingNow.length === 0, missingNow.length ? `missing ${missingNow.join(", ")}; has ${[...types].join(", ")}` : [...types].join(", "));
  const wantTarget = optionalGraph ? [] : [...urlFile.sitewideJsonldTarget, ...(tpl.jsonldTarget ?? [])];
  const missingTarget = wantTarget.filter((t) => !types.has(t));
  judge(label, "jsonld-target-types", missingTarget.length === 0, missingTarget.length ? `missing ${missingTarget.join(", ")}` : "all present");
  judge(label, "jsonld-single-block", page.jsonldBlocks.length === 1 || optionalGraph, `${page.jsonldBlocks.length} blocks (${page.jsonldBlocks.filter((b) => b.inHead).length} in head)`);
  judge(label, "jsonld-no-searchaction", !types.has("SearchAction"), types.has("SearchAction") ? "SearchAction present" : "none");
  const empties = page.jsonldBlocks.flatMap((b) => (b.ok ? emptyValuePaths(b.data) : []));
  judge(label, "jsonld-empty-values", empties.length === 0, empties.slice(0, 4).join("; ") + (empties.length > 4 ? ` (+${empties.length - 4})` : ""));

  // Scholar
  if (tpl.scholarly) {
    // One Scholar record per work (Phase 3.3): the tags live on the page in
    // the work's own language. A page without them passes only when its
    // other-language version carries them (loadPage is cached — the hreflang
    // check above already fetched it).
    let cites = page.citations;
    let where = "";
    if (!cites.get("citation_title")) {
      const other = [...page.hreflang].find(([lang]) => lang !== "x-default" && lang !== locale);
      if (other) {
        try {
          const alt = await loadPage(other[1]);
          if (alt.citations.get("citation_title")) {
            cites = alt.citations;
            where = ` (on the ${other[0]} page)`;
          }
        } catch (err) {
          if (err instanceof AbortRun) throw err;
        }
      }
    }
    const ct = cites.get("citation_title")?.[0] ?? "";
    const authors = cites.get("citation_author") ?? [];
    const date = cites.get("citation_publication_date")?.[0] ?? cites.get("citation_date")?.[0] ?? "";
    const validDate = /^\d{4}(?:[/-]\d{1,2}(?:[/-]\d{1,2})?)?$/.test(date);
    const detail = `title=${ct ? "yes" : "NO"} authors=${authors.length} date="${date}"${where}`;
    if (entry.template === "book" && Boolean(ct) && authors.length > 0 && !date) {
      // D11 (Phase 5.5): a book whose only date is the import placeholder
      // publishes NO date rather than a false one, so Scholar skips it until a
      // librarian records the real year (docs/seo/suspect-publication-years.csv).
      // That is the approved trade, so it is a warning, not a defect. A date
      // that is present but malformed, and any thesis or article without one,
      // still fail.
      record(label, "citation-required", "warn", `${detail} — no trusted year yet (D11)`);
    } else {
      judge(label, "citation-required", Boolean(ct) && authors.length > 0 && validDate, detail);
    }
    if (date) record(label, "citation-date-precision", /^\d{4}[/-]0?1[/-]0?1$/.test(date) ? "warn" : "ok", `date="${date}"`);
    const lang = (page.citations.get("citation_language")?.[0] ?? "").toLowerCase();
    if (lang) {
      // Khmer works on /km, every other language on the English page — the
      // one rule lib/seo/citation.ts citationLocale() applies.
      const workLocale = /^(km|khm|khmer)/.test(lang) ? "km" : "en";
      judge(label, "citation-locale", workLocale === locale, `citation_language="${lang}" on the ${locale} page`);
    }
    const pdf = page.citations.get("citation_pdf_url")?.[0];
    if (pdf) await checkPdf(label, canonical || url, pdf, entry.unverifiable?.["citation-pdf"]);
  }

  // Open Graph
  if (tpl.ogType) judge(label, "og-type", page.og.get("og:type") === tpl.ogType, `og:type=${page.og.get("og:type") ?? "(none)"} (expected ${tpl.ogType})`, tpl.ogTypePhase);
  if (!page.noindex && canonical) {
    const ogUrl = page.og.get("og:url");
    if (!ogUrl) record(label, "og-url", "warn", "no og:url");
    else judge(label, "og-url", sameUrl(ogUrl, canonical), `og:url=${ogUrl}`);
  }

  // Rendering mode. A page that silently became a per-request render still
  // answers 200 with every tag right; only its Cache-Control says so. The
  // homepage did exactly that during Phase 1 (next-intl read headers once the
  // route boundary was gone), and no other check here could see it.
  if (tpl.cacheable) {
    const cc = (res.headers.get("cache-control") ?? "").toLowerCase();
    judge(label, "cacheable", /s-maxage=\d+/.test(cc) && !/\b(private|no-store)\b/.test(cc), `cache-control: ${cc || "(none)"}`);
  }

  // Listing cards
  if (tpl.cardLinks) {
    const re = new RegExp(tpl.cardLinks);
    const hits = new Set(page.anchors.map((h) => { try { return new URL(h, url).pathname; } catch { return ""; } }).filter((p) => re.test(decodeURI(p))));
    judge(label, "card-links", hits.size > 0, `${hits.size} distinct detail link(s) matching ${tpl.cardLinks}`);
  }
  if (tpl.total) judge(label, "results-total-attr", page.resultsTotalAttr !== null, page.resultsTotalAttr ?? "no [data-results-total]");
}

async function checkPdf(label: string, pageUrl: string, pdf: string, unverifiable?: string): Promise<void> {
  const problems: string[] = [];
  const pageDir = new URL(pageUrl).pathname.replace(/[^/]*$/, "");
  const pdfUrl = new URL(pdf, pageUrl);
  if (pdfUrl.origin !== args.site) problems.push(`other origin ${pdfUrl.origin}`);
  if (!pdfUrl.pathname.startsWith(pageDir)) problems.push(`${pdfUrl.pathname} is outside ${pageDir}`);
  if (robotsTxt) {
    const verdict = robotsAllows(robotsTxt, "googlebot", pdfUrl.pathname + pdfUrl.search);
    if (!verdict.allowed) problems.push(`robots.txt: ${verdict.rule}`);
  }
  // Where the PDF is, and whether robots may fetch it, are always judged. The
  // fetch itself needs storage; where the entry says this environment has
  // none, a failed fetch is "could not be checked", not a verdict.
  if (unverifiable && problems.length === 0) {
    record(label, "citation-pdf", "unknown", `${unverifiable} (${pdfUrl.pathname})`);
    return;
  }
  try {
    const r = await request(toBase(pdfUrl.href), { headers: { range: "bytes=0-1023" }, readBody: false });
    const type = r.headers.get("content-type") ?? "";
    if (![200, 206].includes(r.status) || !type.includes("application/pdf")) {
      problems.push(`anonymous GET: ${r.status} ${type || "(no type)"}${r.headers.get("location") ? " → " + r.headers.get("location") : ""}`);
    }
  } catch (err) {
    if (err instanceof AbortRun) throw err;
    problems.push("anonymous GET: no answer");
  }
  judge(label, "citation-pdf", problems.length === 0, problems.join("; ") || pdfUrl.pathname);
}

// ── Site-level checks ────────────────────────────────────────────────────────

const PROTECTED = ["/admin", "/auth", "/api", "/dashboard", "/profile", "/lists", "/offline-books", "/offline-reader"];
const PUBLIC_SAMPLES = ["/", "/km", "/books", "/books/x", "/authors", "/authors/x", "/km/authors/x", "/subjects/x", "/theses/x", "/journals/articles/x", "/paths/x", "/llms.txt", "/search?q=x"];
const AI_AGENTS = ["gptbot", "claudebot", "perplexitybot", "google-extended", "ccbot"];

async function checkRobots(): Promise<void> {
  const label = "/robots.txt";
  const res = await request(`${args.base}/robots.txt`);
  if (res.status !== 200) {
    fail(label, "robots-txt", `status ${res.status}`);
    return;
  }
  robotsTxt = parseRobots(res.body);
  const r = robotsTxt;
  judge(label, "robots-txt", r.groups.length > 0 && r.sitemaps.length > 0 && r.unknown.length === 0,
    `${r.groups.length} groups, ${r.sitemaps.length} Sitemap line(s)${r.unknown.length ? `, unrecognised: ${r.unknown.join(" | ")}` : ""}`);
  const leaks: string[] = [];
  for (const g of r.groups) {
    for (const base of PROTECTED) {
      for (const p of [base, `${base}/x`, `/km${base}`, `/km${base}/x`]) {
        const agent = g.agents[0];
        if (robotsAllows({ ...r, groups: [g] }, agent, p).allowed) leaks.push(`${agent}: ${p}`);
      }
    }
  }
  judge(label, "robots-protected", leaks.length === 0, leaks.length ? `allowed: ${leaks.slice(0, 8).join(", ")}${leaks.length > 8 ? ` (+${leaks.length - 8})` : ""}` : `${PROTECTED.length} prefixes blocked in every group, both locales`);
  const blocked: string[] = [];
  for (const agent of ["googlebot", "bingbot", ...AI_AGENTS]) {
    for (const p of PUBLIC_SAMPLES) {
      const v = robotsAllows(r, agent, p);
      if (!v.allowed) blocked.push(`${agent} ${p} (${v.rule})`);
    }
  }
  judge(label, "robots-public", blocked.length === 0, blocked.length ? blocked.slice(0, 6).join(", ") : "public samples allowed for Googlebot, Bingbot and AI crawlers");
  const aiGroups = r.groups.filter((g) => g.agents.some((a) => AI_AGENTS.includes(a)));
  judge(label, "robots-ai-group", aiGroups.length > 0, `${aiGroups.length} group(s) naming AI crawlers`);
  const llms = await request(`${args.base}/llms.txt`);
  judge("/llms.txt", "llms-txt", llms.status === 200, `status ${llms.status}`);
}

type SitemapUrl = { loc: string; lastmod: string | null; alternates: Map<string, string> };

export function parseSitemapXml(xml: string): { kind: "urlset" | "sitemapindex" | "other"; urls: SitemapUrl[]; children: string[] } {
  const doc = new (jsdom().JSDOM)(xml, { contentType: "text/xml", virtualConsole: quietConsole() }).window.document;
  const root = doc.documentElement.localName;
  if (root === "sitemapindex") {
    const children = [...doc.getElementsByTagName("sitemap")].map((s) => textOf(s.getElementsByTagName("loc")[0] ?? null));
    return { kind: "sitemapindex", urls: [], children };
  }
  if (root !== "urlset") return { kind: "other", urls: [], children: [] };
  const urls = [...doc.getElementsByTagName("url")].map((u) => {
    const alternates = new Map<string, string>();
    for (const l of u.getElementsByTagNameNS("http://www.w3.org/1999/xhtml", "link")) {
      alternates.set((l.getAttribute("hreflang") ?? "").toLowerCase(), l.getAttribute("href") ?? "");
    }
    return {
      loc: (u.getElementsByTagName("loc")[0]?.textContent ?? "").trim(),
      lastmod: u.getElementsByTagName("lastmod")[0]?.textContent?.trim() ?? null,
      alternates,
    };
  });
  return { kind: "urlset", urls, children: [] };
}

const sectionOf = (loc: string) => {
  const p = new URL(loc).pathname.split("/").filter(Boolean);
  const first = p[0] === "km" ? p[1] : p[0];
  return first ?? "(home)";
};

async function checkSitemaps(booksTotal: number | null): Promise<void> {
  const named = robotsTxt?.sitemaps ?? [`${args.site}/sitemap.xml`];
  const files: { url: string; urls: SitemapUrl[]; bytes: number }[] = [];
  let sawIndex = false;
  const queue = [...named];
  while (queue.length) {
    const sm = queue.shift()!;
    const res = await request(toBase(sm));
    if (res.status !== 200) {
      fail(sm, "sitemap-fetch", `status ${res.status}`);
      continue;
    }
    let parsed: ReturnType<typeof parseSitemapXml>;
    try {
      parsed = parseSitemapXml(res.body);
    } catch (err) {
      fail(sm, "sitemap-fetch", `does not parse: ${(err as Error).message.slice(0, 120)}`);
      continue;
    }
    if (parsed.kind === "sitemapindex") {
      sawIndex = true;
      pass(sm, "sitemap-fetch", `sitemap index, ${parsed.children.length} children`);
      queue.push(...parsed.children);
      continue;
    }
    judge(sm, "sitemap-fetch", parsed.kind === "urlset", `${parsed.kind}, ${parsed.urls.length} URLs, ${res.body.length} bytes`);
    files.push({ url: sm, urls: parsed.urls, bytes: Buffer.byteLength(res.body) });
  }
  judge("/sitemap.xml", "sitemap-index", sawIndex && files.length > 1, sawIndex ? `index with ${files.length} children` : `one urlset of ${files[0]?.urls.length ?? 0} URLs`);

  const all = files.flatMap((f) => f.urls);
  for (const f of files) judge(f.url, "sitemap-limits", f.urls.length <= 50_000 && f.bytes <= 50 * 1024 * 1024, `${f.urls.length} URLs, ${(f.bytes / 1024 / 1024).toFixed(2)} MB`);

  // Every <loc>
  const seen = new Set<string>();
  const locProblems: string[] = [];
  let rawNonAscii = 0;
  let noXDefault = 0;
  let badLastmod = 0;
  let futureLastmod = 0;
  let noLastmod = 0;
  const placeholders: string[] = [];
  const catalogRecords: string[] = [];
  const now = Date.now() + 5 * 60_000;
  for (const u of all) {
    let parsed: URL | null = null;
    try {
      parsed = new URL(u.loc);
    } catch {
      locProblems.push(`unparseable ${u.loc}`);
    }
    if (parsed) {
      if (parsed.origin !== args.site) locProblems.push(`other origin ${u.loc}`);
      if (parsed.search) locProblems.push(`query ${u.loc}`);
      if (robotsTxt && !robotsAllows(robotsTxt, "googlebot", parsed.pathname).allowed) locProblems.push(`robots-blocked ${u.loc}`);
      if (/^\/(km\/)?catalogs\/[^/]+/.test(decodeURI(parsed.pathname))) catalogRecords.push(u.loc);
    }
    if (seen.has(u.loc)) locProblems.push(`duplicate ${u.loc}`);
    seen.add(u.loc);
    if (/[^\x20-\x7e]/.test(u.loc)) rawNonAscii++;
    if (!u.alternates.has("x-default")) noXDefault++;
    if (u.lastmod === null) noLastmod++;
    else if (!LASTMOD_RE.test(u.lastmod)) badLastmod++;
    else {
      if (Date.parse(u.lastmod) > now) futureLastmod++;
      if (isPlaceholderLastmod(u.lastmod)) placeholders.push(`${u.lastmod} ${decodeURI(u.loc).slice(0, 90)}`);
    }
  }
  judge("/sitemap.xml", "sitemap-locs", locProblems.length === 0, locProblems.length ? locProblems.slice(0, 5).join("; ") : `${all.length} locs: absolute, on-site, unique, query-free, robots-allowed`);
  judge("/sitemap.xml", "sitemap-loc-encoding", rawNonAscii === 0, `${rawNonAscii} of ${all.length} <loc> carry raw non-ASCII (canonicals are percent-encoded)`);
  judge("/sitemap.xml", "sitemap-xdefault", noXDefault === 0, `${noXDefault} of ${all.length} entries have no x-default alternate`);
  judge("/sitemap.xml", "sitemap-lastmod-format", badLastmod === 0 && futureLastmod === 0, `${badLastmod} malformed, ${futureLastmod} in the future, ${noLastmod} omitted`);
  judge("/sitemap.xml", "sitemap-lastmod-placeholder", placeholders.length === 0, placeholders.length ? placeholders.join("; ") : "none");
  judge("/sitemap.xml", "sitemap-no-catalog-records", catalogRecords.length === 0, `${catalogRecords.length} catalogue record URL(s)`);

  // Sections and the /books cross-check
  const sections = new Map<string, SitemapUrl[]>();
  for (const u of all) {
    const s = sectionOf(u.loc);
    sections.set(s, [...(sections.get(s) ?? []), u]);
  }
  const bookRecords = all.filter((u) => /^\/books\/[^/]+$/.test(new URL(u.loc).pathname)).length;
  if (booksTotal !== null) {
    // With the description gate on, the books it withholds are still listed
    // on /books (a reader can browse to them) but are not offered to crawlers.
    const ok = args.descriptionGate ? bookRecords <= booksTotal : bookRecords === booksTotal;
    const gap = args.descriptionGate ? ` (${booksTotal - bookRecords} withheld by the description gate)` : "";
    judge("/sitemap.xml", "sitemap-books-vs-listing", ok, `${bookRecords} book records in the sitemap vs ${booksTotal} on /books${gap}`);
  }
  sectionCounts = [...sections].map(([s, list]) => [s, list.length] as [string, number]).sort((a, b) => b[1] - a[1]);

  // Samples: evenly spaced, deterministic, per section
  if (args.sitemapSample > 0) {
    for (const [, list] of sections) {
      const n = Math.min(args.sitemapSample, list.length);
      for (let i = 0; i < n; i++) {
        const u = list[Math.floor(((i + 0.5) * list.length) / n)];
        await checkSample(u);
      }
    }
  }
}

let sectionCounts: [string, number][] = [];

async function checkSample(u: SitemapUrl): Promise<void> {
  const label = decodeURI(new URL(u.loc).pathname);
  const page = await loadPage(u.loc);
  if (page.res.status !== 200) {
    fail(label, "sitemap-sample", `status ${page.res.status}${page.res.headers.get("location") ? " → " + page.res.headers.get("location") : ""}`);
    return;
  }
  const canonical = page.canonicals[0] ?? "";
  judge(label, "sitemap-sample", !page.noindex && sameUrl(canonical, u.loc), `${page.noindex ? "noindex" : "index"}, canonical ${sameUrl(canonical, u.loc) ? "self" : canonical}`);
  judge(label, "sitemap-sample-loc-exact", canonical === u.loc, canonical === u.loc ? "identical" : `loc and canonical differ in bytes`);
  const diffs: string[] = [];
  for (const [lang, href] of u.alternates) {
    const onPage = page.hreflang.get(lang);
    if (!onPage || !sameUrl(onPage, href)) diffs.push(`${lang}: sitemap ${decodeURI(href)} vs page ${onPage ? decodeURI(onPage) : "(none)"}`);
  }
  judge(label, "sitemap-sample-alternates", diffs.length === 0, diffs.join("; ") || `${u.alternates.size} alternates agree`);
}

// ── Inventory: what each URL's head actually says ───────────────────────────

async function inventory(entries: UrlEntry[]): Promise<string> {
  const lines = [
    "| URL | status | lang | robots | canonical | hreflang | H1 (no-JS visible?) | title (graphemes) | description | JSON-LD @types (blocks) | og:type | citation_* | cache-control |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const e of entries) {
    const page = await loadPage(siteUrl(e.path));
    const r = page.res;
    const esc = mdCell;
    if (!page.doc) {
      lines.push(`| \`${esc(e.path)}\` | ${r.status}${r.headers.get("location") ? " → " + decodeURI(r.headers.get("location")!) : ""} | | | | | | | | | | | ${r.headers.get("cache-control") ?? ""} |`);
      continue;
    }
    const canonical = page.canonicals[0] ?? "";
    const canon = !canonical ? "none" : sameUrl(canonical, siteUrl(e.path)) ? "self" : `→ ${decodeURI(new URL(canonical).pathname + new URL(canonical).search)}`;
    const h1 = page.h1s.map((h) => `${h.text.slice(0, 40)}${h.hidden ? " (hidden)" : ""}`).join(" / ") || "NONE";
    const title = page.titles[0] ?? "";
    const desc = page.descriptions[0] ?? "";
    lines.push(
      `| \`${esc(decodeURI(e.path))}\` | ${r.status} | ${page.lang} | ${page.noindex ? "noindex" : "index"} | ${esc(canon)} | ${[...page.hreflang.keys()].join(",") || "none"} | ${esc(h1)} | ${esc(title)} (${graphemes(title)}) | ${[...desc].length} ch${ELLIPSIS.test(desc) ? ", ends …" : ""} | ${[...page.jsonldTypes].filter((t) => !["ListItem", "EntryPoint", "PostalAddress", "OpeningHoursSpecification", "ImageObject", "ReadAction", "Offer", "PropertyValue", "Place", "GeoCoordinates", "Answer", "Question", "Rating", "AggregateRating", "ContactPoint", "Language"].includes(t)).join(", ")} (${page.jsonldBlocks.length}) | ${page.og.get("og:type") ?? "-"} | ${page.citations.size ? [...page.citations.keys()].length + " tags" : "-"} | ${r.headers.get("cache-control") ?? ""} |`,
    );
  }
  return lines.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  args = parseArgs(process.argv.slice(2));
  urlFile = JSON.parse(readFileSync(args.urls, "utf8")) as UrlFile;
  const started = new Date();
  const entries = urlFile.urls.filter((e) => !args.only || e.path.includes(args.only) || e.template.includes(args.only));
  console.log(`# seo-check  base=${args.base}  site=${args.site}  phase≤${args.phase}  urls=${entries.length}  started=${started.toISOString()}`);
  let aborted: string | null = null;
  try {
    await checkRobots();
    if (args.inventory) {
      console.log(await inventory(entries));
      return;
    }
    for (const e of entries) {
      try {
        await checkUrl(e);
      } catch (err) {
        if (err instanceof AbortRun) throw err;
        record(e.path, "status", "unknown", `no answer: ${(err as Error).message}`);
      }
    }
    // Site-level: the three versions of the book list report one total.
    const totals: [string, number | null][] = [];
    for (const p of ["/books", "/books?page=1", "/km/books"]) {
      const page = await loadPage(siteUrl(p));
      totals.push([p, page.doc ? resultsTotal(page) : null]);
    }
    const values = totals.map(([, v]) => v);
    judge("/books*", "totals-parity", values.every((v) => v !== null && v === values[0]), totals.map(([p, v]) => `${p}=${v ?? "?"}`).join(", "));
    if (!args.only) await checkSitemaps(values[0] ?? null);
  } catch (err) {
    if (err instanceof AbortRun) aborted = err.message;
    else throw err;
  }

  // Report
  const shown = rows.filter((r) => args.verbose || r.level !== "ok");
  const order: Record<Level, number> = { error: 0, unknown: 1, todo: 2, warn: 3, ok: 4 };
  shown.sort((a, b) => order[a.level] - order[b.level] || a.phase - b.phase || a.check.localeCompare(b.check) || a.url.localeCompare(b.url));
  console.log("\n| level | phase | finding | check | URL | detail |\n|---|---|---|---|---|---|");
  for (const r of shown) {
    console.log(`| ${r.level.toUpperCase()} | ${r.phase} | ${r.finding} | ${r.check} | \`${mdCell(decodeURI(r.url))}\` | ${mdCell(r.detail).replace(/\n/g, " ")} |`);
  }

  console.log("\n## Summary by check\n\n| check | phase | finding | ok | error | todo | warn | unknown | rule |\n|---|---|---|---|---|---|---|---|---|");
  for (const [id, def] of Object.entries(CHECKS)) {
    const mine = rows.filter((r) => r.check === id);
    if (!mine.length) continue;
    const c = (l: Level) => mine.filter((r) => r.level === l).length;
    console.log(`| ${id} | ${def.phase} | ${def.finding ?? ""} | ${c("ok")} | ${c("error")} | ${c("todo")} | ${c("warn")} | ${c("unknown")} | ${def.about} |`);
  }
  if (sectionCounts.length) console.log(`\nSitemap sections: ${sectionCounts.map(([s, n]) => `${s} ${n}`).join(", ")}`);

  const count = (l: Level) => rows.filter((r) => r.level === l).length;
  console.log(`\n${count("ok")} ok, ${count("error")} error, ${count("todo")} todo (later phase), ${count("warn")} warn, ${count("unknown")} could not be checked — ${requestCount} requests, ${fiveXX} 5xx, ${((Date.now() - started.getTime()) / 1000).toFixed(0)} s`);
  const byPhase = [0, 1, 2, 3, 4].map((p) => `phase ${p}: ${rows.filter((r) => r.phase === p && (r.level === "error" || r.level === "todo")).length} failing`).join(" · ");
  console.log(byPhase);
  if (aborted) console.log(`\n!! RUN ABORTED: ${aborted}. Everything not listed above was NOT checked.`);
  else if (count("unknown")) console.log(`\n!! ${count("unknown")} check(s) got no answer. The run did NOT verify them.`);

  if (args.json) {
    const payload = JSON.stringify({ base: args.base, site: args.site, phase: args.phase, started: started.toISOString(), aborted, sectionCounts, rows }, null, 2);
    if (args.json === "-") process.stdout.write(payload + "\n");
    else {
      writeFileSync(args.json, payload);
      console.log(`JSON written to ${args.json}`);
    }
  }
  const failing = count("error") > 0 || aborted !== null || (args.strict && count("unknown") > 0);
  process.exitCode = failing ? 1 : 0;
}

// Run only as a script: a test imports the helpers without starting a run.
if (typeof require !== "undefined" && require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 2;
  });
}
