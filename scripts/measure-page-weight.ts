// scripts/measure-page-weight.ts
//
//   npm run build && npm start &          # a PRODUCTION build; dev is 3-5x bigger
//   npx tsx scripts/measure-page-weight.ts
//   npx tsx scripts/measure-page-weight.ts --out reports/seo/weight-before.json
//   npx tsx scripts/measure-page-weight.ts --compare reports/seo/weight-before.json
//   npx tsx scripts/measure-page-weight.ts --budget            # exit 1 past the budget
//
// READ-ONLY. Fetches each page and counts bytes. No database, no writes.
//
// ── What it counts, and why that split ───────────────────────────────────────
//
// `self.__next_f.push(...)` is the RSC flight payload: the serialised props
// of every server component, inlined into the document so the client can
// hydrate without a second request. It is invisible in devtools' "HTML"
// figure, it is not code-split, and it grows with what you PASS rather than
// with what you RENDER — hand a client component a whole row object and every
// field it never reads is serialised anyway, once per instance.
//
// Measured on production 2026-09-20: the homepage was 883,802 bytes, of which
// 447,965 (50.7%) was flight payload, with `isbn` appearing 64 times,
// `publisher` 65 and `availability` 72 — once per book card.
//
// ── Why a committed budget and not just a one-off measurement ────────────────
//
// The homepage grew ~60 KB between the SEO 5.0 audit (821 KB) and Phase 0
// (883 KB) and nobody noticed, because nothing was watching. A number in a
// report ages; a threshold that fails a run does not.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

// `export {}` at the foot: without it TypeScript treats a script with no
// top-level import as a global script and its consts collide with siblings.

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const BASE = (flag("base", "http://localhost:3000") as string).replace(/\/$/, "");
const OUT = flag("out");
const COMPARE = flag("compare");
const ENFORCE = argv.includes("--budget");

/**
 * The pages measured, and why each one.
 *
 * `--book` overrides the book page, because its slug differs per database.
 */
const PAGES: readonly { path: string; label: string }[] = [
  { path: "/", label: "home (en)" },
  { path: "/km", label: "home (km)" },
  { path: "/books", label: "books listing" },
  { path: flag("book", "/books") as string, label: "book detail" },
];

/**
 * Per-page ceilings, in bytes, for `--budget`. TWO OF THEM, and the second
 * one is the one that works.
 *
 * `totalBytes`/`flightBytes` carry ~10% headroom, so they catch GROSS drift
 * and nothing finer. That limit is measured, not assumed: the whole SEO5-09
 * saving is 1.6% of the homepage, and the ~60 KB of unnoticed growth that
 * motivated this file (821 KB → 883 KB) was 7.5% — **neither would trip a
 * 10% ceiling.** A page-size budget answers "has this page ballooned", which
 * is worth knowing and is not the same question.
 *
 * `unusedCardFieldBytes` is the tight one. It is near zero when every card
 * goes through `toBookCardData()` and jumps ~100x the moment one does not
 * (measured: 0.1 KB → 12.3 KB on the homepage), so it fails on the first
 * regression rather than the hundredth. It does not scale with the size of
 * the catalogue, so it needs no headroom at all beyond rounding.
 *
 * Raise any of them deliberately, in a commit that says why.
 */
type BudgetFile = {
  note: string[];
  pages: Record<
    string,
    {
      totalBytes: number;
      flightBytes: number;
      /** Ceiling on bytes of fields no card renders. See §"two ceilings". */
      unusedCardFieldBytes: number;
      why?: string;
    }
  >;
};

const BUDGET: BudgetFile["pages"] = (
  JSON.parse(
    readFileSync(new URL("./page-weight-budget.json", import.meta.url), "utf8"),
  ) as BudgetFile
).pages;

type Measurement = {
  label: string;
  path: string;
  status: number;
  totalBytes: number;
  flightBytes: number;
  flightShare: number;
  inlineSvgBytes: number;
  /**
   * The same document, Brotli-compressed HERE at quality 5.
   *
   * This is what a student on a phone actually downloads, and it is the
   * number that justifies the work — but it is COMPUTED, not observed: this
   * process compresses the identity bytes itself. It is not a measurement of
   * Cloudflare, which picks its own algorithm and level per request and may
   * answer zstd. Quality 5 is Cloudflare's documented default for dynamic
   * responses, so it is the closest honest proxy.
   *
   * The BUDGET is deliberately not set on this number. A compressor that
   * gets better at repetitive JSON shrinks it while the document grows, so a
   * compressed ceiling can stay green through exactly the regression this
   * check exists to catch.
   */
  brotliBytes: number;
  /** Same document, gzip -6. Reported for the old-browser floor. */
  gzipBytes: number;
  /** Bytes of `Book` fields a card never renders (see UNUSED_CARD_FIELDS). */
  unusedCardFieldBytes: number;
  /** How many such key/value pairs the document carries. */
  unusedCardFieldHits: number;
  unusedCardFieldsByName: Record<string, { hits: number; bytes: number }>;
};

type Report = { generatedAt: string; base: string; pages: Measurement[] };

/** Bytes inside `<script>self.__next_f.push(…)</script>` blocks. */
function flightBytes(html: string): number {
  let total = 0;
  for (const m of html.matchAll(/<script[^>]*>(self\.__next_f\.push\([\s\S]*?)<\/script>/g)) {
    total += Buffer.byteLength(m[1], "utf8");
  }
  return total;
}

/**
 * The `Book` fields a card never renders, and what they cost in the payload.
 *
 * This is the metric that survives a small local database. Absolute page
 * weight against `supabase/seed.sql` (6 published books) says nothing about
 * production (1,916); "how many bytes per page are fields nobody renders"
 * says the same thing in both places, and goes to zero when the fix lands.
 *
 * `cover` is deliberately absent: the card DOES render it as the generated
 * cover's tint. Counting it would flatter the result.
 */
const UNUSED_CARD_FIELDS = [
  "isbn",
  "publisher",
  "availability",
  "pages",
  "summary",
  "tags",
  "year",
  "format",
  "pdfUrl",
  "language",
  "verifiedAt",
  "allowDownload",
  "license",
  "publicationDate",
] as const;

/**
 * Inside the flight payload a JSON key is escaped twice — it lives in a JSON
 * string inside a JS string literal — so `isbn` appears as `\"isbn\"`.
 */
/**
 * TWO CLASSES OF FALSE POSITIVE, and only one of them can be filtered.
 *
 * FILTERED: an i18n LABEL. `messages/*.json` contains `"isbn": "ISBN"`,
 * `"pages": "Pages"`, `"language": "Language"` — field names used as message
 * keys — and those strings are in the payload because the page is
 * translated, not because a card is fat. Their value IS the key, humanised,
 * so they are excluded by folding both to letters and comparing. Without
 * this the metric has a floor it can never reach and a finished fix reads as
 * unfinished.
 *
 * NOT FILTERED: a page that legitimately RENDERS a book record. `/books/x`
 * prints the ISBN, the publisher, the page count and the year; that is the
 * page's content. One full record is the honest floor for a detail page, so
 * judge a detail page by its DELTA and a listing page by how near zero it
 * gets.
 */
function isI18nLabel(key: string, rawValue: string): boolean {
  const fold = (x: string) => x.toLowerCase().replace(/[^a-z]/g, "");
  return fold(rawValue.replace(/\\+"/g, "")) === fold(key);
}

function unusedFieldCost(flight: string): {
  totalBytes: number;
  totalHits: number;
  byField: Record<string, { hits: number; bytes: number }>;
} {
  const q = '\\\\"';
  const byField: Record<string, { hits: number; bytes: number }> = {};
  let totalBytes = 0;
  let totalHits = 0;
  for (const key of UNUSED_CARD_FIELDS) {
    const re = new RegExp(
      `${q}${key}${q}:(${q}(?:(?!${q}).)*${q}|\\[[^\\]]*\\]|null|true|false|-?[0-9.]+)`,
      "g",
    );
    let hits = 0;
    let bytes = 0;
    for (const m of flight.matchAll(re)) {
      if (isI18nLabel(key, m[1])) continue;
      hits++;
      bytes += Buffer.byteLength(m[0], "utf8");
    }
    byField[key] = { hits, bytes };
    totalBytes += bytes;
    totalHits += hits;
  }
  return { totalBytes, totalHits, byField };
}

/** The flight payload as one string, for the field scan above. */
function flightText(html: string): string {
  let out = "";
  for (const m of html.matchAll(/<script[^>]*>(self\.__next_f\.push\([\s\S]*?)<\/script>/g)) {
    out += m[1];
  }
  return out;
}

function inlineSvgBytes(html: string): number {
  let total = 0;
  for (const m of html.matchAll(/<svg[\s\S]*?<\/svg>/g)) total += Buffer.byteLength(m[0], "utf8");
  return total;
}

async function measure(path: string, label: string): Promise<Measurement> {
  // WARM THE PAGE FIRST, and discard the answer.
  //
  // A cold first hit is not the page: it fills `unstable_cache`, and the
  // render that had to fill it streamed ~4.8 KB more on this app's book
  // detail page than every request after it \u2014 measured, and enough on its
  // own to turn a 0.5 KB saving into a 4.3 KB "regression". A budget that
  // fails depending on which page was hit first is a flaky gate, and a flaky
  // gate is one people re-run instead of reading.
  await fetch(`${BASE}${path}`, {
    headers: { "accept-encoding": "identity" },
    signal: AbortSignal.timeout(60_000),
  })
    .then((r) => r.text())
    .catch(() => "");

  const res = await fetch(`${BASE}${path}`, {
    // Identity encoding: the point is the DOCUMENT's size, not the transfer
    // size, which varies with the CDN's compressor and hides a regression
    // behind a better zstd ratio.
    headers: { "accept-encoding": "identity" },
    signal: AbortSignal.timeout(60_000),
  });
  const html = await res.text();
  const bytes = Buffer.from(html, "utf8");
  const total = bytes.byteLength;
  const flight = flightBytes(html);
  const unused = unusedFieldCost(flightText(html));
  return {
    label,
    path,
    status: res.status,
    totalBytes: total,
    flightBytes: flight,
    flightShare: total === 0 ? 0 : flight / total,
    inlineSvgBytes: inlineSvgBytes(html),
    brotliBytes: brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
    }).byteLength,
    gzipBytes: gzipSync(bytes, { level: 6 }).byteLength,
    unusedCardFieldBytes: unused.totalBytes,
    unusedCardFieldHits: unused.totalHits,
    unusedCardFieldsByName: unused.byField,
  };
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
const delta = (now: number, before: number) => {
  const d = now - before;
  const pct = before === 0 ? 0 : (d / before) * 100;
  const sign = d > 0 ? "+" : "";
  return `${sign}${(d / 1024).toFixed(1)} KB (${sign}${pct.toFixed(1)}%)`;
};

async function run(): Promise<void> {
  console.log(`\nPage weight — ${BASE}`);
  console.log(`Counting the DOCUMENT, uncompressed. Run against a PRODUCTION build.\n`);

  const pages: Measurement[] = [];
  for (const p of PAGES) {
    pages.push(await measure(p.path, p.label));
  }

  const baseline: Report | null = COMPARE
    ? (JSON.parse(readFileSync(COMPARE, "utf8")) as Report)
    : null;

  console.log(
    `${"page".padEnd(16)}${"total".padStart(11)}${"flight".padStart(11)}${"share".padStart(8)}` +
      `${"svg".padStart(10)}${"br(q5)".padStart(11)}${"gzip".padStart(10)}`,
  );
  for (const m of pages) {
    console.log(
      `${m.label.padEnd(16)}${kb(m.totalBytes).padStart(11)}${kb(m.flightBytes).padStart(11)}` +
        `${`${(m.flightShare * 100).toFixed(1)}%`.padStart(8)}${kb(m.inlineSvgBytes).padStart(10)}` +
        `${kb(m.brotliBytes).padStart(11)}${kb(m.gzipBytes).padStart(10)}`,
    );
    if (m.status !== 200) console.log(`    ⚠ HTTP ${m.status}`);
  }

  console.log(`\n\u2500\u2500 fields a card never renders \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
  console.log(
    `  Absolute page weight depends on how many books the database holds, so it\n` +
      `  cannot be compared between a seeded local stack and production. This can:\n` +
      `  it is zero when every card goes through toBookCardData().`,
  );
  for (const m of pages) {
    const worst = Object.entries(m.unusedCardFieldsByName)
      .filter(([, v]) => v.bytes > 0)
      .sort((a, b) => b[1].bytes - a[1].bytes)
      .slice(0, 3)
      .map(([k, v]) => `${k} ${kb(v.bytes)}`)
      .join(", ");
    console.log(
      `${m.label.padEnd(16)}${kb(m.unusedCardFieldBytes).padStart(10)} in ${String(m.unusedCardFieldHits).padStart(4)} pairs` +
        `${worst ? `   worst: ${worst}` : ""}`,
    );
  }
  console.log(
    `\n  br/gzip are compressed HERE, not observed from the CDN \u2014 the number a\n` +
      `  reader downloads, as closely as this can be computed offline. The budget\n` +
      `  below is on the IDENTITY bytes on purpose: a better compressor can hide a\n` +
      `  bigger document.`,
  );

  if (baseline) {
    console.log(`\n── vs ${COMPARE} ───────────────────────────────`);
    for (const m of pages) {
      const b = baseline.pages.find((x) => x.path === m.path);
      if (!b) {
        console.log(`${m.label.padEnd(16)} (no baseline)`);
        continue;
      }
      console.log(
        `${m.label.padEnd(16)} total ${delta(m.totalBytes, b.totalBytes).padEnd(22)}` +
          `flight ${delta(m.flightBytes, b.flightBytes).padEnd(22)}` +
          `br ${b.brotliBytes === undefined ? "(no baseline)" : delta(m.brotliBytes, b.brotliBytes)}`,
      );
    }
  }

  let over = 0;
  if (ENFORCE) {
    console.log(`\n── budget ──────────────────────────────────────`);
    for (const m of pages) {
      const b = BUDGET[m.path] ?? BUDGET[m.label];
      if (!b) {
        console.log(`${m.label.padEnd(16)} no budget entry — add one to page-weight-budget.json`);
        continue;
      }
      const totalOver = m.totalBytes > b.totalBytes;
      const flightOver = m.flightBytes > b.flightBytes;
      const unusedOver = m.unusedCardFieldBytes > b.unusedCardFieldBytes;
      if (totalOver || flightOver || unusedOver) over++;
      console.log(
        `${m.label.padEnd(16)} ${totalOver ? "OVER " : "ok   "} total ${kb(m.totalBytes)} / ${kb(b.totalBytes)}   ` +
          `${flightOver ? "OVER " : "ok   "} flight ${kb(m.flightBytes)} / ${kb(b.flightBytes)}   ` +
          `${unusedOver ? "OVER " : "ok   "} unused ${kb(m.unusedCardFieldBytes)} / ${kb(b.unusedCardFieldBytes)}`,
      );
    }
  }

  if (OUT) {
    const report: Report = { generatedAt: new Date().toISOString(), base: BASE, pages };
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nWrote ${OUT}`);
  }

  if (ENFORCE && over > 0) {
    console.error(
      `\n${over} page(s) over budget. Either the change is worth it — raise the number in ` +
        `scripts/page-weight-budget.json in the same commit, and say why — or it is the drift ` +
        `this check exists to catch.\n`,
    );
    process.exit(1);
  }
  console.log();
}

run().catch((err) => {
  console.error(`\nmeasurement failed: ${(err as Error).message}`);
  console.error(`Is a server running at ${BASE}? This needs \`npm run build && npm start\`.\n`);
  process.exit(1);
});

export {};
