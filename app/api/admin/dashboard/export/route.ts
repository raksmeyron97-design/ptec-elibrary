import { NextResponse, type NextRequest } from "next/server";
import { requireStaff, requireAdmin, isAdminAuthError } from "@/lib/auth/requireAdmin";
import { rateLimit } from "@/lib/rate-limit";
import { parseDashboardFilters } from "@/lib/admin/dashboard-shared";
import {
  getOverviewData,
  getContentIntelligence,
  getSearchAiData,
  getAudienceData,
  getSystemData,
  CONTENT_PRESETS,
  type ContentPreset,
} from "@/lib/admin/intelligence";
import { toCsv, type CsvColumn } from "@/lib/admin/csv";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dashboard/export?view=…&range=…&…
 *
 * CSV export of the active dashboard view, honouring the same validated
 * filter params as the page. Auth: staff+ for overview/content/search/
 * audience; ADMIN_ROLES for system (same server-side gate as the view).
 * Rate-limited per user; each export is written to the admin audit log.
 * Cells are formula-injection-escaped (lib/admin/csv.ts).
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

    if (filters.view === "system") {
      // Re-verify the stricter gate — requireAdmin throws 403 for staff/librarian.
      await requireAdmin();
    }

    let csv: string;
    const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : v);

    switch (filters.view) {
      case "content": {
        const preset: ContentPreset = (CONTENT_PRESETS as readonly string[]).includes(sp.preset ?? "")
          ? (sp.preset as ContentPreset)
          : "top";
        // Export every matching row (not just the visible page) — the whole
        // catalog is a few hundred records.
        const all = await getContentIntelligence(filters, { page: 1, preset, pageSize: 10000 });
        const rowsAll = all.rows;
        const cols: CsvColumn<(typeof rowsAll)[number]>[] = [
          { key: "title", header: "Title", value: (r) => r.title },
          { key: "type", header: "Type", value: (r) => r.type },
          { key: "department", header: "Department", value: (r) => r.department },
          { key: "language", header: "Language", value: (r) => r.language },
          { key: "published", header: "Published", value: (r) => (r.published ? "yes" : "no") },
          { key: "views", header: "Views (period)", value: (r) => r.views },
          { key: "uniqueViewers", header: "Unique viewers", value: (r) => r.uniqueViewers },
          { key: "readerOpens", header: "Reader opens", value: (r) => r.readerOpens },
          { key: "downloads", header: "Downloads", value: (r) => r.downloads },
          { key: "conversionPct", header: "Conversion %", value: (r) => num(r.conversionPct) },
          { key: "delta", header: "Views delta vs prev", value: (r) => r.delta },
          { key: "lifetimeViews", header: "Lifetime views", value: (r) => r.lifetimeViews },
          { key: "completeness", header: "Metadata %", value: (r) => r.completeness },
          { key: "updatedAt", header: "Updated", value: (r) => r.updatedAt },
        ];
        csv = toCsv(rowsAll, cols);
        break;
      }
      case "search": {
        const data = await getSearchAiData(filters);
        const rows = [
          { metric: "Total searches", value: data.search.total },
          { metric: "Previous period searches", value: data.search.previousTotal },
          { metric: "Search sessions", value: num(data.search.sessions) },
          { metric: "Click-through rate %", value: num(data.search.ctr) },
          { metric: "Zero-result rate %", value: num(data.search.zeroRate) },
          { metric: "Average results", value: num(data.search.avgResults) },
          { metric: "Khmer share %", value: num(data.search.kmSharePct) },
          { metric: "AI requests", value: data.ai.total },
          { metric: "AI success rate %", value: num(data.ai.okRate) },
          { metric: "AI avg latency ms", value: num(data.ai.avgLatencyMs) },
          { metric: "AI quota hits", value: data.ai.quotaHits },
        ];
        // Metric summary block, then the consolidated query table beneath.
        const queryCols: CsvColumn<(typeof data.search.queryTable)[number]>[] = [
          { key: "term", header: "Query", value: (r) => r.term },
          { key: "lang", header: "Language", value: (r) => r.lang },
          { key: "searches", header: "Searches", value: (r) => r.searches },
          { key: "prevSearches", header: "Previous period", value: (r) => r.prevSearches },
          { key: "avgResults", header: "Avg results", value: (r) => num(r.avgResults) },
          { key: "clicks", header: "Clicks", value: (r) => r.clicks },
          { key: "ctrPct", header: "CTR %", value: (r) => num(r.ctrPct) },
          { key: "zero", header: "Zero result", value: (r) => (r.zero ? "yes" : "no") },
          { key: "suspectedTest", header: "Suspected test", value: (r) => (r.suspectedTest ? "yes" : "no") },
        ];
        csv =
          toCsv(rows, [
            { key: "metric", header: "Metric", value: (r) => r.metric },
            { key: "value", header: "Value", value: (r) => r.value },
          ]) +
          "\r\n" +
          toCsv(data.search.queryTable, queryCols);
        break;
      }
      case "audience": {
        const data = await getAudienceData(filters);
        const rows = [
          { metric: "New registrations", value: data.registrations.total },
          { metric: "Registered users (total)", value: data.totalUsers },
          { metric: "Active signed-in users", value: data.activeUsers.current },
          { metric: "Active signed-in users (previous)", value: data.activeUsers.previous },
          { metric: "Returning users", value: data.returningUsers },
          { metric: "Signed-in detail views", value: data.signedInViews },
          { metric: "Anonymous detail views", value: data.anonymousViews },
          { metric: "Views (English UI)", value: data.localeSplit.en },
          { metric: "Views (Khmer UI)", value: data.localeSplit.km },
          { metric: "Views (locale untracked)", value: data.localeSplit.unknown },
        ];
        csv = toCsv(rows, [
          { key: "metric", header: "Metric", value: (r) => r.metric },
          { key: "value", header: "Value", value: (r) => r.value },
        ]);
        break;
      }
      case "system": {
        const data = await getSystemData(filters);
        const rows = data.appEvents.map((e) => ({
          kind: e.kind,
          total: e.total,
          ok: e.ok,
          errors: e.errors,
          fallbacks: e.fallbacks,
          avgLatencyMs: num(e.avgLatencyMs),
        }));
        csv = toCsv(rows, [
          { key: "kind", header: "Event kind", value: (r) => r.kind },
          { key: "total", header: "Total", value: (r) => r.total },
          { key: "ok", header: "OK", value: (r) => r.ok },
          { key: "errors", header: "Errors", value: (r) => r.errors },
          { key: "fallbacks", header: "Fallbacks", value: (r) => r.fallbacks },
          { key: "avgLatencyMs", header: "Avg latency ms", value: (r) => r.avgLatencyMs },
        ]);
        break;
      }
      default: {
        const data = await getOverviewData(filters);
        const rows = data.engagement.series.views.map((p, i) => ({
          date: p.date,
          views: p.value,
          visitors: data.engagement.series.visitors[i]?.value ?? 0,
          readerOpens: data.engagement.series.readerOpens?.[i]?.value ?? "",
          downloads: data.engagement.series.downloads[i]?.value ?? 0,
        }));
        csv = toCsv(rows, [
          { key: "date", header: "Date", value: (r) => r.date },
          { key: "views", header: "Content detail views", value: (r) => r.views },
          { key: "visitors", header: "Unique visitors", value: (r) => r.visitors },
          { key: "readerOpens", header: "Reader opens", value: (r) => r.readerOpens },
          { key: "downloads", header: "Downloads", value: (r) => r.downloads },
        ]);
      }
    }

    // Audit the export (privileged data leaving the system).
    const supabase = createServiceClient();
    await supabase.from("admin_audit_log").insert({
      admin_id: userId,
      action: "dashboard.export",
      target_table: "dashboard",
      metadata: { view: filters.view, range: filters.range, role },
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ptec-dashboard-${filters.view}-${stamp}.csv"`,
        "Cache-Control": "private, no-store",
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
