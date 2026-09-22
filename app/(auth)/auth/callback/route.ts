import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySignup } from "@/app/actions/auth";
import { createAdminNotification } from "@/lib/admin-notifications";
import { safeReturnTo } from "@/lib/security/return-to";
import { canonicalOrigin } from "@/lib/site-origin";
import {
  providerAvatarMayReplace,
  providerAvatarUrl,
  providerFullName,
} from "@/lib/auth/oauth-avatar";
import type { EmailOtpType } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";

// The PKCE `code` path runs on every OAuth sign-in, so guard the "new user"
// admin notification to genuinely fresh accounts (created in the last 5 minutes)
// instead of firing on every returning-user login.
function isFreshSignup(createdAt?: string): boolean {
  if (!createdAt) return false;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  return ageMs >= 0 && ageMs < 5 * 60 * 1000;
}

/**
 * Persist the identity provider's photo and name into `public.profiles`.
 *
 * `handle_new_user()` copies only id/email/full_name out of
 * `raw_user_meta_data`, so `profiles.avatar_url` is NULL for every Google
 * account. The read paths fall back to auth metadata for the signed-in reader
 * and for anything the admin API can reach, but the surfaces that JOIN the
 * profile row for OTHER people — review lists, the admin activity log, the
 * mobile nav — have no metadata to fall back to. This is what fills the column
 * for them.
 *
 * Three rules:
 *  - An uploaded avatar is never overwritten (`providerAvatarMayReplace`); a
 *    photo we put there ourselves IS refreshed, because Google's URLs rotate.
 *  - A name is only filled when the row has none. A reader who renamed
 *    themselves in Settings must not be renamed back by Google on next login.
 *  - Failure is silent. This is a nicety attached to a sign-in; a write that
 *    fails must not cost the reader their session.
 *
 * Runs on the reader's own client, not the service role: `profiles` already
 * allows a self-update, and `tr_prevent_role_update` still guards role.
 */
async function syncProviderProfile(
  supabase: SupabaseClient,
  user: User,
): Promise<void> {
  const avatar = providerAvatarUrl(user.user_metadata);
  const name = providerFullName(user.user_metadata);
  if (!avatar && !name) return;

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile) return;

    const updates: { avatar_url?: string; full_name?: string } = {};
    if (avatar && providerAvatarMayReplace(profile.avatar_url as string | null)) {
      if (avatar !== profile.avatar_url) updates.avatar_url = avatar;
    }
    if (name && !(profile.full_name as string | null)?.trim()) {
      updates.full_name = name;
    }
    if (!Object.keys(updates).length) return;

    await supabase.from("profiles").update(updates).eq("id", user.id);
  } catch {
    /* A profile that did not take the photo still has a working session. */
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // NOT `new URL(request.url).origin`. Behind Cloudflare Tunnel the same
  // container answers on the canonical domain, on the tunnel's fallback
  // hostname, and on a plain-http LAN address — and this redirect is what
  // carries a freshly minted session cookie. Sending it to whichever origin
  // the callback happened to land on drops the user on a host that does not
  // hold their session (or on http, where the cookie is refused outright).
  const origin = canonicalOrigin(request.url);

  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Open-redirect guard: reuse the shared, unit-tested helper rather than a
  // second, weaker local copy. It rejects protocol-relative, backslash, scheme,
  // control-character and over-long targets; only same-origin internal paths
  // survive. Default landing is the dashboard for a completed sign-in.
  const next = safeReturnTo(
    searchParams.get("callbackUrl") ?? searchParams.get("next"),
    "/dashboard",
  );

  const supabase = await createClient();

  if (token_hash && type) {
    // Email confirmation link opened in a different browser than where signup occurred
    // (e.g., Gmail app → Safari/Chrome). PKCE verifier won't be present, so Supabase
    // sends token_hash + type instead of code.
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      const verification = await verifySignup();
      if (!verification.success) {
        return NextResponse.redirect(`${origin}/auth/login?error=admin_signup_blocked`);
      }
      const { data: { user: newUser } } = await supabase.auth.getUser();
      if (newUser) await syncProviderProfile(supabase, newUser);
      if (newUser?.email && isFreshSignup(newUser.created_at)) {
        await createAdminNotification("new_user", `New user registered: ${newUser.email}`, undefined, "/admin/users");
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  } else if (code) {
    // PKCE flow — same browser context as signup
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const verification = await verifySignup();
      if (!verification.success) {
        return NextResponse.redirect(`${origin}/auth/login?error=admin_signup_blocked`);
      }
      const { data: { user: newUser } } = await supabase.auth.getUser();
      if (newUser) await syncProviderProfile(supabase, newUser);
      if (newUser?.email && isFreshSignup(newUser.created_at)) {
        await createAdminNotification("new_user", `New user registered: ${newUser.email}`, undefined, "/admin/users");
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth failed — redirect to login with error
  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
