"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { decideSignup } from "@/lib/auth/reserved-domains";
import { logSecurityEvent } from "@/lib/security-log";

/**
 * Post-callback gate for `/auth/callback`.
 *
 * Despite the name it runs on **every** completed callback, not only on a first
 * signup: the PKCE branch fires on each OAuth sign-in. That is why the decision
 * below has to be about *how the account authenticated*, not about the address
 * it authenticated with — the previous version compared the email domain and
 * nothing else, so a `@ptec.edu.kh` reader who clicked "Continue with Google"
 * had their auth user deleted, and `profiles` cascades from `auth.users`, so
 * their role, saved books and reading progress went with it. Every subsequent
 * sign-in did it again.
 *
 * The rule itself lives in `lib/auth/reserved-domains.ts` and is shared with
 * the signup form and mirrored by migration 0068, which is the enforcement
 * point that cannot be bypassed. This is the belt-and-braces copy for the
 * environments where that trigger has not been applied.
 */
export async function verifySignup() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user || !user.email) {
    return { success: true };
  }

  const decision = decideSignup({
    email: user.email,
    appMetadata: user.app_metadata,
    invitedAt: user.invited_at,
  });

  if (decision.allowed) {
    return { success: true };
  }

  /* A self-service email/password signup on a domain the library reserves.
     Migration 0068 refuses this at INSERT, so reaching here means the trigger
     is missing (or was bypassed) — worth a security event either way, since
     the alternative reading is someone calling the GoTrue API directly. */
  logSecurityEvent({
    type: "auth_forbidden",
    where: "verifySignup:reserved_admin_domain",
    userId: user.id,
  });

  const supabase = createServiceClient();
  await supabase.auth.admin.deleteUser(user.id);

  return {
    success: false,
    error: "Signup with an admin domain is not permitted via this page.",
  };
}
