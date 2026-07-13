// Edge-safe published-book slug gate for middleware.
//
// Problem: every route under app/[locale]/(public) streams its loading
// boundary first, so an unknown /books/<slug> returns HTTP 200 with not-found
// content (a soft 404), and a retired duplicate's slug can't emit a real 301.
// Search engines need the real status codes.
//
// Constraint: the public fast path must not gain a per-request network call
// (see vercel.json regions note — middleware runs at the edge, Supabase is in
// SIN). So the gate keeps an in-memory snapshot of all published slugs plus
// the book_slug_redirects map per edge isolate:
//
//   * snapshot hit  → zero added latency (Set lookup);
//   * snapshot miss → ONE confirming PostgREST round-trip before 404/301,
//     which also catches books published more recently than the snapshot
//     (and any rows beyond the 1000-row PostgREST cap);
//   * stale snapshot → served immediately, refreshed in the background;
//   * any fetch failure → fail OPEN (null verdict, request falls through to
//     the page exactly as before this gate existed).
//
// Pre-migration safety: if book_slug_redirects doesn't exist yet (0091 not
// applied), its fetch just fails and the redirect map stays empty — existence
// checking still works.

export type BookGateResult =
  | { kind: "ok" }
  | { kind: "redirect"; slug: string }
  | { kind: "not-found" };

export type BookGateEnv = { supabaseUrl: string; anonKey: string };

/** Pure resolution against a snapshot — unit-tested in lib/book-slug-gate.test.ts. */
export function resolveBookGate(
  slug: string,
  liveSlugs: Set<string>,
  redirects: Map<string, string>,
): BookGateResult {
  if (liveSlugs.has(slug)) return { kind: "ok" };
  const target = redirects.get(slug);
  // Never redirect to itself or to a dead target — that would loop or chain.
  if (target && target !== slug && liveSlugs.has(target)) {
    return { kind: "redirect", slug: target };
  }
  return { kind: "not-found" };
}

type Snapshot = {
  slugs: Set<string>;
  redirects: Map<string, string>;
  fetchedAt: number;
};

const SNAPSHOT_TTL_MS = 120_000;
// PostgREST caps responses at the project max_rows (1000). Misses fall back
// to a confirming lookup, so a >1000-book future degrades gracefully.
const ROW_CAP = 1000;

let snapshot: Snapshot | null = null;
let refreshing: Promise<void> | null = null;

function restHeaders(env: BookGateEnv) {
  return { apikey: env.anonKey, Authorization: `Bearer ${env.anonKey}` };
}

type RedirectRow = { old_slug: string | null; books: { slug: string | null } | null };

async function fetchSnapshot(env: BookGateEnv): Promise<Snapshot | null> {
  try {
    const [slugsRes, redirectsRes] = await Promise.all([
      fetch(
        `${env.supabaseUrl}/rest/v1/books?select=slug&is_published=eq.true&limit=${ROW_CAP}`,
        { headers: restHeaders(env) },
      ),
      fetch(
        `${env.supabaseUrl}/rest/v1/book_slug_redirects?select=old_slug,books!inner(slug)&books.is_published=eq.true&limit=${ROW_CAP}`,
        { headers: restHeaders(env) },
      ),
    ]);
    if (!slugsRes.ok) return null;
    const slugRows: { slug: string | null }[] = await slugsRes.json();
    const slugs = new Set(slugRows.map((r) => r.slug).filter((s): s is string => !!s));

    const redirects = new Map<string, string>();
    if (redirectsRes.ok) {
      const rows: RedirectRow[] = await redirectsRes.json();
      for (const row of rows) {
        const target = row.books?.slug;
        if (row.old_slug && target) redirects.set(row.old_slug, target);
      }
    }
    return { slugs, redirects, fetchedAt: Date.now() };
  } catch {
    return null;
  }
}

async function getSnapshot(env: BookGateEnv): Promise<Snapshot | null> {
  if (snapshot && Date.now() - snapshot.fetchedAt < SNAPSHOT_TTL_MS) return snapshot;
  if (snapshot) {
    // Stale: serve it now, refresh in the background (at most one in flight;
    // if the isolate kills the promise, the next request retries).
    refreshing ??= fetchSnapshot(env)
      .then((next) => {
        if (next) snapshot = next;
      })
      .catch(() => {})
      .finally(() => {
        refreshing = null;
      });
    return snapshot;
  }
  const fresh = await fetchSnapshot(env);
  if (fresh) snapshot = fresh;
  return snapshot;
}

/** One confirming round-trip for a slug the snapshot doesn't know: newly
 *  published book, row beyond the cap, or a brand-new redirect. */
async function confirmSlug(slug: string, env: BookGateEnv): Promise<BookGateResult | null> {
  try {
    const enc = encodeURIComponent(slug);
    const [bookRes, redirectRes] = await Promise.all([
      fetch(
        `${env.supabaseUrl}/rest/v1/books?select=slug&slug=eq.${enc}&is_published=eq.true&limit=1`,
        { headers: restHeaders(env) },
      ),
      fetch(
        `${env.supabaseUrl}/rest/v1/book_slug_redirects?select=old_slug,books!inner(slug)&old_slug=eq.${enc}&books.is_published=eq.true&limit=1`,
        { headers: restHeaders(env) },
      ),
    ]);
    if (!bookRes.ok) return null; // gate unavailable — fail open
    const bookRows: { slug: string }[] = await bookRes.json();
    if (bookRows.length > 0) {
      snapshot?.slugs.add(slug);
      return { kind: "ok" };
    }
    if (redirectRes.ok) {
      const rows: RedirectRow[] = await redirectRes.json();
      const target = rows[0]?.books?.slug;
      if (target && target !== slug) {
        snapshot?.redirects.set(slug, target);
        return { kind: "redirect", slug: target };
      }
    }
    return { kind: "not-found" };
  } catch {
    return null;
  }
}

/** Gate verdict for a /books/<slug> request. `null` means the gate could not
 *  answer (DB unreachable) — callers must fall through unchanged. */
export async function gateBookSlug(
  slug: string,
  env: BookGateEnv,
): Promise<BookGateResult | null> {
  if (!env.supabaseUrl || !env.anonKey) return null;
  const snap = await getSnapshot(env);
  if (!snap) return null;
  const verdict = resolveBookGate(slug, snap.slugs, snap.redirects);
  if (verdict.kind !== "not-found") return verdict;
  return confirmSlug(slug, env);
}

/** Test hook — resets the per-isolate cache. */
export function __resetBookSlugGate() {
  snapshot = null;
  refreshing = null;
}
