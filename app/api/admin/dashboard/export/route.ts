import { NextResponse, type NextRequest } from "next/server";
import { requireStaff, requireAdmin, isAdminAuthError } from "@/lib/auth/requireAdmin";
import { rateLimit } from "@/lib/rate-limit";
import { parseDashboardFilters } from "@/lib/admin/dashboard-shared";
import { buildDashboardExport } from "@/lib/admin/dashboard-export";
import { sheetsToCsv } from "@/lib/export/csv";
import { buildWorkbook } from "@/lib/export/xlsx";
import { EXPORT_MIME, exportFilename, parseExportFormat } from "@/lib/export/core";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dashboard/export?view=…&range=…&format=csv|xlsx
 *
 * Export of the active dashboard view, honouring the same validated filter
 * params as the page. format=xlsx returns a styled multi-sheet workbook
 * (lib/export/xlsx.ts); format=csv (default) returns BOM-prefixed RFC 4180
 * CSV. Auth: staff+ for overview/content/search/audience; ADMIN_ROLES for
 * system (same server-side gate as the view). Rate-limited per user; each
 * export is written to the admin audit log. String cells are
 * formula-injection-escaped (CSV) or written as pure data cells (XLSX).
 */
export async function GET(request: NextRequest) {
  try {
    const { userId, role } = await requireStaff();

    const { success } = await rateLimit(`dashboard-export:${userId}`, 10, 60_000);
    if (!success) {
      return NextResponse.json({ error: "Too many exports. Try again shortly." }, { status: 429 });
    }

    const sp = Object.fromEntries(request.nextUrl.searchParams);
    const filters = parseDashboardFilters(sp);
    const format = parseExportFormat(sp.format);

    if (filters.view === "system") {
      // Re-verify the stricter gate — requireAdmin throws 403 for staff/librarian.
      await requireAdmin();
    }

    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    const generatedBy = profile?.full_name ? `${profile.full_name} (${role})` : role;

    const bundle = await buildDashboardExport(filters, sp, generatedBy);

    const body: BodyInit =
      format === "xlsx"
        ? new Blob([new Uint8Array(await buildWorkbook(bundle.context, bundle.sheets)).buffer as ArrayBuffer])
        : sheetsToCsv(bundle.sheets);

    // Audit the export (privileged data leaving the system).
    await supabase.from("admin_audit_log").insert({
      admin_id: userId,
      action: "dashboard.export",
      target_table: "dashboard",
      metadata: { view: filters.view, range: filters.range, role, format, rows: bundle.recordCount },
    });

    return new NextResponse(body, {
      headers: {
        "Content-Type": EXPORT_MIME[format],
        "Content-Disposition": `attachment; filename="${exportFilename(bundle.baseName, format)}"`,
        "Cache-Control": "private, no-store",
        "X-Export-Rows": String(bundle.recordCount),
      },
    });
  } catch (error) {
    if (isAdminAuthError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[/api/admin/dashboard/export]", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
