import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Request-deduped session lookup. `supabase.auth.getUser()` makes a network
 * round-trip to Supabase Auth for signed-in visitors, so layouts, the navbar
 * and pages sharing one render must not each pay for their own call —
 * React `cache()` collapses them into a single lookup per request.
 *
 * Definitive authorization stays where it always was (guards in
 * lib/auth-guards.ts, RLS, per-route checks) — this is for render-time
 * personalisation reads only.
 */
export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Zero-network hint that a Supabase session cookie exists. Enough for UI
 * affordances (e.g. showing the "Ask" widget in signed-in mode) that must
 * not block server rendering on an auth round-trip; anything the hint
 * unlocks still verifies the user server-side before doing real work.
 */
export async function hasSessionCookie(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}
