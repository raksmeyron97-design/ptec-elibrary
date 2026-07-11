import { NextResponse } from "next/server";

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

export async function GET() {
  const [db, storage] = await Promise.all([
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
      return res.ok;
    }),
    probe(async (signal) => {
      const base = process.env.ZIMA_API_URL;
      if (!base) return false;
      // Reachability only: any HTTP status from the origin means it's up.
      await fetch(base, { method: "HEAD", signal, cache: "no-store" });
      return true;
    }),
  ]);

  const healthy = db && storage;
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      checks: { db: db ? "ok" : "fail", storage: storage ? "ok" : "fail" },
      ts: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
