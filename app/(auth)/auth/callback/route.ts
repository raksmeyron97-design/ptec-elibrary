import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySignup } from "@/app/actions/auth";

function safeCallbackUrl(raw: string | null): string {
  if (!raw) return "/dashboard";
  // Allow only relative paths; reject protocol-relative (//), absolute, or backslash variants
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/dashboard";
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const next = safeCallbackUrl(searchParams.get("callbackUrl"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const verification = await verifySignup();
      if (!verification.success) {
        return NextResponse.redirect(`${origin}/auth/login?error=admin_signup_blocked`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth failed — redirect to login with error
  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
