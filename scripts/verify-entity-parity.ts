// scripts/verify-entity-parity.ts
//
//   npx tsx scripts/verify-entity-parity.ts
//   npx tsx scripts/verify-entity-parity.ts --base https://library.ptec.edu.kh
//   npx tsx scripts/verify-entity-parity.ts --authors 40     # sample size
//   npx tsx scripts/verify-entity-parity.ts --all            # every listed author
//   npx tsx scripts/verify-entity-parity.ts --json reports/seo/entity-parity.json
//
// READ-ONLY. Every request is a GET against the public site; it writes nothing
// anywhere but the optional --json path and never touches a database.
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// PostgREST clips every response at db-max-rows — 1000 — silently, on top of
// whatever `.limit()` the request carried. A loader that reads a whole table in
// one request therefore answers from the first 1,000 rows of it and reports
// that as a fact. Nothing errors, no log line appears, and the number renders.
//
// Measured against production on 2026-09-23, over 1,956 published books
// (SEO corpus audit, 2026-09-23, F-S1, F-A1): the 34 subject pages' e-book
// counts summed to exactly 1,000 against 1,955 subject assignments; the author
// hub credited the Ministry of Education with 652 works where its own page said
// 1,000 and the books say 1,037; and the homepage's subject tiles read "Science
// 256 items" against 749 books. lib/db/paged-scan.ts fixes the code, and
// lib/db/paginated-sweep.test.ts stops the shape coming back. This is the check
// that it did not come back in PRODUCTION, where a stale ISR entry or a
// half-finished deploy can serve the previous build's numbers.
//
// ── What it asserts ─────────────────────────────────────────────────────────
//
// Relations between two things the site says about ITSELF, computed by
// DIFFERENT loaders — so there is no fixture, nothing goes stale as the
// collection grows, and the check still fails the moment one loader is reading
// a fraction of a table:
//
//   1. a homepage subject tile's item count  ==  /books?dept=<name>'s own total
//      The tile counts rows in memory; the listing asks Postgres for an exact
//      count, which is never clipped. They describe the same books.
//   2. an author's work count on /authors  ==  "N works shown" on their page
//      Two loaders (lib/authors/directory.ts, lib/authors/profile.ts) reading
//      the same relations by different routes.
//   3. no count anywhere is exactly 1000, and no set of them sums to exactly
//      1000 — the FINGERPRINT of a clipped read rather than a claim about the
//      collection. A real library summing to precisely the server's page size
//      is a coincidence worth one failed check.
//
// Deliberately NOT asserted: that the subject counts sum to the book total.
// A book with no subject is legitimate, so the difference is real data rather
// than a defect, and a check that has to be explained away is one nobody reads.

import {
  errorOutcome,
  exitCodeFor,
  fetchText,
  incompleteBanner,
  summaryLine,
  tally,
  type Outcome,
} from "../lib/verify/http";

// `export {}` at the foot of this file is load-bearing: without it TypeScript
// treats a script with no top-level import as a GLOBAL script, and its consts
// collide with the identically-named ones in the sibling verifiers.

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const BASE = (flag("base", "https://library.ptec.edu.kh") as string).replace(/\/$/, "");
const JSON_OUT = flag("json");
const STRICT = argv.includes("--strict");
/** How many author pages to open. The hub lists hundreds; the defect this
 *  watches shows up first on the authors with the most works, so the sample is
 *  taken from the top of the roster unless --all is passed. */
const AUTHOR_SAMPLE = argv.includes("--all") ? Infinity : Number(flag("authors", "25"));

/** PostgREST's row cap. The number a clipped read stops at. */
const ROW_CAP = 1000;

type Result = { check: string; outcome: Outcome; detail: string | null };

const results: Result[] = [];
const record = (check: string, outcome: Outcome, detail: string | null = null) => {
  results.push({ check, outcome, detail });
  const label = outcome === "ok" ? "ok  " : outcome === "warn" ? "WARN" : outcome === "unknown" ? "????" : "FAIL";
  console.log(`  ${label}  ${check}`);
  if (detail) console.log(`        ${detail}`);
};

async function text(path: string): Promise<string> {
  return fetchText(`${BASE}${encodeURI(path)}`);
}

// ── Reading what the site says ───────────────────────────────────────────────

/** Homepage subject tiles: the department each links to, and the count it prints. */
function homeSubjectTiles(html: string): { dept: string; count: number }[] {
  const out: { dept: string; count: number }[] = [];
  for (const m of html.matchAll(/href="\/(?:km\/)?books\?dept=([^"&]+)"([\s\S]{0,1200}?)<\/a>/g)) {
    const count = m[2].match(/(\d[\d,]*)\s+items?\b/);
    if (!count) continue;
    out.push({ dept: decodeURIComponent(m[1]), count: Number(count[1].replace(/,/g, "")) });
  }
  return out;
}

/** `/books?dept=…`'s own count: "24 of 116 e-books", or an unfiltered total. */
function listingTotal(html: string): number | null {
  const filtered = html.match(/(\d[\d,]*)\s+of\s+(\d[\d,]*)\s+e-books/);
  if (filtered) return Number(filtered[1].replace(/,/g, ""));
  const plain = html.match(/(\d[\d,]*)\s+resources?\b/);
  return plain ? Number(plain[1].replace(/,/g, "")) : null;
}

/** Author hub cards: the slug each links to, and the work count it prints. */
function hubAuthors(html: string): { slug: string; works: number }[] {
  const out = new Map<string, number>();
  for (const m of html.matchAll(/href="\/(?:km\/)?authors\/([^"#?]+)"([\s\S]*?)<\/a>/g)) {
    const count = m[2].match(/(\d[\d,]*)\s+works?\b/);
    if (!count) continue;
    const slug = decodeURIComponent(m[1]);
    if (!out.has(slug)) out.set(slug, Number(count[1].replace(/,/g, "")));
  }
  return [...out].map(([slug, works]) => ({ slug, works }));
}

/** "N works shown" on an author page. */
function worksShown(html: string): number | null {
  const m = html.match(/(\d[\d,]*)\s+works?\s+shown/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/** Subject hub cards: the slug each links to, and the e-book count it prints. */
function hubSubjectCounts(html: string): { slug: string; books: number }[] {
  const out = new Map<string, number>();
  for (const m of html.matchAll(/href="\/(?:km\/)?subjects\/([^"#?]+)"([\s\S]*?)<\/a>/g)) {
    const count = m[2].match(/(\d[\d,]*)\s+e-?books?\b/i);
    if (!count) continue;
    const slug = decodeURIComponent(m[1]);
    if (!out.has(slug)) out.set(slug, Number(count[1].replace(/,/g, "")));
  }
  return [...out].map(([slug, books]) => ({ slug, books }));
}

// ── Runner ───────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\nEntity parity — ${BASE}\n`);

  // ── 1. Homepage subject tiles vs the listing's exact count ────────────────
  let tiles: { dept: string; count: number }[] = [];
  try {
    tiles = homeSubjectTiles(await text("/"));
  } catch (err) {
    record("GET /", ...errorOutcome(err));
  }

  if (tiles.length === 0) {
    // Never a pass by default: an unparsed page is "we could not look", and
    // the arithmetic that turns that into "everything passed" is the defect
    // this whole family of scripts exists to avoid.
    record("the homepage renders subject tiles with counts", "unknown", "no tile matched the parser");
  } else {
    record(`the homepage renders ${tiles.length} subject tiles with counts`, "ok");
    for (const tile of tiles) {
      try {
        const total = listingTotal(await text(`/books?dept=${encodeURIComponent(tile.dept)}`));
        if (total === null) {
          record(`tile "${tile.dept}" vs /books?dept=`, "unknown", "the listing printed no count");
          continue;
        }
        record(
          `tile "${tile.dept}" (${tile.count}) matches its listing (${total})`,
          tile.count === total ? "ok" : "fail",
          tile.count === total
            ? null
            : `the tile counts rows it fetched, the listing asks Postgres — a gap this way means the fetch was clipped`,
        );
      } catch (err) {
        record(`GET /books?dept=${tile.dept}`, ...errorOutcome(err));
      }
    }
  }

  // ── 2. Author hub count vs the author's own page ──────────────────────────
  let listed: { slug: string; works: number }[] = [];
  try {
    listed = hubAuthors(await text("/authors"));
  } catch (err) {
    record("GET /authors", ...errorOutcome(err));
  }

  if (listed.length === 0) {
    record("/authors lists authors with work counts", "unknown", "no card matched the parser");
  } else {
    record(`/authors lists ${listed.length} authors with work counts`, "ok");
    const sample = [...listed].sort((a, b) => b.works - a.works).slice(0, AUTHOR_SAMPLE);
    for (const author of sample) {
      try {
        const shown = worksShown(await text(`/authors/${author.slug}`));
        if (shown === null) {
          record(`/authors/${author.slug} reports its works`, "unknown", "the page printed no count");
          continue;
        }
        record(
          `/authors/${author.slug}: hub says ${author.works}, page shows ${shown}`,
          author.works === shown ? "ok" : "fail",
          author.works === shown
            ? null
            : "two loaders reading the same relations disagree — one of them is reading part of a table",
        );
      } catch (err) {
        record(`GET /authors/${author.slug}`, ...errorOutcome(err));
      }
    }
  }

  // ── 3. The clipped-read fingerprint ───────────────────────────────────────
  let subjects: { slug: string; books: number }[] = [];
  try {
    subjects = hubSubjectCounts(await text("/subjects"));
  } catch (err) {
    record("GET /subjects", ...errorOutcome(err));
  }

  const sets: { name: string; values: number[] }[] = [
    { name: "subject e-book counts", values: subjects.map((s) => s.books) },
    { name: "homepage tile counts", values: tiles.map((t) => t.count) },
    { name: "author hub work counts", values: listed.map((a) => a.works) },
  ];

  for (const set of sets) {
    if (set.values.length === 0) {
      record(`${set.name} carry no clipped-read fingerprint`, "unknown", "nothing parsed");
      continue;
    }
    const sum = set.values.reduce((a, b) => a + b, 0);
    const atCap = set.values.filter((v) => v === ROW_CAP).length;
    const sumAtCap = sum === ROW_CAP;
    record(
      `${set.name} carry no clipped-read fingerprint (${set.values.length} values, sum ${sum})`,
      atCap === 0 && !sumAtCap ? "ok" : "fail",
      atCap === 0 && !sumAtCap
        ? null
        : sumAtCap
          ? `they sum to exactly ${ROW_CAP}, which is the server's page size, not a property of the collection`
          : `${atCap} value(s) sit at exactly ${ROW_CAP}`,
    );
  }

  const t = tally(results.map((r) => r.outcome));
  // NOT `length - failed - warned`: that arithmetic counts an unanswered check
  // as a pass, which is the precise defect lib/verify/http.ts was written to
  // remove.
  console.log(`\n${summaryLine(t)} (${results.length} checks)`);

  const banner = incompleteBanner(t);
  if (banner) console.log(`\n${banner}`);

  if (JSON_OUT) {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(JSON_OUT), { recursive: true });
    writeFileSync(
      JSON_OUT,
      `${JSON.stringify(
        {
          base: BASE,
          generatedAt: new Date().toISOString(),
          tiles: tiles.length,
          authorsListed: listed.length,
          authorsChecked: Math.min(listed.length, AUTHOR_SAMPLE),
          subjects: subjects.length,
          ...t,
          incomplete: t.unknown > 0,
          results,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`Wrote ${JSON_OUT}`);
  }
  console.log();

  process.exit(exitCodeFor(t, STRICT));
}

run().catch((err) => {
  // Reaching here means nothing was checked. A transport failure exits 0 with
  // a loud banner rather than 1: a red that means weather is how a red that
  // means a regression stops being read. `--strict` (a manual audit) still
  // treats it as a failure.
  const [outcome, detail] = errorOutcome(err);
  console.error(`\nverification could not run — ${detail}\n`);
  process.exit(outcome === "unknown" && !STRICT ? 0 : 1);
});

export {};
