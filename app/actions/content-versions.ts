"use server";

// Change history + rollback for books / research_reports / publications.
// Rows are written automatically by the capture_content_version() trigger
// (migration 0086) whenever a meaningful UPDATE happens; this module only
// reads them and — for admins — restores a previous snapshot.
//
// Restoring is itself an UPDATE, so the trigger snapshots the pre-restore
// state too: a bad rollback can always be rolled forward again.

import { revalidateLocalizedPath as revalidatePath } from "@/lib/cache/revalidate";
import { requireAdmin, requireLibrarian } from "@/lib/auth/requireAdmin";
import { logAdminAction } from "@/app/actions/audit";

const VERSIONED_TABLES = ["books", "research_reports", "publications"] as const;
export type VersionedTable = (typeof VERSIONED_TABLES)[number];

export type ContentVersion = {
  id: number;
  changedAt: string;
  changedBy: { id: string; name: string } | null;
  statusFrom: string | null;
  statusTo: string | null;
  snapshot: Record<string, unknown>;
};

// Columns that must never be written back during a restore: identity,
// counters owned by public traffic, derived data, and sync-trigger outputs.
const RESTORE_EXCLUDED = new Set([
  "id",
  "created_at",
  "updated_at",
  "view_count",
  "download_count",
  "rating",
  "embedding",
  "is_published", // derived from status by the sync triggers
]);

function assertTable(table: string): asserts table is VersionedTable {
  if (!VERSIONED_TABLES.includes(table as VersionedTable)) {
    throw new Error(`Unsupported table: ${table}`);
  }
}

export async function getContentVersions(
  table: VersionedTable,
  recordId: string,
  limit = 20,
): Promise<ContentVersion[]> {
  assertTable(table);
  const { supabase } = await requireLibrarian();

  const { data, error } = await supabase
    .from("content_versions")
    .select("id, snapshot, changed_by, changed_at, status_from, status_to")
    .eq("table_name", table)
    .eq("record_id", recordId)
    .order("changed_at", { ascending: false })
    .limit(limit);

  if (error) {
    // 42P01 = table missing (migration 0086 not applied yet) — empty history.
    if (error.code !== "42P01") console.error("[getContentVersions]", error.message);
    return [];
  }

  const actorIds = [...new Set((data ?? []).map((v) => v.changed_by).filter(Boolean))] as string[];
  const people = new Map<string, { id: string; name: string }>();
  if (actorIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", actorIds);
    for (const p of profiles ?? []) {
      people.set(p.id, { id: p.id, name: p.full_name || p.email || "Unknown" });
    }
  }

  return (data ?? []).map((v) => ({
    id: v.id,
    changedAt: v.changed_at,
    changedBy: v.changed_by ? (people.get(v.changed_by) ?? null) : null,
    statusFrom: v.status_from,
    statusTo: v.status_to,
    snapshot: (v.snapshot ?? {}) as Record<string, unknown>,
  }));
}

/**
 * Restore a previous snapshot onto the live row. Admin-only ("restore
 * previous version where authorized"): librarians see history but cannot
 * rewrite it.
 */
export async function restoreContentVersion(
  versionId: number,
): Promise<{ success: true } | { error: string }> {
  try {
    const { supabase, user } = await requireAdmin();

    const { data: version, error } = await supabase
      .from("content_versions")
      .select("id, table_name, record_id, snapshot, changed_at")
      .eq("id", versionId)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!version) return { error: "Version not found" };
    assertTable(version.table_name);

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(version.snapshot as Record<string, unknown>)) {
      if (!RESTORE_EXCLUDED.has(key)) updates[key] = value;
    }
    updates.updated_by = user.id;

    const { error: updateError } = await supabase
      .from(version.table_name)
      .update(updates)
      .eq("id", version.record_id);
    if (updateError) return { error: updateError.message };

    await logAdminAction(user.id, "content.version_restore", version.table_name, version.record_id, {
      versionId,
      versionDate: version.changed_at,
    });

    revalidatePath("/admin/review");
    revalidatePath("/books");
    revalidatePath("/theses");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Restore failed" };
  }
}
