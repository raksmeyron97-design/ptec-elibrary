// scripts/audit-crawl-depth.ts
//
//   npx tsx scripts/audit-crawl-depth.ts
//   npx tsx scripts/audit-crawl-depth.ts --base https://library.ptec.edu.kh --concurrency 6
//   npx tsx scripts/audit-crawl-depth.ts --json reports/seo/crawl-depth.json
//   npx tsx scripts/audit-crawl-depth.ts --max 3000
//
// READ-ONLY. A breadth-first crawl from `/`, following only same-origin links,
// that answers four questions nothing else in this repository measures:
//
//   1. CLICK DEPTH — how many clicks from the homepage reach each URL the
//      sitemap advertises. Googlebot's crawl budget and the weight it gives a
//      page both fall with depth; a book nine clicks down is a book it visits
//      rarely.
//   2. ORPHANS — sitemap URLs reachable from NO page. The sitemap promises them;
//      the link graph does not deliver them.
//   3. BROKEN INTERNAL LINKS — any followed href that answers non-2xx. (The
//      weekly linkinator job in lighthouse.yml is the authority on link rot;
//      this reports what the crawl happened to hit, as a by-product.)
//   4. WHAT PHASE B BOUGHT — a counterfactual crawl over the same graph with
//      every edge LEAVING a /subjects/* or /paths/* page removed. There is no
//      pre-Phase-B site to crawl, so this is the honest substitute: the depth
//      books would have if topic hubs and learning paths linked out to nothing.
//      It is labelled as a counterfactual everywhere it is printed.
//
// ── Two edge classes, reported separately ────────────────────────────────────
//
// The language switcher is client-side (router.replace), so NO English page
// carries an <a href="/km/…">. Measured 2026-09-13: zero on / and /books. The
// two locale trees are joined only by <link rel="alternate" hreflang>. A reader
// clicking cannot cross that edge; Googlebot following hreflang can. So:
//
//   anchor     <a href>                        — what a click reaches
//   alternate  <link rel="alternate" hreflang> — what Googlebot ALSO reaches
//
// Depth is reported for anchors alone (click depth, the number that matters
// for a human and for PageRank flow) and for anchors+alternates (discovery).
//
// ── Pagination is the case this exists to measure ────────────────────────────
//
// /books lists 18 per page over 17 pages. Page 1 links to page 2 and page 17
// only, so page 9 is reached by clicking "next" eight times: a book on it is at
// depth ~10 through the listing alone. Topic hubs (≤12 items per type, one
// click from /subjects) and learning paths are the rescue; the counterfactual
// shows by how much.
//
// ── What it deliberately does not do ─────────────────────────────────────────
//
// It does not execute JavaScript, submit forms, or follow anything robots.txt
// disallows (prefix match, User-agent: *, because that is what the file means
// to a crawler — an unanchored "Disallow: /auth" once blocked all 157 /authors
// URLs here). It drops every query string except `page=N`: filtered listings
// are noindex and canonicalise to their base, so crawling them measures
// nothing. It never fetches an asset. Concurrency is capped (default 6) so a
// self-hosted container behind Cloudflare is not asked to serve a burst.

import {
  HttpStatusError,
  TransportError,
  fetchText,
  fetchWithRetry,
} from "../lib/verify/http";
import { normalizeCrawlUrl, parseRobotsDisallow, routeFamily } from "../lib/verify/crawl-policy";

const argv = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const BASE = (flag("base", "https://library.ptec.edu.kh") as string).replace(/\/$/, "");
const JSON_OUT = flag("json");
const CONCURRENCY = Math.max(1, Math.min(10, Number(flag("concurrency", "6")) || 6));
const CONCURRENCYRef = { value: CONCURRENCY };
const MAX_PAGES = Number(flag("max", "4000")) || 4000;
const ORIGIN = new URL(BASE).origin;

// ── URL policy ───────────────────────────────────────────────────────────────
// Lives in lib/verify/crawl-policy.ts (pure, unit-tested): the segment-boundary
// rule that keeps "/auth" from swallowing "/authors" was got wrong in the
// first draft of this file and dropped 158 of 508 sitemap URLs; it is pinned
// there so it cannot be got wrong again here.

const robotsDisallow: string[] = [];

const normalize = (href: string, from: string): string | null =>
  normalizeCrawlUrl(href, from, { origin: ORIGIN, robotsDisallow });

// ── HTML → edges ─────────────────────────────────────────────────────────────

type EdgeKind = "anchor" | "alternate";

function extractEdges(html: string, from: string): { to: string; kind: EdgeKind }[] {
  const out: { to: string; kind: EdgeKind }[] = [];
  // Scoped to <a …> so <link rel="apple-touch-startup-image" href="…png">
  // and friends are never mistaken for navigation.
  for (const m of html.matchAll(/<a\b[^>]*?\bhref="([^"]*)"[^>]*>/gi)) {
    const to = normalize(m[1], from);
    if (to) out.push({ to, kind: "anchor" });
  }
  // Next serialises the attribute camel-cased as hrefLang — match either.
  for (const m of html.matchAll(/<link\b[^>]*?\brel="alternate"[^>]*?\bhref="([^"]*)"[^>]*>/gi)) {
    if (!/hreflang=/i.test(m[0])) continue;
    const to = normalize(m[1], from);
    if (to) out.push({ to, kind: "alternate" });
  }
  return out;
}

// ── Crawl ────────────────────────────────────────────────────────────────────

type Node = {
  url: string;
  /** Fewest anchor clicks from /, or null if only reachable via an alternate. */
  clickDepth: number | null;
  /** Fewest edges of any kind from /. */
  depth: number;
  parent: string | null;
  status: number | null;
  /** Transport failure — the page was NOT checked. */
  unknown: boolean;
  outAnchors: number;
};

const nodes = new Map<string, Node>();
/** Every followed edge, for the counterfactual re-walk. */
const edges: { from: string; to: string; kind: EdgeKind }[] = [];
/** Non-2xx answers, with the page that linked them. */
const broken: { url: string; status: number; from: string }[] = [];

async function fetchPage(url: string): Promise<{ status: number; html: string | null } | null> {
  const abs = `${BASE}${encodeURI(url)}`;
  try {
    const res = await fetchWithRetry(abs, { allowStatuses: [301, 302, 307, 308, 404, 410] });
    if (!res.ok) return { status: res.status, html: null };
    return { status: res.status, html: await res.text() };
  } catch (err) {
    if (err instanceof HttpStatusError) return { status: err.status, html: null };
    if (err instanceof TransportError) return null;
    throw err;
  }
}

// Crawl state is module-level so a retry round can resume the same queue.
const queue: string[] = ["/"];
let cursor = 0;
let inFlight = 0;
let fetched = 0;
/** Pages that needed a second round before they answered — the load the box shed. */
let recoveredOnRetry = 0;

/** Run the pump until the queue is empty and nothing is in flight. */
function drain(): Promise<void> {
  return new Promise<void>((resolve) => {
    const pump = () => {
      while (inFlight < CONCURRENCYRef.value && cursor < queue.length && fetched < MAX_PAGES) {
        const url = queue[cursor++];
        const node = nodes.get(url)!;
        inFlight++;
        fetched++;
        void fetchPage(url).then((res) => {
          inFlight--;
          if (res === null) {
            node.unknown = true;
          } else {
            node.unknown = false;
            node.status = res.status;
            if (res.html) {
              const found = extractEdges(res.html, `${BASE}${url}`);
              node.outAnchors = found.filter((e) => e.kind === "anchor").length;
              for (const { to, kind } of found) {
                edges.push({ from: url, to, kind });
                if (!nodes.has(to)) {
                  // Discovery only. Click depth is NOT tracked here: a node first
                  // reached through an hreflang edge would carry null, and its
                  // children would inherit it and never be revisited when an
                  // anchor path turned up later. It is computed once, after the
                  // crawl, as a BFS over anchor edges (clickDepthsWithout).
                  nodes.set(to, { url: to, clickDepth: null, depth: node.depth + 1, parent: url, status: null, unknown: false, outAnchors: 0 });
                  queue.push(to);
                }
              }
            } else if (res.status >= 400) {
              broken.push({ url, status: res.status, from: node.parent ?? "/" });
            }
          }
          if (fetched % 100 === 0) process.stdout.write(`\r  crawled ${fetched} pages, ${queue.length - cursor} queued…`);
          if (inFlight === 0 && (cursor >= queue.length || fetched >= MAX_PAGES)) resolve();
          else pump();
        });
      }
      if (inFlight === 0 && (cursor >= queue.length || fetched >= MAX_PAGES)) resolve();
    };
    pump();
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function crawl(): Promise<void> {
  nodes.set("/", { url: "/", clickDepth: null, depth: 0, parent: null, status: null, unknown: false, outAnchors: 0 });
  await drain();

  // A self-hosted box behind a tunnel sheds ~1% of connections at this
  // concurrency (measured: 17 of 1,651 on 2026-09-13 — five of them depth-1
  // hubs, which silently emptied whole families from the graph). A page that
  // got no answer is re-queued after a pause, up to two rounds, serially, so
  // the audit heals under load instead of reporting the weather as orphans.
  for (let round = 1; round <= 2; round++) {
    const retry = [...nodes.values()].filter((n) => n.unknown);
    if (retry.length === 0) break;
    process.stdout.write(`\r  ${retry.length} page(s) got no answer — retry round ${round} after a pause…${" ".repeat(10)}\n`);
    await sleep(3000 * round);
    const before = retry.length;
    for (const n of retry) queue.push(n.url);
    const saved = CONCURRENCYRef.value;
    CONCURRENCYRef.value = 2; // gentler on the second attempt
    await drain();
    CONCURRENCYRef.value = saved;
    const after = [...nodes.values()].filter((n) => n.unknown).length;
    recoveredOnRetry += before - after;
  }
  process.stdout.write(`\r  crawled ${fetched} fetches over ${nodes.size} URLs.${" ".repeat(30)}\n`);

  // Click depth, once, over the anchor edges only.
  const click = clickDepthsWithout(() => true);
  for (const n of nodes.values()) n.clickDepth = click.get(n.url) ?? null;
}

/** Click depth over a subgraph: BFS on anchor edges whose SOURCE passes `keep`. */
function clickDepthsWithout(keep: (fromUrl: string) => boolean): Map<string, number> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (e.kind !== "anchor" || !keep(e.from)) continue;
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
  }
  const depth = new Map<string, number>([["/", 0]]);
  const q = ["/"];
  for (let i = 0; i < q.length; i++) {
    const u = q[i];
    for (const v of adj.get(u) ?? []) {
      if (!depth.has(v)) {
        depth.set(v, depth.get(u)! + 1);
        q.push(v);
      }
    }
  }
  return depth;
}

// ── Report ───────────────────────────────────────────────────────────────────


const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "—");
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

async function main() {
  console.log(`\nCrawl-depth audit — ${BASE} (concurrency ${CONCURRENCY}, max ${MAX_PAGES} pages)\n`);

  // robots.txt first, so the crawl never follows what Googlebot would not.
  try {
    robotsDisallow.push(...parseRobotsDisallow(await fetchText(`${BASE}/robots.txt`)));
    console.log(`  robots.txt: ${robotsDisallow.length} Disallow rule(s) for * honoured`);
  } catch {
    console.log("  robots.txt: could not be read — crawling without it (reported, not assumed)");
  }

  // The sitemap is the set of promises to check the graph against.
  const sitemapXml = await fetchText(`${BASE}/sitemap.xml`);
  const sitemap = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => normalize(m[1].trim(), BASE))
    .filter((u): u is string => Boolean(u));
  const sitemapSet = new Set(sitemap);
  console.log(`  sitemap.xml: ${sitemap.length} URLs advertised\n`);

  await crawl();

  const checked = [...nodes.values()].filter((n) => !n.unknown && n.status !== null);
  const unknown = [...nodes.values()].filter((n) => n.unknown);

  // ── 1. Reachability of what the sitemap promises ───────────────────────
  const reachableByClick = sitemap.filter((u) => (nodes.get(u)?.clickDepth ?? null) !== null);
  const reachableAtAll = sitemap.filter((u) => nodes.has(u));
  const orphansByClick = sitemap.filter((u) => (nodes.get(u)?.clickDepth ?? null) === null);
  const orphansAtAll = sitemap.filter((u) => !nodes.has(u));

  console.log("═══ 1. Sitemap URLs vs the link graph ═══");
  console.log(`  reachable by CLICKING from /        ${reachableByClick.length} / ${sitemap.length}  (${pct(reachableByClick.length, sitemap.length)})`);
  console.log(`  reachable incl. hreflang alternates ${reachableAtAll.length} / ${sitemap.length}  (${pct(reachableAtAll.length, sitemap.length)})`);
  console.log(`  ORPHANS — no click path             ${orphansByClick.length}`);
  console.log(`  ORPHANS — no path of any kind       ${orphansAtAll.length}`);

  const orphanFamilies = new Map<string, number>();
  for (const u of orphansByClick) orphanFamilies.set(routeFamily(u), (orphanFamilies.get(routeFamily(u)) ?? 0) + 1);
  for (const [f, n] of [...orphanFamilies].sort((a, b) => b[1] - a[1])) {
    const km = orphansByClick.filter((u) => u.startsWith("/km") && routeFamily(u) === f).length;
    console.log(`      ${f.padEnd(12)} ${String(n).padStart(4)}   (${km} under /km)`);
  }
  for (const u of orphansAtAll.slice(0, 10)) console.log(`      unreachable by any edge: ${u}`);
  if (orphansAtAll.length > 10) console.log(`      … and ${orphansAtAll.length - 10} more`);

  // ── 2. Click depth by family, English tree (the one a reader lands in) ──
  console.log("\n═══ 2. Click depth from /, English tree, by family ═══");
  console.log("  family        n   min  median  max   ≥4 clicks");
  const byFam = new Map<string, number[]>();
  for (const u of sitemap) {
    if (u.startsWith("/km")) continue;
    const cd = nodes.get(u)?.clickDepth ?? null;
    if (cd === null) continue;
    (byFam.get(routeFamily(u)) ?? byFam.set(routeFamily(u), []).get(routeFamily(u))!).push(cd);
  }
  for (const [f, ds] of [...byFam].sort((a, b) => b[1].length - a[1].length)) {
    const deep = ds.filter((d) => d >= 4).length;
    console.log(
      `  ${f.padEnd(11)} ${String(ds.length).padStart(4)}   ${String(Math.min(...ds)).padStart(3)}  ${String(median(ds)).padStart(6)}  ${String(Math.max(...ds)).padStart(3)}   ${String(deep).padStart(4)} (${pct(deep, ds.length)})`,
    );
  }

  // ── 3. The counterfactual: books with no hub/path edges ────────────────
  const isHubOrPath = (u: string) => /^(\/km)?\/(subjects|paths)(\/|$)/.test(u);
  const without = clickDepthsWithout((from) => !isHubOrPath(from));
  const books = sitemap.filter((u) => !u.startsWith("/km") && /^\/books\/[^?]/.test(u));
  const actual = books.map((u) => nodes.get(u)?.clickDepth ?? null);
  const cf = books.map((u) => without.get(u) ?? null);
  const paired = books.map((u, i) => ({ u, actual: actual[i], cf: cf[i] }));
  const rescued = paired.filter((p) => p.actual !== null && (p.cf === null || p.cf > p.actual));
  const cfReachable = paired.filter((p) => p.cf !== null);

  console.log("\n═══ 3. COUNTERFACTUAL — books if /subjects/* and /paths/* linked out to nothing ═══");
  console.log("  (no pre-Phase-B site exists to crawl; this removes their outbound edges from the measured graph)");
  console.log(`  books in sitemap                      ${books.length}`);
  console.log(`  click-reachable, actual               ${paired.filter((p) => p.actual !== null).length}   median depth ${median(actual.filter((d): d is number => d !== null))}`);
  console.log(`  click-reachable, counterfactual       ${cfReachable.length}   median depth ${median(cf.filter((d): d is number => d !== null))}`);
  console.log(`  books whose shortest path RUNS THROUGH a hub or path  ${rescued.length} (${pct(rescued.length, books.length)})`);
  const gains = rescued.filter((p) => p.cf !== null).map((p) => (p.cf as number) - (p.actual as number));
  if (gains.length) console.log(`  clicks saved for those, median / max  ${median(gains)} / ${Math.max(...gains)}`);
  const onlyViaHub = rescued.filter((p) => p.cf === null).length;
  if (onlyViaHub) console.log(`  books with NO click path at all without hubs/paths  ${onlyViaHub}`);

  // Pagination reach specifically: how deep is the deepest listing page?
  const pages = [...nodes.keys()].filter((u) => /^\/books\?page=\d+$/.test(u));
  const deepestPage = pages.reduce((m, u) => Math.max(m, nodes.get(u)?.clickDepth ?? 0), 0);
  console.log(`  /books pagination: ${pages.length} pages crawled, deepest at click ${deepestPage}`);

  // ── 4. Broken links and dead ends ──────────────────────────────────────
  const deadEnds = checked.filter((n) => n.status === 200 && n.outAnchors === 0 && sitemapSet.has(n.url));
  console.log("\n═══ 4. Link health (by-product; linkinator is the weekly authority) ═══");
  console.log(`  pages checked                ${checked.length}`);
  console.log(`  answered only on retry       ${recoveredOnRetry}  (connections the origin shed under load)`);
  console.log(`  broken internal links        ${broken.length}`);
  for (const b of broken.slice(0, 15)) console.log(`      ${b.status}  ${b.url}   ← linked from ${b.from}`);
  if (broken.length > 15) console.log(`      … and ${broken.length - 15} more`);
  console.log(`  indexable dead ends (no outbound anchor)  ${deadEnds.length}`);
  for (const d of deadEnds.slice(0, 5)) console.log(`      ${d.url}`);
  if (unknown.length) {
    console.log(`\n  INCOMPLETE: ${unknown.length} page(s) got no answer (transport) and were NOT checked:`);
    for (const u of unknown.slice(0, 8)) console.log(`      ${u.url}`);
  }

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
          sitemap: sitemap.length,
          crawled: nodes.size,
          checked: checked.length,
          unknown: unknown.length,
          incomplete: unknown.length > 0,
          reachableByClick: reachableByClick.length,
          reachableAtAll: reachableAtAll.length,
          orphansByClick,
          orphansAtAll,
          broken,
          deadEnds: deadEnds.map((d) => d.url),
          books: paired,
          nodes: [...nodes.values()],
        },
        null,
        2,
      )}\n`,
    );
    console.log(`\nWrote ${JSON_OUT}`);
  }
  console.log();
  process.exit(broken.length > 0 || orphansAtAll.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\naudit could not run: ${(err as Error).message}\n`);
  process.exit(err instanceof TransportError ? 0 : 1);
});

export {};
