import { createServiceClient } from "@/lib/supabase/server";
import { requireSuperAdmin, isAdminAuthError } from "@/lib/auth/requireAdmin";
import { redirect } from "next/navigation";
import RolesWorkspace from "@/components/admin/roles/RolesWorkspace";
import type { AppRole, PermLevel } from "@/lib/types/roles";
import { ALL_ROLES } from "@/lib/types/roles";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";
import type { PermMatrix } from "@/lib/admin/roles-shared";

export const metadata = { title: "Role Management - PTEC Library" };

function formatUpdated(iso: string): string {
  // Pinned to a fixed zone so the server-rendered string matches the client.
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function AdminRolesPage() {
  try {
    await requireSuperAdmin();
  } catch (err) {
    if (isAdminAuthError(err) && err.status === 403) {
      redirect("/admin");
    }
    throw err;
  }

  const supabase = createServiceClient();

  const [profilesResult, permsResult] = await Promise.all([
    supabase.from("profiles").select("role"),
    supabase.from("role_permissions").select("role, resource, level, updated_at, updated_by"),
  ]);

  // ── Role counts ───────────────────────────────────────────────────────────
  const roleCounts: Record<AppRole, number> = {
    reader: 0, staff: 0, librarian: 0, admin: 0, super_admin: 0,
  };
  for (const p of profilesResult.data ?? []) {
    const r = p.role as AppRole;
    if (r in roleCounts) roleCounts[r]++;
  }

  // ── Effective permission matrix ─────────────────────────────────────────────
  // Seed from the hardcoded defaults so resources that were never persisted
  // (e.g. learning_paths, contact) reflect their true effective level, then
  // overlay whatever the DB has stored.
  const matrix = {} as PermMatrix;
  for (const role of ALL_ROLES) {
    matrix[role] = { ...(DEFAULT_PERMISSIONS[role] ?? {}) };
  }
  let latest: { updated_at: string; updated_by: string | null } | null = null;
  for (const row of permsResult.data ?? []) {
    const r = row.role as AppRole;
    if (r in matrix) matrix[r][row.resource] = row.level as PermLevel;
    if (row.updated_at && (!latest || row.updated_at > latest.updated_at)) {
      latest = { updated_at: row.updated_at, updated_by: row.updated_by ?? null };
    }
  }

  // ── Last-updated attribution ────────────────────────────────────────────────
  const lastUpdatedLabel: string | null = latest ? formatUpdated(latest.updated_at) : null;
  let lastUpdatedBy: string | null = null;
  if (latest?.updated_by) {
    const { data: editor } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", latest.updated_by)
      .single();
    lastUpdatedBy = editor?.full_name ?? null;
  }

  return (
    <RolesWorkspace
      allRoles={ALL_ROLES}
      roleCounts={roleCounts}
      totalUsers={(profilesResult.data ?? []).length}
      initialMatrix={matrix}
      lastUpdatedLabel={lastUpdatedLabel}
      lastUpdatedBy={lastUpdatedBy}
    />
  );
}
