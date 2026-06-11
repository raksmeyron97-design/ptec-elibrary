import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySignup } from "@/app/actions/auth";
import { createAdminNotification } from "@/app/actions/notifications";
import type { EmailOtpType } from "@supabase/supabase-js";

function safeCallbackUrl(raw: string | null): string {
  if (!raw) return "/dashboard";
  // Allow only relative paths; reject protocol-relative (//), absolute, or backslash variants
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeCallbackUrl(searchParams.get("callbackUrl") ?? searchParams.get("next"));

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
      if (newUser?.email) {
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
      if (newUser?.email) {
        await createAdminNotification("new_user", `New user registered: ${newUser.email}`, undefined, "/admin/users");
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth failed — redirect to login with error
  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
