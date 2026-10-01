// scripts/seo-lighthouse-summary.ts
//
//   npx tsx scripts/seo-lighthouse-summary.ts reports/lh [reports/lh-after]
//
// READ-ONLY. Summarises the reports scripts/seo-lighthouse.sh wrote: per
// template, the MEDIAN of each metric across rounds (taken metric by metric,
// so one slow run cannot drag every column), the LCP element and its time
// split, and the bytes by type. Given a second directory, it prints the change
// next to each value. SEO Phase 6, docs/seo/perf-baseline.md.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Lhr = {
  finalDisplayedUrl: string;
  lighthouseVersion: string;
  fetchTime: string;
  categories: { performance: { score: number | null } };
  audits: Record<string, { numericValue?: number; details?: { items?: unknown[] } }>;
};

type Row = {
  perf: number;
  fcp: number;
  lcp: number;
  tbt: number;
  cls: number;
  js: number;
  image: number;
  font: number;
  total: number;
  lcpElement: string;
  split: string;
};

const TEMPLATES = ["home", "books", "book", "subject", "path", "thesis"];

function median(values: number[]): number {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function bytes(lhr: Lhr, type: string): number {
  const items = (lhr.audits["resource-summary"]?.details?.items ?? []) as { resourceType: string; transferSize: number }[];
  return items.find((i) => i.resourceType === type)?.transferSize ?? NaN;
}

function lcpParts(lhr: Lhr): { element: string; split: Record<string, number> } {
  const items = (lhr.audits["lcp-breakdown-insight"]?.details?.items ?? []) as {
    type: string;
    snippet?: string;
    boundingRect?: { width: number; height: number };
    items?: { subpart: string; duration: number }[];
  }[];
  const node = items.find((i) => i.type === "node");
  const table = items.find((i) => i.type === "table")?.items ?? [];
  const tag = node?.snippet?.match(/^<(\w+)/)?.[1] ?? "?";
  return {
    element: node ? `${tag} ${node.boundingRect?.width}×${node.boundingRect?.height}` : "—",
    split: Object.fromEntries(table.map((p) => [p.subpart, p.duration])),
  };
}

function summarise(dir: string): Map<string, Row> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const out = new Map<string, Row>();
  for (const name of TEMPLATES) {
    const runs = files.filter((f) => f.startsWith(`${name}-`)).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Lhr);
    if (runs.length === 0) continue;
    const m = (f: (l: Lhr) => number) => median(runs.map(f));
    const parts = runs.map(lcpParts);
    const sub = (k: string) => {
      const v = median(parts.map((p) => p.split[k] ?? NaN));
      return Number.isFinite(v) ? String(Math.round(v)) : "—";
    };
    out.set(name, {
      perf: m((l) => (l.categories.performance.score ?? 0) * 100),
      fcp: m((l) => l.audits["first-contentful-paint"].numericValue ?? NaN),
      lcp: m((l) => l.audits["largest-contentful-paint"].numericValue ?? NaN),
      tbt: m((l) => l.audits["total-blocking-time"].numericValue ?? NaN),
      cls: m((l) => l.audits["cumulative-layout-shift"].numericValue ?? NaN),
      js: m((l) => bytes(l, "script")),
      image: m((l) => bytes(l, "image")),
      font: m((l) => bytes(l, "font")),
      total: m((l) => bytes(l, "total")),
      lcpElement: [...new Set(parts.map((p) => p.element))].join(" / "),
      split: `${sub("timeToFirstByte")} · ${sub("resourceLoadDelay")} · ${sub("resourceLoadDuration")} · ${sub("elementRenderDelay")}`,
    });
  }
  return out;
}

const [beforeDir, afterDir] = process.argv.slice(2);
if (!beforeDir) {
  console.error("usage: npx tsx scripts/seo-lighthouse-summary.ts <dir> [<after-dir>]");
  process.exit(2);
}
const before = summarise(beforeDir);
const after = afterDir ? summarise(afterDir) : null;

const kb = (b: number) => Math.round(b / 1024);
const s = (ms: number) => (ms / 1000).toFixed(1);
const delta = (a: number, b: number | undefined, fmt: (n: number) => string | number) =>
  b === undefined || !Number.isFinite(b) ? String(fmt(a)) : `${fmt(a)} → ${fmt(b)}`;

console.log("| Template | Perf | FCP s | LCP s | TBT ms | CLS | JS KB | Image KB | Font KB | Total KB | LCP element | LCP: TTFB · load delay · load · render delay (ms) |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|");
for (const [name, r] of before) {
  const a = after?.get(name);
  console.log(
    `| ${name} | ${delta(r.perf, a?.perf, Math.round)} | ${delta(r.fcp, a?.fcp, s)} | ${delta(r.lcp, a?.lcp, s)} | ${delta(r.tbt, a?.tbt, Math.round)} | ` +
      `${delta(r.cls, a?.cls, (n) => n.toFixed(2))} | ${delta(r.js, a?.js, kb)} | ${delta(r.image, a?.image, kb)} | ${delta(r.font, a?.font, kb)} | ` +
      `${delta(r.total, a?.total, kb)} | ${a ? `${r.lcpElement} → ${a.lcpElement}` : r.lcpElement} | ${a ? `${r.split} → ${a.split}` : r.split} |`,
  );
}

export {};
