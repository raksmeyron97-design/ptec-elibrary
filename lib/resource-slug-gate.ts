// Edge-safe published-slug existence gate for middleware — generalises the
// books gate (lib/book-slug-gate.ts) to resource types that have a `slug` and
// a boolean "is public" column but NO retired-slug redirect map (theses,
// publications, physical catalog items).
//
// Why this exists: every route under app/[locale]/(public) streams its
// `loading` boundary first, so an unknown /theses/<slug>, /publications/<slug>
// or /catalogs/<slug> returned HTTP 200 with not-found content (a soft 404) —
// search engines then index the "not found" page as a live 200. Books avoided
// this via their gate; these three did not, so unknown slugs soft-404ed.
// (Legacy /theses/<uuid> URLs are handled separately in middleware and are NOT
// routed through here — this gate only ever sees non-UUID slugs.)
//
// Design mirrors book-slug-gate exactly for safety:
//   * per-(table) in-memory published-slug snapshot per edge isolate;
//   * snapshot hit  → zero added latency (Set lookup);
//   * snapshot miss → ONE confirming PostgREST round-trip (catches rows newer
//     than the snapshot or beyond the row cap) before deciding not-found;
//   * stale snapshot → served now, refreshed in the background;
//   * any fetch failure → FAIL OPEN (null verdict → the request falls through
//     to the page exactly as before this gate existed).

export type SlugGateResult = { kind: "ok" } | { kind: "not-found" };

export type SlugGateEnv = { supabaseUrl: string; anonKey: string };

/** A gated resource: its table and the boolean column that marks it public. */
export type ResourceGateConfig = {
  /** PostgREST table name, e.g. "research_reports". */
  table: string;
  /** Boolean column that must be true for a public row, e.g. "is_published". */
  publishedColumn: string;
  /**
   * Path segments under this resource that are REAL STATIC ROUTES, not slugs.
   *
   * The gate matches `/<segment>/<anything>`, so a sibling page like
   * app/[locale]/(public)/theses/summary/page.tsx looks exactly like a thesis
   * slug to it — it was looked up against published slugs, found nothing, and
   * 404'd a page that exists. The sitemap advertises /theses/summary, so search
   * engines were being pointed at a 404.
   *
   * Anything added as a static child of a gated segment MUST be listed here.
   * lib/resource-slug-gate.test.ts reads the route directory and fails if one
   * is missing, so this cannot drift.
   */
  reserved?: readonly string[];
};

export const RESOURCE_GATES = {
  theses: {
    table: "research_reports",
    publishedColumn: "is_published",
    reserved: ["summary"],
  },
  publications: { table: "publications", publishedColumn: "is_published" },
  catalogs: { table: "catalog_books", publishedColumn: "is_active" },
} as const satisfies Record<string, ResourceGateConfig>;

/** Pure resolution against a snapshot — unit-tested. */
export function resolveSlugGate(
  slug: string,
  liveSlugs: Set<string>,
  reserved: readonly string[] = [],
): SlugGateResult {
  if (reserved.includes(slug)) return { kind: "ok" };
  return liveSlugs.has(slug) ? { kind: "ok" } : { kind: "not-found" };
}

type Snapshot = { slugs: Set<string>; fetchedAt: number };

const SNAPSHOT_TTL_MS = 120_000;
// PostgREST caps responses at the project max_rows (1000). Misses fall back to
// a confirming lookup, so a >1000-row future degrades gracefully.
const ROW_CAP = 1000;

// One snapshot + in-flight refresh promise per table, isolated per edge worker.
const snapshots = new Map<string, Snapshot>();
const refreshing = new Map<string, Promise<void>>();

function restHeaders(env: SlugGateEnv) {
  return { apikey: env.anonKey, Authorization: `Bearer ${env.anonKey}` };
}

async function fetchSnapshot(
  cfg: ResourceGateConfig,
  env: SlugGateEnv,
): Promise<Snapshot | null> {
  try {
    const res = await fetch(
      `${env.supabaseUrl}/rest/v1/${cfg.table}?select=slug&${cfg.publishedColumn}=eq.true&slug=not.is.null&limit=${ROW_CAP}`,
      { headers: restHeaders(env) },
    );
    if (!res.ok) return null;
    const rows: { slug: string | null }[] = await res.json();
    const slugs = new Set(rows.map((r) => r.slug).filter((s): s is string => !!s));
    return { slugs, fetchedAt: Date.now() };
  } catch {
    return null;
  }
}

async function getSnapshot(
  cfg: ResourceGateConfig,
  env: SlugGateEnv,
): Promise<Snapshot | null> {
  const current = snapshots.get(cfg.table);
  if (current && Date.now() - current.fetchedAt < SNAPSHOT_TTL_MS) return current;
  if (current) {
    // Stale: serve now, refresh in the background (at most one in flight).
    if (!refreshing.has(cfg.table)) {
      refreshing.set(
        cfg.table,
        fetchSnapshot(cfg, env)
          .then((next) => {
            if (next) snapshots.set(cfg.table, next);
          })
          .catch(() => {})
          .finally(() => refreshing.delete(cfg.table)),
      );
    }
    return current;
  }
  const fresh = await fetchSnapshot(cfg, env);
  if (fresh) snapshots.set(cfg.table, fresh);
  return snapshots.get(cfg.table) ?? null;
}

/** One confirming round-trip for a slug the snapshot doesn't know: a row
 *  published more recently than the snapshot, or beyond the row cap. */
async function confirmSlug(
  cfg: ResourceGateConfig,
  slug: string,
  env: SlugGateEnv,
): Promise<SlugGateResult | null> {
  try {
    const enc = encodeURIComponent(slug);
    const res = await fetch(
      `${env.supabaseUrl}/rest/v1/${cfg.table}?select=slug&slug=eq.${enc}&${cfg.publishedColumn}=eq.true&limit=1`,
      { headers: restHeaders(env) },
    );
    if (!res.ok) return null; // gate unavailable — fail open
    const rows: { slug: string }[] = await res.json();
    if (rows.length > 0) {
      snapshots.get(cfg.table)?.slugs.add(slug);
      return { kind: "ok" };
    }
    return { kind: "not-found" };
  } catch {
    return null;
  }
}

/** Gate verdict for a published-slug resource request. `null` means the gate
 *  could not answer (DB unreachable) — callers MUST fall through unchanged. */
export async function gateResourceSlug(
  cfg: ResourceGateConfig,
  slug: string,
  env: SlugGateEnv,
): Promise<SlugGateResult | null> {
  // Reserved segments are real routes, not slugs — answer before spending a
  // network call on a lookup that can only ever miss.
  if (cfg.reserved?.includes(slug)) return { kind: "ok" };
  if (!env.supabaseUrl || !env.anonKey) return null;
  const snap = await getSnapshot(cfg, env);
  if (!snap) return null;
  const verdict = resolveSlugGate(slug, snap.slugs, cfg.reserved);
  if (verdict.kind !== "not-found") return verdict;
  return confirmSlug(cfg, slug, env);
}

/** Test hook — resets the per-isolate caches. */
export function __resetResourceSlugGate() {
  snapshots.clear();
  refreshing.clear();
}
