// scripts/audit-rights-exposure.ts
//
//   npx tsx scripts/audit-rights-exposure.ts
//   npx tsx scripts/audit-rights-exposure.ts --limit 50          # a smoke run
//   npx tsx scripts/audit-rights-exposure.ts --base https://library.ptec.edu.kh
//   npx tsx scripts/audit-rights-exposure.ts --out reports/seo/rights-review.csv
//
// READ-ONLY, and the PUBLIC SITE is the only source. No database, no service
// key, no storage call. Everything it reports is something an anonymous
// visitor — or a rights holder — can already see, which is the point: the
// question is what PTEC is publishing about these books, not what it stores.
//
// ── Why this exists ──────────────────────────────────────────────────────────
//
// Every downloadable book advertises its PDF to Google Scholar through
// `citation_pdf_url`. A teaching collection grown by donation and bulk import
// can accumulate third-party material whose redistribution rights the library
// does not hold, and nothing in the app has ever been able to say which rows
// those might be.
//
// The stake is not only legal. Google's ranking-systems documentation states
// that valid copyright removal requests let it "demote other content from the
// site in our results" — so an unactioned takedown is a ranking risk to the
// ENTIRE domain, including the theses and ministry material the library
// unambiguously may publish.
//
// ── What it does NOT do ──────────────────────────────────────────────────────
//
// It changes nothing. It does not write to the database, does not alter any
// book's access, and does not decide anything. It produces a ranked review
// queue; a librarian decides, using the control built in SEO5-02. The
// classifier (lib/rights/publisher-signals.ts) is deliberately hedged: read
// its header before trusting a class.
//
// ── Fault vocabulary ─────────────────────────────────────────────────────────
//
// lib/verify/http.ts, unchanged. A page that could not be fetched is `unknown`
// and is NEVER silently treated as "no signal found" — a run that missed 200
// pages must not read as a clean bill of health, so an incomplete run prints
// a banner and stamps the CSV header.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  errorOutcome,
  fetchText,
  incompleteBanner,
  summaryLine,
  tally,
  type Outcome,
} from "../lib/verify/http";
import {
  classifyRights,
  isbnPrefix8,
  reviewPriority,
  type ReviewPriority,
  type RightsClass,
} from "../lib/rights/publisher-signals";

// `export {}` at the foot of this file is load-bearing: without it TypeScript
// treats a script with no top-level import as a GLOBAL script, and its consts
// collide with the identically-named ones in the sibling audits.

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const BASE = (flag("base", "https://library.ptec.edu.kh") as string).replace(/\/$/, "");
const LIMIT = Number(flag("limit", "0"));
// Capped, not merely defaulted: this origin resets connections under parallel
// load (SEO 4.0 F-4 was that failure mode), and a rights audit that aborts
// two thirds of the way through is worse than a slow one.
const CONCURRENCY = Math.min(2, Math.max(1, Number(flag("concurrency", "2"))));
const TODAY = new Date().toISOString().slice(0, 10);
const OUT = flag("out", `reports/seo/rights-review-${TODAY}.csv`) as string;

type Row = {
  slug: string;
  url: string;
  title: string;
  authors: string;
  publisher: string;
  isbn: string;
  language: string;
  downloadable: boolean;
  rightsClass: RightsClass;
  priority: ReviewPriority;
  isbnPrefix: string;
  reason: string;
};

const rows: Row[] = [];
const outcomes: Outcome[] = [];
const failures: string[] = [];

// ── Parsing ──────────────────────────────────────────────────────────────────

const unescapeHtml = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

type BookNode = {
  name?: string;
  isbn?: string;
  publisher?: unknown;
  author?: unknown;
  inLanguage?: string;
};

/** The Book node from the page's JSON-LD, or null if the page carries none. */
function bookNode(html: string): BookNode | null {
  const blocks = html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
  for (const m of blocks) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(unescapeHtml(m[1]));
    } catch {
      continue; // A malformed block is not evidence about the book.
    }
    const graph = Array.isArray((parsed as { "@graph"?: unknown[] })?.["@graph"])
      ? ((parsed as { "@graph": unknown[] })["@graph"])
      : [parsed];
    for (const node of graph) {
      const t = (node as { "@type"?: unknown })?.["@type"];
      const isBook = t === "Book" || (Array.isArray(t) && t.includes("Book"));
      if (isBook) return node as BookNode;
    }
  }
  return null;
}

/** schema.org allows a bare string, an object with a name, or a list of either. */
function names(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(names);
  if (value && typeof value === "object") {
    const n = (value as { name?: unknown }).name;
    if (typeof n === "string") return [n];
  }
  return [];
}

const metaContent = (html: string, name: string): string | null => {
  const m = html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`));
  return m ? unescapeHtml(m[1]) : null;
};

// ── Fetch ────────────────────────────────────────────────────────────────────

async function auditBook(slug: string): Promise<void> {
  const url = `${BASE}/books/${slug}`;
  let html: string;
  try {
    html = await fetchText(url);
  } catch (err) {
    const [outcome, detail] = errorOutcome(err);
    outcomes.push(outcome);
    failures.push(`${slug} — ${detail}`);
    return;
  }
  outcomes.push("ok");

  const node = bookNode(html);
  // `citation_pdf_url` is emitted only when the file may be handed over
  // (lib/seo/citation.ts), so its presence IS the downloadable verdict as the
  // public page states it — not an inference about the database.
  const downloadable = /<meta name="citation_pdf_url"/.test(html);

  const title = node?.name ?? metaContent(html, "citation_title") ?? "";
  const authors = node ? names(node.author) : [];
  const publisher =
    names(node?.publisher)[0] ?? metaContent(html, "citation_publisher") ?? "";
  const isbn = node?.isbn ?? metaContent(html, "citation_isbn") ?? "";
  const language = node?.inLanguage ?? metaContent(html, "citation_language") ?? "";

  const verdict = classifyRights({ title, authors, publisher, isbn });

  rows.push({
    slug,
    url,
    title,
    authors: authors.join("; "),
    publisher,
    isbn,
    language,
    downloadable,
    rightsClass: verdict.rightsClass,
    priority: reviewPriority({ rightsClass: verdict.rightsClass, title, isbn }),
    isbnPrefix: isbnPrefix8(isbn),
    reason: verdict.reason,
  });
}

/** A fixed-size worker pool — never more than CONCURRENCY sockets open. */
async function pool<T>(items: readonly T[], worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let done = 0;
  const runners = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i]);
      done++;
      if (done % 50 === 0) process.stdout.write(`  …${done}/${items.length}\n`);
    }
  });
  await Promise.all(runners);
}

// ── CSV ──────────────────────────────────────────────────────────────────────

const cell = (v: string | boolean) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function toCsv(sorted: readonly Row[], incomplete: string | null): string {
  const lines: string[] = [];
  if (incomplete) {
    // Stamped INTO the artifact, not only printed: a CSV outlives the terminal
    // it was produced in, and a partial queue read as a complete one is how a
    // book nobody looked at becomes a book somebody believes was cleared.
    lines.push(`# INCOMPLETE RUN — ${incomplete.replace(/\n/g, " ")}`);
  }
  lines.push(
    [
      "slug",
      "url",
      "title",
      "authors",
      "publisher",
      "isbn",
      // First 8 digits of the canonical ISBN-13 — a block to look up in the
      // ISBN Agency range table. Not the registrant element: its length is
      // 2-7 digits and is only knowable from the published ranges.
      "isbn_prefix8",
      "language",
      "downloadable",
      "review_priority",
      "class",
      "reason",
    ].join(","),
  );
  for (const r of sorted) {
    lines.push(
      [
        r.slug,
        r.url,
        r.title,
        r.authors,
        r.publisher,
        r.isbn,
        r.isbnPrefix,
        r.language,
        r.downloadable,
        r.priority,
        r.rightsClass,
        r.reason,
      ]
        .map(cell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

// ── Run ──────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log(`\nRights-exposure audit — ${BASE}`);
  console.log(`READ-ONLY. Public pages only. Nothing is changed.\n`);

  const sitemap = await fetchText(`${BASE}/sitemap.xml`);
  const all = [...sitemap.matchAll(/<loc>([^<]*\/books\/[^<]+)<\/loc>/g)]
    .map((m) => m[1].split("/books/")[1])
    .filter((s) => s && !s.includes("/"));
  const slugs = LIMIT > 0 ? all.slice(0, LIMIT) : all;

  console.log(`${all.length} book URLs in the sitemap; auditing ${slugs.length} at concurrency ${CONCURRENCY}.`);
  console.log(`(about ${Math.ceil((slugs.length * 1.5) / CONCURRENCY / 60)} min)\n`);

  await pool(slugs, auditBook);

  const t = tally(outcomes);
  const incomplete = incompleteBanner(t);

  // Priority is the review order the librarian asked for; it already encodes
  // the class, so sorting on both would only let them disagree.
  const sorted = [...rows].sort(
    (a, b) =>
      a.priority.localeCompare(b.priority) ||
      Number(b.downloadable) - Number(a.downloadable) ||
      a.slug.localeCompare(b.slug),
  );

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, toCsv(sorted, incomplete));

  const count = (c: RightsClass) => rows.filter((r) => r.rightsClass === c).length;
  const dl = (c: RightsClass) => rows.filter((r) => r.rightsClass === c && r.downloadable).length;

  console.log(`\n── Counts ──────────────────────────────────────────────`);
  for (const c of ["commercial-likely", "unknown", "open-likely"] as const) {
    console.log(`  ${c.padEnd(18)} ${String(count(c)).padStart(5)}   of which downloadable: ${dl(c)}`);
  }
  console.log(`  ${"pages read".padEnd(18)} ${String(rows.length).padStart(5)}`);

  console.log(`\n── Review priority ─────────────────────────────────────`);
  const PRIORITY_LABEL: Record<ReviewPriority, string> = {
    P1: "commercial-likely",
    P2: "Latin, unmeasured, checkable",
    P3: "Latin, unmeasured",
    P4: "Khmer script",
    P5: "Latin, openly published",
  };
  for (const p of ["P1", "P2", "P3", "P4", "P5"] as const) {
    const n = rows.filter((r) => r.priority === p).length;
    console.log(`  ${p}  ${PRIORITY_LABEL[p].padEnd(30)} ${String(n).padStart(5)}`);
  }
  console.log(`\n${summaryLine(t)}`);
  if (failures.length > 0) {
    console.log(`\nPages that could not be read (${failures.length}):`);
    for (const f of failures.slice(0, 20)) console.log(`  ${f}`);
    if (failures.length > 20) console.log(`  …and ${failures.length - 20} more`);
  }
  if (incomplete) console.log(`\n${incomplete}`);
  console.log(`\nWrote ${OUT}`);
  console.log(`This is a REVIEW QUEUE, not a rights determination. Nothing was changed.\n`);

  // Always 0: this is an audit, not a gate. A defect here is a librarian's
  // decision to make, and a non-zero exit would put it in a build's hands.
  process.exit(0);
}

run().catch((err) => {
  const [, detail] = errorOutcome(err);
  console.error(`\naudit could not run — ${detail}\n`);
  process.exit(1);
});

export {};
