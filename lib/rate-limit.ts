// lib/rate-limit.ts
// Distributed sliding-window rate limiter backed by Supabase Postgres.
// State is shared across serverless instances and survives cold starts.

import { createClient } from "@supabase/supabase-js";

// Use the service-role client directly (no Next.js cookies needed here —
// rate-limit checks happen in API routes, not Server Components).
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const supabase = getServiceClient();

  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_ms: windowMs,
  });

  if (error) {
    // Fail open: if the DB is unavailable, allow the request rather than
    // blocking all traffic. Log so ops can detect the outage.
    console.error("[rate-limit] DB error, failing open:", error.message);
    return { success: true, remaining: limit, reset: Date.now() + windowMs };
  }

  const allowed = data as boolean;
  return {
    success: allowed,
    remaining: allowed ? 1 : 0,
    reset: Date.now() + windowMs,
  };
}
