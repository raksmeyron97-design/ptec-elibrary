// The KPI engine for the monthly Search Console report (SEO audit 2026-10,
// WI-9). Pure.
//
// The KPIs (K-S*, K-C*, K-P*) and the noise / brand / cluster rules are
// DEFINED in scripts/seo/gsc-rules.json, from the audit's Gate 4 §5.1–5.2 and
// Gate 2 §4 — data, not code, so the definitions can be copied in and
// reviewed without touching this file. A KPI whose definition is missing,
// or whose input the export lacks, is `null` and prints [UNKNOWN] — never 0.

import type { GscExport, Row } from "./export";

export type RuleSet = {
  /** Queries that carry no intent (regex sources, case-insensitive). */
  noise: string[];
  /** Queries that name the library or the college. */
  brand: string[];
  /** Named query clusters → their patterns. */
  clusters: Record<string, string[]>;
};

export type KpiDefinition = {
  table: "queries" | "pages" | "dates";
  metric: "clicks" | "impressions" | "ctr" | "position" | "rows";
  /** Which query rows count. Pages/dates ignore it. */
  segment?: "all" | "brand" | "nonbrand" | `cluster:${string}`;
  /** Page rows whose URL path starts with this. */
  pathPrefix?: string;
  excludeNoise?: boolean;
  /** Pages only: count rows with at least this many impressions. */
  minImpressions?: number;
};

export type KpiConfig = { id: string; label: string; definition: KpiDefinition | null };

const compile = (patterns: readonly string[]) => patterns.map((p) => new RegExp(p, "i"));

export function querySegment(query: string, rules: RuleSet): { noise: boolean; brand: boolean; clusters: string[] } {
  const noise = compile(rules.noise).some((re) => re.test(query));
  const brand = compile(rules.brand).some((re) => re.test(query));
  const clusters = Object.entries(rules.clusters)
    .filter(([, ps]) => compile(ps).some((re) => re.test(query)))
    .map(([name]) => name);
  return { noise, brand, clusters };
}

function pathOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return url;
  }
}

/** A KPI's value, or null when it cannot be computed honestly. */
export function computeKpi(def: KpiDefinition | null, data: GscExport, rules: RuleSet): number | null {
  if (!def) return null;
  const table = data[def.table];
  if (!table) return null;
  let rows: Row[] = table;
  if (def.table === "queries") {
    // Asked to drop noise or split on brand, with no rule defined to do it.
    if (def.excludeNoise && rules.noise.length === 0) return null;
    if ((def.segment === "brand" || def.segment === "nonbrand") && rules.brand.length === 0) return null;
    rows = rows.filter((r) => {
      const seg = querySegment(r.key, rules);
      if (def.excludeNoise && seg.noise) return false;
      if (def.segment === "brand") return seg.brand;
      if (def.segment === "nonbrand") return !seg.brand;
      if (def.segment?.startsWith("cluster:")) return seg.clusters.includes(def.segment.slice(8));
      return true;
    });
    if (def.segment?.startsWith("cluster:") && !(def.segment.slice(8) in rules.clusters)) return null;
  }
  if (def.table === "pages" && def.pathPrefix) rows = rows.filter((r) => pathOf(r.key).startsWith(def.pathPrefix as string));
  if (def.minImpressions !== undefined) rows = rows.filter((r) => (r.impressions ?? 0) >= (def.minImpressions as number));

  if (def.metric === "rows") return rows.length;
  if (def.metric === "clicks" || def.metric === "impressions") {
    if (rows.some((r) => r[def.metric as "clicks"] === null)) return null;
    return rows.reduce((n, r) => n + (r[def.metric as "clicks"] as number), 0);
  }
  const imp = rows.reduce((n, r) => n + (r.impressions ?? 0), 0);
  if (imp === 0 || rows.some((r) => r.impressions === null)) return null;
  if (def.metric === "ctr") {
    if (rows.some((r) => r.clicks === null)) return null;
    return rows.reduce((n, r) => n + (r.clicks as number), 0) / imp;
  }
  // Impression-weighted mean position.
  if (rows.some((r) => r.position === null)) return null;
  return rows.reduce((n, r) => n + (r.position as number) * (r.impressions as number), 0) / imp;
}

export function formatKpi(value: number | null, metric: KpiDefinition["metric"] | undefined): string {
  if (value === null) return "[UNKNOWN]";
  if (metric === "ctr") return `${(value * 100).toFixed(2)}%`;
  if (metric === "position") return value.toFixed(1);
  return String(Math.round(value));
}
