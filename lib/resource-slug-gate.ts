// Edge-safe published-slug existence gate for middleware — generalises the
// books gate (lib/book-slug-gate.ts) to resource types that have a `slug` and
// a boolean "is public" column (theses, publications, physical catalog items).
//
// Catalogs additionally declare a `redirectTable`, because the catalog edit
// wizard can change a record's slug: a retired slug resolves to a real 301
// instead of a 404. Resources without one behave exactly as before and cost no
// extra network call.
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

export type SlugGateResult =
  | { kind: "ok" }
  | { kind: "redirect"; slug: string }
  | { kind: "not-found" };

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
  /**
   * Table mapping a retired slug to a live row, for resources whose slug can
   * change. Shape must be `(old_slug text, <fk> uuid references table)`,
   * exactly like book_slug_redirects (0091) and catalog_slug_redirects (0120);
   * the FK column name does not matter, PostgREST resolves the embed from the
   * relationship.
   *
   * Omit it and nothing about this gate changes — no extra fetch, and a miss
   * is a plain not-found.
   */
  redirectTable?: string;
};

export const RESOURCE_GATES = {
  theses: {
    table: "research_reports",
    publishedColumn: "is_published",
    reserved: ["summary"],
  },
  publications: { table: "publications", publishedColumn: "is_published" },
  // Posts gate on is_published, which is the trigger-maintained mirror of
  // `status` (0073). Two visibility cases make this safe to gate:
  //   * `unlisted` posts are is_published = true — they are excluded from the
  //     public index at the query level, not by RLS, so they stay in this
  //     snapshot and direct links keep working, which is their whole point.
  //   * `admin_only` posts are hidden by the anon RLS policy, so they are
  //     absent from the snapshot and would be gated as not-found.
  // That last case, and admin preview of drafts, is why middleware skips this
  // gate entirely for requests carrying a session cookie — see the note there.
  posts: { table: "posts", publishedColumn: "is_published" },
  // The only gated resource whose slug is editable after creation (the edit
  // wizard), so it is the only one that needs a retired-slug map. See
  // migration 0120.
  catalogs: {
    table: "catalog_books",
    publishedColumn: "is_active",
    redirectTable: "catalog_slug_redirects",
  },
  // Team member profiles live one level deeper than the other resources —
  // the key is the full path prefix under (public), and middleware builds its
  // matcher from it the same way. The lookup target is the SECURITY DEFINER
  // view, not the base table: anon reads of team_members were closed in 0071,
  // so a base-table query from the edge would 401 and permanently fail open.
  // The view's is_published column is constant-true (its WHERE bakes the
  // filter in); it exists so this gate's `=eq.true` filter has something to
  // bind to. Before migration 0114 the view lacks slug/is_published — the
  // fetch 400s and the gate fails open, exactly the intended deploy-window
  // behaviour.
  "about/team": { table: "team_members_public", publishedColumn: "is_published" },
  // Author profiles resolve across TWO tables — publication_authors (academic
  // profiles) and authors (e-book authors) — which this gate's one-table shape
  // cannot express. Migration 0126 collapses them into a slug-existence view,
  // the same move `about/team` makes above, and `is_published` is likewise a
  // constant-true column that exists for the filter to bind to.
  //
  // The view deliberately includes profiles whose publication_authors.is_published
  // is false: that flag withholds the biography and links, it does not remove
  // the page, so those URLs are live and must not be gated away.
  //
  // Before 0126 the view does not exist, the fetch 400s and the gate fails open
  // — i.e. the previous soft-404 behaviour, which is the correct deploy-window
  // outcome.
  authors: { table: "author_profiles_public", publishedColumn: "is_published" },
} as const satisfies Record<string, ResourceGateConfig>;

/** Pure resolution against a snapshot — unit-tested. */
export function resolveSlugGate(
  slug: string,
  liveSlugs: Set<string>,
  reserved: readonly string[] = [],
  redirects: Map<string, string> = new Map(),
): SlugGateResult {
  if (reserved.includes(slug)) return { kind: "ok" };
  if (liveSlugs.has(slug)) return { kind: "ok" };
  const target = redirects.get(slug);
  // Never redirect to itself or to a target that is not live — that would loop
  // or hand the browser a 301 to a 404.
  if (target && target !== slug && liveSlugs.has(target)) {
    return { kind: "redirect", slug: target };
  }
  return { kind: "not-found" };
}

type Snapshot = { slugs: Set<string>; redirects: Map<string, string>; fetchedAt: number };

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

type RedirectRow = { old_slug: string | null; [key: string]: unknown };

/**
 * Retired-slug → live-slug map. Embeds the target row so the map holds slugs,
 * never ids — the resolver can then check the target is live without a second
 * lookup, which is what makes chains and dead targets impossible to follow.
 *
 * Pre-migration safety: before 0120 the table does not exist, this fetch
 * fails, and the map stays empty — existence gating still works.
 */
async function fetchRedirects(
  cfg: ResourceGateConfig,
  env: SlugGateEnv,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!cfg.redirectTable) return map;
  try {
    const res = await fetch(
      `${env.supabaseUrl}/rest/v1/${cfg.redirectTable}` +
        `?select=old_slug,${cfg.table}!inner(slug)` +
        `&${cfg.table}.${cfg.publishedColumn}=eq.true&limit=${ROW_CAP}`,
      { headers: restHeaders(env) },
    );
    if (!res.ok) return map;
    const rows: RedirectRow[] = await res.json();
    for (const row of rows) {
      const embedded = row[cfg.table] as { slug: string | null } | null;
      const target = embedded?.slug;
      if (row.old_slug && target) map.set(row.old_slug, target);
    }
  } catch {
    /* Fail open: no redirects rather than no gate. */
  }
  return map;
}

async function fetchSnapshot(
  cfg: ResourceGateConfig,
  env: SlugGateEnv,
): Promise<Snapshot | null> {
  try {
    const [res, redirects] = await Promise.all([
      fetch(
        `${env.supabaseUrl}/rest/v1/${cfg.table}?select=slug&${cfg.publishedColumn}=eq.true&slug=not.is.null&limit=${ROW_CAP}`,
        { headers: restHeaders(env) },
      ),
      fetchRedirects(cfg, env),
    ]);
    if (!res.ok) return null;
    const rows: { slug: string | null }[] = await res.json();
    const slugs = new Set(rows.map((r) => r.slug).filter((s): s is string => !!s));
    return { slugs, redirects, fetchedAt: Date.now() };
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
    // Not a live slug. Before calling it a 404, check whether it is a slug that
    // was retired more recently than the snapshot — otherwise every rename
    // 404s its own old URL for up to the snapshot TTL, which is precisely the
    // window in which the old links are still being followed.
    return confirmRedirect(cfg, slug, env);
  } catch {
    return null;
  }
}

/** One confirming round-trip for a redirect the snapshot doesn't know yet. */
async function confirmRedirect(
  cfg: ResourceGateConfig,
  slug: string,
  env: SlugGateEnv,
): Promise<SlugGateResult | null> {
  if (!cfg.redirectTable) return { kind: "not-found" };
  try {
    const enc = encodeURIComponent(slug);
    const res = await fetch(
      `${env.supabaseUrl}/rest/v1/${cfg.redirectTable}` +
        `?select=old_slug,${cfg.table}!inner(slug)` +
        `&old_slug=eq.${enc}&${cfg.table}.${cfg.publishedColumn}=eq.true&limit=1`,
      { headers: restHeaders(env) },
    );
    if (!res.ok) return { kind: "not-found" };
    const rows: RedirectRow[] = await res.json();
    const embedded = rows[0]?.[cfg.table] as { slug: string | null } | null;
    const target = embedded?.slug;
    if (target && target !== slug) {
      snapshots.get(cfg.table)?.redirects.set(slug, target);
      return { kind: "redirect", slug: target };
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
  const verdict = resolveSlugGate(slug, snap.slugs, cfg.reserved, snap.redirects);
  if (verdict.kind !== "not-found") return verdict;
  return confirmSlug(cfg, slug, env);
}

/** Test hook — resets the per-isolate caches. */
export function __resetResourceSlugGate() {
  snapshots.clear();
  refreshing.clear();
}
