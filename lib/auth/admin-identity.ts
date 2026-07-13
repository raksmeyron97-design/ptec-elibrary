import { cache } from "react";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPermissionsForRole } from "@/lib/permissions";
import type { AppRole, PermLevel } from "@/lib/types/roles";

export type AdminIdentity = {
  user: { id: string; email: string | undefined } | null;
  role: AppRole;
  effectiveRole: AppRole;
  isSuperAdmin: boolean;
  fullName: string | null;
  avatarUrl: string | null;
  perms: Record<string, PermLevel>;
};

/**
 * Request-deduped admin identity: one auth round-trip + one profile query +
 * one permissions query per request, shared between the (protected) layout
 * and whichever admin page renders inside it. Before this, the layout and
 * the dashboard page each ran the same three lookups back-to-back.
 *
 * This is a read model only — the layout still owns the redirect/MFA
 * decisions, and Server Actions keep their own guards (lib/auth-guards.ts).
 */
export const getAdminIdentity = cache(async (): Promise<AdminIdentity> => {
  const authClient = await createClient();
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      role: "reader",
      effectiveRole: "reader",
      isSuperAdmin: false,
      fullName: null,
      avatarUrl: null,
      perms: {},
    };
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("role, is_super_admin, full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const role = ((profile?.role as AppRole | null) ?? "reader") as AppRole;
  const isSuperAdmin = (profile?.is_super_admin ?? false) as boolean;
  const effectiveRole: AppRole =
    isSuperAdmin || role === "super_admin" ? "super_admin" : role;
  const perms = await getPermissionsForRole(effectiveRole, service);

  return {
    user: { id: user.id, email: user.email },
    role,
    effectiveRole,
    isSuperAdmin,
    fullName: (profile?.full_name as string | null) ?? null,
    avatarUrl: (profile?.avatar_url as string | null) ?? null,
    perms,
  };
});
