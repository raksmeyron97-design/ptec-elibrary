// lib/rate-limit.ts
// Distributed sliding-window rate limiter backed by Supabase Postgres.
// State is shared across serverless instances and survives cold starts.
//
// Defense-in-depth: the DB is the primary limiter, but it must not be a single
// point of failure for abuse control. Every call carries a failure mode that
// says what happens when the DB check itself errors:
//
//   "emergency" (default) — fall back to an in-memory sliding window with the
//        same limit. Per-instance (serverless instances count separately), so
//        it undercounts across a fleet — but a DB outage no longer removes all
//        limits at once. Legitimate traffic under the limit is unaffected.
//   "closed" — deny. For operations where serving without a limit check is
//        worse than failing (nothing in this app currently requires it, but
//        destructive admin surfaces may opt in).
//   "open" — allow. Only for public, low-risk reads where availability
//        explicitly outranks abuse control. Must be chosen deliberately.
//
// A degraded-limiter security event is emitted (throttled to one per minute
// per process) so the outage is visible in the alert stream, not just stderr.

import "server-only";
import { createClient } from "@supabase/supabase-js";
import { logSecurityEvent } from "@/lib/security-log";

export type RateLimitFailMode = "open" | "emergency" | "closed";

// Use the service-role client directly (no Next.js cookies needed here —
// rate-limit checks happen in API routes, not Server Components).
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// ── In-memory emergency fallback ─────────────────────────────────────────────
// Sliding window per key. Bounded so a spray of unique keys during an outage
// can't exhaust memory; clearing on overflow briefly resets counts, which is
// acceptable for a degraded-mode limiter.
const EMERGENCY_MAX_KEYS = 50_000;
const emergencyBuckets = new Map<string, number[]>();

/** Exported for tests only. */
export function _resetEmergencyLimiter(): void {
  emergencyBuckets.clear();
}

function emergencyAllow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  let hits = emergencyBuckets.get(key);
  if (!hits) {
    if (emergencyBuckets.size >= EMERGENCY_MAX_KEYS) emergencyBuckets.clear();
    hits = [];
    emergencyBuckets.set(key, hits);
  }
  while (hits.length > 0 && hits[0] <= cutoff) hits.shift();
  if (hits.length >= limit) return false;
  hits.push(now);
  return true;
}

// One degraded-limiter event per process per minute — the outage itself will
// produce one line per request on stderr; the security stream gets a heartbeat.
let lastDegradedEventAt = 0;

function reportDegraded(detail: string): void {
  console.error("[rate-limit] DB error:", detail);
  const now = Date.now();
  if (now - lastDegradedEventAt >= 60_000) {
    lastDegradedEventAt = now;
    logSecurityEvent({
      type: "rate_limiter_degraded",
      where: "lib/rate-limit",
      detail,
    });
  }
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  opts?: { failMode?: RateLimitFailMode }
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const failMode = opts?.failMode ?? "emergency";
  const supabase = getServiceClient();

  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_ms: windowMs,
  });

  if (error) {
    reportDegraded(error.message);
    if (failMode === "closed") {
      return { success: false, remaining: 0, reset: Date.now() + windowMs };
    }
    if (failMode === "open") {
      return { success: true, remaining: limit, reset: Date.now() + windowMs };
    }
    // "emergency": enforce the same policy from process memory.
    const allowed = emergencyAllow(key, limit, windowMs);
    return {
      success: allowed,
      remaining: allowed ? 1 : 0,
      reset: Date.now() + windowMs,
    };
  }

  const allowed = data as boolean;
  return {
    success: allowed,
    remaining: allowed ? 1 : 0,
    reset: Date.now() + windowMs,
  };
}
