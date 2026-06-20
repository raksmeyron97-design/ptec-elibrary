import "server-only";

import type { User } from "@supabase/supabase-js";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type AdminAuthStatus = 401 | 403 | 500;

/** Redirect paths for MFA flows — used by the layout and client-side redirects. */
export const MFA_ENROLL_PATH = "/admin/mfa/enroll" as const;
export const MFA_VERIFY_PATH = "/admin/mfa/verify" as const;

export class AdminAuthError extends Error {
  readonly status: AdminAuthStatus;
  /** Optional redirect hint for the caller (e.g. MFA enroll/verify page). */
  readonly redirectTo?: string;

  constructor(message: string, status: AdminAuthStatus, redirectTo?: string) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
    this.redirectTo = redirectTo;
  }
}

export interface RequiredAdmin {
  supabase: ReturnType<typeof createServiceClient>;
  user: User;
  userId: string;
  role: "admin";
}

export function isAdminAuthError(error: unknown): error is AdminAuthError {
  return error instanceof AdminAuthError;
}

/**
 * Gate every admin Server Action / Route Handler.
 *
 * Checks (in order):
 *  1. User is authenticated (has a valid session)
 *  2. User has `role === "admin"` in the profiles table
 *  3. User has completed MFA verification (AAL2) if they have enrolled factors
 *
 * Throws `AdminAuthError` with an appropriate status code on failure.
 */
export async function requireAdmin(): Promise<RequiredAdmin> {
  const authClient = await createClient();
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    throw new AdminAuthError("Not authenticated", 401);
  }

  // ── Role check ──────────────────────────────────────────────────────────
  const supabase = createServiceClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new AdminAuthError("Unable to verify admin role", 500);
  }

  if (profile?.role !== "admin") {
    throw new AdminAuthError("Forbidden", 403);
  }

  // ── MFA / AAL2 check ────────────────────────────────────────────────────
  // If the admin has enrolled TOTP factors, require AAL2 (i.e. they must
  // have completed the TOTP challenge in this session).
  const { data: aalData, error: aalError } =
    await authClient.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aalError) {
    throw new AdminAuthError("Unable to verify MFA status", 500);
  }

  if (aalData) {
    const hasEnrolledFactors =
      aalData.nextLevel === "aal2" || aalData.currentLevel === "aal2";

    if (hasEnrolledFactors && aalData.currentLevel !== "aal2") {
      throw new AdminAuthError(
        "MFA verification required",
        403,
        MFA_VERIFY_PATH,
      );
    }

    // If admin has NO enrolled factors, they should enroll.
    // We don't block actions here (they need to enroll first via the layout),
    // but this check exists so the layout can enforce enrollment.
  }

  return { supabase, user, userId: user.id, role: "admin" };
}
