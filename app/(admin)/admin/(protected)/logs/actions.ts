"use server";

// Server Actions for /admin/logs. Both enforce server-side RBAC (never trust the
// client), keep responses private, and audit sensitive access.

import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getAdminIdentity } from "@/lib/auth/admin-identity";
import { createServiceClient } from "@/lib/supabase/server";
import { logAdminAction } from "@/app/actions/audit";
import { queryActivityForExport, type ActivityFilters } from "@/lib/admin/activity-log";
import { buildCsv, maskEmail, maskPhone } from "@/lib/admin/activity-log-shared";

export type ExportFilterInput = Omit<ActivityFilters, "page" | "pageSize" | "now">;

/**
 * Build a CSV of the events matching the CURRENT filters (same query service as
 * the table, so export == what's on screen). Personal columns are masked unless
 * the caller is a super admin (least privilege). Formula-injection-safe + UTF-8
 * BOM for Khmer. Emits an audit event; never logs the data itself.
 */
export async function exportActivityLogs(
  filters: ExportFilterInput,
): Promise<{ ok: true; csv: string; filename: string; rows: number } | { ok: false; error: string }> {
  const { userId } = await requireAdmin();
  const identity = await getAdminIdentity();
  const canSeePersonal = identity.isSuperAdmin || identity.role === "super_admin";

  const events = await queryActivityForExport(filters);

  const headers = [
    "Event ID", "Event type", "Action", "Status", "Date & time (UTC)",
    "Reader name", "Reader email", "Resource type", "Resource title",
    "Institution type", "Role", "Purpose", "Rank at event",
    "Permission source", "Permission reason",
  ];
  const rows = events.map((e) => [
    e.id,
    e.eventType,
    e.eventStatus,
    e.eventStatus,
    e.occurredAt,
    canSeePersonal ? (e.actorName ?? "") : (e.actorName ? e.actorName.split(" ")[0] + " …" : ""),
    canSeePersonal ? (e.actorEmail ?? "") : (maskEmail(e.actorEmail) ?? ""),
    e.resourceType,
    e.resourceTitle ?? "",
    e.institutionType ?? "",
    e.role ?? "",
    e.purpose ?? "",
    e.rankAtEvent ?? "",
    e.permissionSource ?? "",
    e.denialReason ?? "",
  ]);

  const csv = buildCsv(headers, rows);
  const filename = `ptec-activity-logs-${new Date().toISOString().slice(0, 10)}.csv`;

  await logAdminAction(userId, "export_activity_logs", "activity_events", undefined, {
    rows: events.length,
    range: filters.range,
    resourceType: filters.resourceType,
    tab: filters.tab,
    personalDataIncluded: canSeePersonal,
  });

  if (events.length === 0) return { ok: false, error: "empty" };
  return { ok: true, csv, filename, rows: events.length };
}

/**
 * Reveal the full contact fields for one reader in the event drawer. Restricted
 * to super admins; every reveal is audited (who, whose record) — but never the
 * revealed values themselves. Returns already-formatted masked fallbacks for
 * non-privileged callers so the UI degrades safely.
 */
export async function revealReaderContact(
  targetUserId: string,
): Promise<
  | { ok: true; fullName: string | null; email: string | null; phone: string | null; gender: string | null; faculty: string | null; country: string | null }
  | { ok: false; error: string }
> {
  await requireAdmin();
  const identity = await getAdminIdentity();
  const canSeePersonal = identity.isSuperAdmin || identity.role === "super_admin";

  const db = createServiceClient();
  const { data: prof } = await db
    .from("profiles")
    .select("full_name, email, phone, gender, faculty_department, country")
    .eq("id", targetUserId)
    .maybeSingle();

  if (!prof) return { ok: false, error: "not_found" };

  if (!canSeePersonal) {
    // Not authorized to see raw values — return masked forms only.
    return {
      ok: true,
      fullName: prof.full_name ?? null,
      email: maskEmail(prof.email) ?? null,
      phone: maskPhone(prof.phone) ?? null,
      gender: null,
      faculty: null,
      country: prof.country ?? null,
    };
  }

  await logAdminAction(identity.user!.id, "reveal_reader_contact", "profiles", targetUserId, {
    fields: ["phone", "email", "gender"],
  });

  return {
    ok: true,
    fullName: prof.full_name ?? null,
    email: prof.email ?? null,
    phone: prof.phone ?? null,
    gender: prof.gender ?? null,
    faculty: prof.faculty_department ?? null,
    country: prof.country ?? null,
  };
}
