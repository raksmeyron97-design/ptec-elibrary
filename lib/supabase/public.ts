// lib/supabase/public.ts
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// ── Public client (ANON key, NO cookies) ──────────────────────────
// For public, non-personalized reads only. Because it never touches
// next/headers cookies, it is safe to call inside unstable_cache()
// and does not opt the route into dynamic rendering.
// Queries run as `anon` and respect RLS.
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
