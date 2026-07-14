import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * The current viewer's navbar identity — nothing more.
 *
 * WHY THIS EXISTS. The navbar used to resolve the session on the server, inside
 * the public layout: a `cookies()` read plus a Supabase Auth round-trip plus a
 * `profiles` query, on every public page render. That did two bad things at
 * once — it blocked first byte on a network call no anonymous visitor needs,
 * and (via cookies()) it made every public page uncacheable. Session state now
 * loads here, client-side, off the critical path, so the page HTML itself is
 * identical for everyone and can sit in the CDN.
 *
 * SECURITY. Anon key + the caller's own cookies (never the service client), so
 * RLS decides what is readable and a caller can only ever see their own row.
 * The response is per-user and must never enter a shared cache: it is
 * `private, no-store`, and the route is force-dynamic so Next cannot prerender
 * it. Nothing here is an authorization decision — the role is returned for UI
 * affordances only; every privileged action re-checks server-side via
 * lib/auth-guards.ts.
 */
export async function GET() {
  const noStore = { "Cache-Control": "private, no-store, max-age=0" };

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ user: null }, { headers: noStore });
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, role")
    .eq("id", user.id)
    .single();

  const googleAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;
  const googleName = user.user_metadata?.full_name || user.user_metadata?.name;

  return NextResponse.json(
    {
      user: {
        id: user.id,
        email: user.email ?? "",
        full_name: profile?.full_name ?? googleName ?? null,
        avatar_url: profile?.avatar_url ?? googleAvatar ?? null,
        role: (profile?.role ?? "reader") as "reader" | "admin",
      },
    },
    { headers: noStore },
  );
}
