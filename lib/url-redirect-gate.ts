// Edge-safe URL-permanence gate for middleware (migration 0170, SEO audit
// 2026-10 WI-1).
//
// The slug gates (lib/book-slug-gate.ts, lib/resource-slug-gate.ts) answer
// "is this a live record?". This answers the question asked only AFTER one of
// them has said no: "did a live URL used to be here?". `url_redirects` holds
// one decision per retired path — 301 to a successor, or 410 because the
// record was removed on purpose — and nothing else the edge may read (the
// `reason` column is not granted to anon; it can name a rights removal).
//
// Same snapshot design as the resource gate: one per edge isolate, 120 s TTL,
// served stale while one refresh runs, FAIL OPEN (null) when the database
// does not answer — a gate that cannot answer must never turn a 404 into
// something else. Two differences, both because every 404 the site serves
// (crawler probes included) reaches this function:
//   * a FRESH, COMPLETE snapshot is authoritative — a miss costs no network
//     call (correction C6 to the Gate 5 plan). Only a snapshot that hit the
//     row cap confirms a miss with one keyed read.
//   * truncation is `rows.length >= ROW_CAP`, not "asked for cap+1, got
//     cap+1": PostgREST clips every response at db-max-rows (1000) whatever
//     `limit` says, so the extra row would never arrive and a capped
//     snapshot would pass itself off as complete.
//
// Lookup keys are DECODED, locale-less paths ("/books/<khmer slug>"), the
// shape 0170 stores; the Location header re-encodes each segment once.

export type UrlRedirectRow = {
  old_path: string;
  target_path: string | null;
  status: number;
};

export type UrlRedirectVerdict =
  | { kind: "redirect"; path: string }
  | { kind: "gone" }
  | { kind: "none" };

export type UrlRedirectEnv = { supabaseUrl: string; anonKey: string };

/** The 0170 `url_redirects_shape` check, mirrored so a malformed row is never followed. */
const PATH_SHAPE = /^\/[a-z]+(\/[^/]+)+$/;

/** Longer than any real public path; a probe past it is not worth a lookup. */
const MAX_PATH_LENGTH = 1024;

/**
 * The rollback switch. Default ON; only an explicit `URL_REDIRECTS=off`
 * disables the gate, which restores the pre-0170 middleware exactly (every
 * not-found branch rewrites to the 404 page as before).
 */
export function urlRedirectsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.URL_REDIRECTS?.trim().toLowerCase() !== "off";
}

/** Decode each segment of a request path once. A malformed escape is `null`. */
export function decodeRequestPath(rawPath: string): string | null {
  if (!rawPath.startsWith("/") || rawPath.length > MAX_PATH_LENGTH) return null;
  try {
    return rawPath
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    return null;
  }
}

/** Pure resolution against the rows — unit-tested. */
export function resolveUrlRedirect(
  path: string,
  rows: ReadonlyMap<string, UrlRedirectRow>,
): UrlRedirectVerdict {
  const row = rows.get(path);
  if (!row) return { kind: "none" };
  if (row.status === 410 && row.target_path === null) return { kind: "gone" };
  if (
    row.status === 301 &&
    typeof row.target_path === "string" &&
    row.target_path !== path &&
    PATH_SHAPE.test(row.target_path)
  ) {
    return { kind: "redirect", path: row.target_path };
  }
  return { kind: "none" };
}

/**
 * The Location for a 301: the request's locale prefix, each segment of the
 * decoded target encoded exactly once, and the request's query string.
 */
export function redirectLocation(localePrefix: "" | "/km", path: string, search: string): string {
  const encoded = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${localePrefix}${encoded}${search}`;
}

type Snapshot = { rows: Map<string, UrlRedirectRow>; truncated: boolean; fetchedAt: number };

const SNAPSHOT_TTL_MS = 120_000;
const ROW_CAP = 1000;
const SELECT = "select=old_path,target_path,status";

let snapshot: Snapshot | null = null;
let refreshing: Promise<void> | null = null;

function restHeaders(env: UrlRedirectEnv) {
  return { apikey: env.anonKey, Authorization: `Bearer ${env.anonKey}` };
}

function toRow(value: unknown): UrlRedirectRow | null {
  if (!value || typeof value !== "object") return null;
  const { old_path, target_path, status } = value as Record<string, unknown>;
  if (typeof old_path !== "string" || typeof status !== "number") return null;
  if (target_path !== null && typeof target_path !== "string") return null;
  return { old_path, target_path, status };
}

async function fetchSnapshot(env: UrlRedirectEnv): Promise<Snapshot | null> {
  try {
    const res = await fetch(`${env.supabaseUrl}/rest/v1/url_redirects?${SELECT}&limit=${ROW_CAP}`, {
      headers: restHeaders(env),
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (!Array.isArray(body)) return null;
    const rows = new Map<string, UrlRedirectRow>();
    for (const item of body) {
      const row = toRow(item);
      if (row) rows.set(row.old_path, row);
    }
    return { rows, truncated: body.length >= ROW_CAP, fetchedAt: Date.now() };
  } catch {
    return null;
  }
}

async function getSnapshot(env: UrlRedirectEnv): Promise<Snapshot | null> {
  const current = snapshot;
  if (current && Date.now() - current.fetchedAt < SNAPSHOT_TTL_MS) return current;
  if (current) {
    // Stale: serve now, refresh in the background (at most one in flight).
    if (!refreshing) {
      refreshing = fetchSnapshot(env)
        .then((next) => {
          if (next) snapshot = next;
        })
        .catch(() => {})
        .finally(() => {
          refreshing = null;
        });
    }
    return current;
  }
  const fresh = await fetchSnapshot(env);
  if (fresh) snapshot = fresh;
  return snapshot;
}

/** One keyed read for a path a truncated snapshot could not rule out. */
async function confirmPath(path: string, env: UrlRedirectEnv): Promise<UrlRedirectVerdict | null> {
  try {
    const res = await fetch(
      `${env.supabaseUrl}/rest/v1/url_redirects?${SELECT}&old_path=eq.${encodeURIComponent(path)}&limit=1`,
      { headers: restHeaders(env) },
    );
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const row = Array.isArray(body) ? toRow(body[0]) : null;
    if (!row) return { kind: "none" };
    snapshot?.rows.set(row.old_path, row);
    return resolveUrlRedirect(path, new Map([[row.old_path, row]]));
  } catch {
    return null;
  }
}

/**
 * Verdict for a request path the slug gates have already called "not found".
 * `rawPath` is the locale-less request path as the URL carries it (encoded).
 * `null` means the gate could not answer — callers MUST fall back to the 404
 * they would have served anyway.
 */
export async function gateUrlRedirect(
  rawPath: string,
  env: UrlRedirectEnv,
): Promise<UrlRedirectVerdict | null> {
  const path = decodeRequestPath(rawPath);
  if (!path || !PATH_SHAPE.test(path)) return { kind: "none" };
  if (!env.supabaseUrl || !env.anonKey) return null;
  const snap = await getSnapshot(env);
  if (!snap) return null;
  const verdict = resolveUrlRedirect(path, snap.rows);
  if (verdict.kind !== "none" || !snap.truncated) return verdict;
  return confirmPath(path, env);
}

/** Test hook — resets the per-isolate cache. */
export function __resetUrlRedirectGate() {
  snapshot = null;
  refreshing = null;
}
