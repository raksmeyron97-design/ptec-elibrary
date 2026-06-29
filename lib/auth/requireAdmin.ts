import "server-only";

import type { User } from "@supabase/supabase-js";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/types/roles";
import { ADMIN_ROLES, ADMIN_PANEL_ROLES, LIBRARIAN_ROLES } from "@/lib/types/roles";
import { getPermissionsForRole, hasPermission } from "@/lib/permissions";

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
  role: AppRole;
}

export function isAdminAuthError(error: unknown): error is AdminAuthError {
  return error instanceof AdminAuthError;
}

/** Shared auth + MFA verification logic used by all guards below. */
async function verifyAuthAndMFA(): Promise<{
  authClient: Awaited<ReturnType<typeof createClient>>;
  supabase: ReturnType<typeof createServiceClient>;
  user: User;
  role: AppRole;
  isSuperAdmin: boolean;
}> {
  const authClient = await createClient();
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError || !user) {
    throw new AdminAuthError("Not authenticated", 401);
  }

  const supabase = createServiceClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_super_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new AdminAuthError("Unable to verify role", 500);
  }

  const role = (profile?.role ?? "reader") as AppRole;
  const isSuperAdmin = (profile?.is_super_admin ?? false) as boolean;

  // MFA / AAL2 check — required for any admin-panel role
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
  }

  return { authClient, supabase, user, role, isSuperAdmin };
}

/**
 * Gate every admin Server Action / Route Handler.
 * Accepts role: admin | super_admin, OR the legacy is_super_admin flag.
 */
export async function requireAdmin(): Promise<RequiredAdmin> {
  const { supabase, user, role, isSuperAdmin } = await verifyAuthAndMFA();

  if (!ADMIN_ROLES.includes(role) && !isSuperAdmin) {
    throw new AdminAuthError("Forbidden", 403);
  }

  return { supabase, user, userId: user.id, role };
}

/**
 * Gate actions accessible to staff and above
 * (staff, librarian, admin, super_admin), OR the legacy is_super_admin flag.
 */
export async function requireStaff(): Promise<RequiredAdmin> {
  const { supabase, user, role, isSuperAdmin } = await verifyAuthAndMFA();

  if (!ADMIN_PANEL_ROLES.includes(role) && !isSuperAdmin) {
    throw new AdminAuthError("Forbidden", 403);
  }

  return { supabase, user, userId: user.id, role };
}

/**
 * Gate actions accessible to librarians and above
 * (librarian, admin, super_admin), OR the legacy is_super_admin flag.
 */
export async function requireLibrarian(): Promise<RequiredAdmin> {
  const { supabase, user, role, isSuperAdmin } = await verifyAuthAndMFA();

  if (!LIBRARIAN_ROLES.includes(role) && !isSuperAdmin) {
    throw new AdminAuthError("Forbidden", 403);
  }

  return { supabase, user, userId: user.id, role };
}

/**
 * Gate actions accessible to super_admin only.
 * Accepts role === "super_admin" OR the legacy is_super_admin flag.
 */
export async function requireSuperAdmin(): Promise<RequiredAdmin> {
  const { supabase, user, role, isSuperAdmin } = await verifyAuthAndMFA();

  if (role !== "super_admin" && !isSuperAdmin) {
    throw new AdminAuthError("Forbidden", 403);
  }

  return { supabase, user, userId: user.id, role };
}

/**
 * Gate access by checking the `role_permissions` table for a specific resource.
 * Super admins always pass. Falls back to hardcoded defaults if the table has no data.
 *
 * @param resource  - e.g. "books", "posts", "announcements", "research", "catalog"
 * @param minLevel  - "read" (any non-none access) or "write" (must be "write")
 */
export async function requirePermission(
  resource: string,
  minLevel: "read" | "write" = "write",
): Promise<RequiredAdmin> {
  const { supabase, user, role, isSuperAdmin } = await verifyAuthAndMFA();

  if (isSuperAdmin || role === "super_admin") {
    return { supabase, user, userId: user.id, role };
  }

  const perms = await getPermissionsForRole(role, supabase);

  if (!hasPermission(perms, resource, minLevel)) {
    throw new AdminAuthError("Forbidden", 403);
  }

  return { supabase, user, userId: user.id, role };
}
