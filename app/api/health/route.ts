import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import {
  computeCollectionStats,
  getCollectionStats,
  type PublicCollectionStats,
} from "@/lib/collection-stats";

/**
 * Liveness + dependency health for uptime monitors and the Docker
 * HEALTHCHECK. GET /api/health → 200 when core dependencies respond,
 * 503 otherwise. Deliberately terse output — component status only, no
 * versions, hostnames, or error internals (this endpoint is public).
 *
 * Checks are cheap and bounded (3s each, run in parallel):
 *  - db:      PostgREST HEAD on a public table with the anon key
 *  - storage: any HTTP response from the Zima Storage origin counts as
 *             reachable (even 401/404 — we probe reachability, not auth)
 *
 * Deep probe (operators only): send `Authorization: Bearer $CRON_SECRET`
 * to additionally get dependency latencies, backup freshness
 * (`backupAgeHours`, from ops_events — migration 0088), and a collection-
 * stats reconciliation (`statsReconciliation`): the cached public counters
 * are compared with fresh exact DB counts, and a drift both logs a
 * structured event and self-heals by revalidating the "collection-stats"
 * tag. None of it is exposed to unauthenticated callers.
 */

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 3000;

async function probe(fn: (signal: AbortSignal) => Promise<boolean>): Promise<boolean> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fn(ctl.signal);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Latest good backup age in hours, from ops_events (0088); null = unknown. */
async function backupAgeHours(signal: AbortSignal): Promise<number | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const res = await fetch(
    `${url}/rest/v1/ops_events?kind=eq.backup_db&status=eq.ok&select=created_at&order=created_at.desc&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal, cache: "no-store" },
  );
  if (!res.ok) return null; // table missing (pre-0088) or transient error
  const rows = (await res.json()) as { created_at: string }[];
  if (!rows.length) return null;
  return Math.round(((Date.now() - new Date(rows[0].created_at).getTime()) / 3_600_000) * 10) / 10;
}

type StatsReconciliation = {
  status: "ok" | "drift" | "unavailable";
  /** Fields whose cached value differs from the fresh DB count. */
  drift?: Partial<Record<keyof PublicCollectionStats, { cached: number; actual: number }>>;
};

/**
 * Compare the cached public counters with fresh exact counts. Read-only with
 * one exception: on drift it revalidates the "collection-stats" tag so the
 * next public render self-heals. It never modifies database content.
 */
async function reconcileCollectionStats(): Promise<StatsReconciliation> {
  const [cached, actual] = await Promise.all([getCollectionStats(), computeCollectionStats()]);
  if (!cached || !actual) return { status: "unavailable" };

  const numericKeys = [
    "books",
    "theses",
    "publications",
    "physicalCatalogs",
    "learningPaths",
    "totalDigitalResources",
  ] as const;

  const drift: StatsReconciliation["drift"] = {};
  for (const key of numericKeys) {
    if (cached[key] !== actual[key]) drift[key] = { cached: cached[key], actual: actual[key] };
  }
  if (!Object.keys(drift).length) return { status: "ok" };

  console.error(
    JSON.stringify({
      event: "collection_stats_drift",
      entityType: "collection-stats",
      route: "/api/health",
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      ts: new Date().toISOString(),
      drift,
      cachedCalculatedAt: cached.calculatedAt,
    }),
  );
  revalidateTag("collection-stats", "max");
  return { status: "drift", drift };
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const deep = Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;

  const t0 = Date.now();
  let dbMs = -1;
  let storageMs = -1;

  const [db, storage, backupAge, statsReconciliation] = await Promise.all([
    probe(async (signal) => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return false;
      const res = await fetch(`${url}/rest/v1/categories?select=id&limit=1`, {
        method: "HEAD",
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal,
        cache: "no-store",
      });
      dbMs = Date.now() - t0;
      return res.ok;
    }),
    probe(async (signal) => {
      const base = process.env.ZIMA_API_URL;
      if (!base) return false;
      // Reachability only: any HTTP status from the origin means it's up.
      await fetch(base, { method: "HEAD", signal, cache: "no-store" });
      storageMs = Date.now() - t0;
      return true;
    }),
    deep
      ? (async () => {
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
          try {
            return await backupAgeHours(ctl.signal);
          } catch {
            return null;
          } finally {
            clearTimeout(timer);
          }
        })()
      : Promise.resolve(null),
    deep
      ? reconcileCollectionStats().catch((): StatsReconciliation => ({ status: "unavailable" }))
      : Promise.resolve(null),
  ]);

  const healthy = db && storage;
  const body: Record<string, unknown> = {
    status: healthy ? "ok" : "degraded",
    checks: { db: db ? "ok" : "fail", storage: storage ? "ok" : "fail" },
    ts: new Date().toISOString(),
  };
  if (deep) {
    body.latencyMs = { db: dbMs >= 0 ? dbMs : null, storage: storageMs >= 0 ? storageMs : null };
    // null = no ops_events yet (0088 pending or backups never ran) — the
    // monitor treats unknown as stale.
    body.backupAgeHours = backupAge;
    if (statsReconciliation) body.statsReconciliation = statsReconciliation;
  }

  return NextResponse.json(body, {
    status: healthy ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
