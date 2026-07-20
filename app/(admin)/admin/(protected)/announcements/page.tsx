import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, LayoutTemplate, Settings } from "lucide-react";
import { requirePermission, isAdminAuthError } from "@/lib/auth/requireAdmin";
import { getAdminIdentity } from "@/lib/auth/admin-identity";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/admin/kit";
import Pagination from "@/components/ui/core/Pagination";
import AnnouncementMetricsCards from "@/components/admin/announcements/AnnouncementMetrics";
import AnnouncementFilters from "@/components/admin/announcements/AnnouncementFilters";
import AnnouncementsDashboardClient from "@/components/admin/announcements/AnnouncementsDashboardClient";
import { AnnouncementEmptyState } from "@/components/admin/announcements/AnnouncementEmptyState";
import { queryAnnouncements, getAnnouncementMetrics, listAnnouncementCreators } from "@/lib/admin/announcements/query";
import { DEFAULT_FILTERS, type AnnouncementFiltersValue, type AnnouncementSort } from "@/lib/admin/announcements/shared";

export const metadata = { title: "Announcements — PTEC Admin" };

const PAGE_SIZE = 20;
const PERIODS = { "7d": 7, "30d": 30, "90d": 90 } as const;
type Period = keyof typeof PERIODS;

type SP = {
  q?: string;
  status?: string;
  channel?: string;
  priority?: string;
  audience?: string;
  creatorId?: string;
  langComplete?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  page?: string;
  period?: string;
};

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<SP> }) {
  try {
    await requirePermission("announcements", "read");
  } catch (err) {
    if (isAdminAuthError(err) && err.status === 403) redirect("/admin");
    throw err;
  }

  const [t, identity, sp] = await Promise.all([
    getTranslations("adminAnnouncements"),
    getAdminIdentity(),
    searchParams,
  ]);

  const canWrite = identity.isSuperAdmin || identity.role === "super_admin" || hasPermission(identity.perms, "announcements", "write");
  const canPush = identity.isSuperAdmin || identity.role === "super_admin" || hasPermission(identity.perms, "announcements_push", "write");

  const filters: AnnouncementFiltersValue = {
    q: sp.q ?? "",
    status: sp.status ?? DEFAULT_FILTERS.status,
    channel: sp.channel ?? DEFAULT_FILTERS.channel,
    priority: sp.priority ?? DEFAULT_FILTERS.priority,
    audience: sp.audience ?? DEFAULT_FILTERS.audience,
    creatorId: sp.creatorId ?? "",
    langComplete: sp.langComplete ?? DEFAULT_FILTERS.langComplete,
    dateFrom: sp.dateFrom ?? "",
    dateTo: sp.dateTo ?? "",
    sort: (sp.sort as AnnouncementSort) ?? DEFAULT_FILTERS.sort,
  };
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const period: Period = sp.period === "7d" || sp.period === "90d" ? sp.period : "30d";

  const rangeEnd = new Date();
  const rangeStart = new Date(rangeEnd.getTime() - PERIODS[period] * 86_400_000);

  let listResult: Awaited<ReturnType<typeof queryAnnouncements>> | null = null;
  let metrics: Awaited<ReturnType<typeof getAnnouncementMetrics>> | null = null;
  let creators: { id: string; name: string }[] = [];
  let loadError = false;

  try {
    [listResult, metrics, creators] = await Promise.all([
      queryAnnouncements(filters, page - 1, PAGE_SIZE),
      getAnnouncementMetrics(rangeStart.toISOString(), rangeEnd.toISOString()),
      listAnnouncementCreators(),
    ]);
  } catch {
    loadError = true;
  }

  const hasActiveFilters = Boolean(
    filters.q || filters.status !== "all" || filters.channel !== "all" || filters.priority !== "all" ||
    filters.audience !== "all" || filters.creatorId || filters.langComplete !== "all" || filters.dateFrom,
  );
  const hasAnyAnnouncementsAtAll = (listResult?.total ?? 0) > 0 || hasActiveFilters;

  return (
    <div>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Link
              href="/admin/announcements/templates"
              className="inline-flex items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-4 py-2 text-sm font-semibold text-text-body transition hover:bg-paper"
            >
              <LayoutTemplate className="h-4 w-4" /> {t("templatesAction")}
            </Link>
            {identity.role === "admin" || identity.role === "super_admin" || identity.isSuperAdmin ? (
              <Link
                href="/admin/system-settings"
                className="inline-flex items-center gap-1.5 rounded-xl border border-divider bg-bg-surface px-4 py-2 text-sm font-semibold text-text-body transition hover:bg-paper"
              >
                <Settings className="h-4 w-4" /> {t("settingsAction")}
              </Link>
            ) : null}
            {canWrite && (
              <Link
                href="/admin/announcements/new"
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-hover"
              >
                <Plus className="h-4 w-4" /> {t("newAction")}
              </Link>
            )}
          </>
        }
      />

      <div className="mb-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="sr-only">{t("metrics.heading")}</h2>
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-divider bg-bg-surface p-0.5 text-xs">
            {(Object.keys(PERIODS) as Period[]).map((p) => {
              const qs = new URLSearchParams(sp as Record<string, string>);
              qs.set("period", p);
              return (
                <Link
                  key={p}
                  href={`/admin/announcements?${qs.toString()}`}
                  className={`rounded-md px-2.5 py-1 font-semibold transition ${p === period ? "bg-brand text-white" : "text-text-muted hover:text-text-body"}`}
                >
                  {t(`metrics.period.${p}`)}
                </Link>
              );
            })}
          </div>
        </div>
        <AnnouncementMetricsCards metrics={metrics} error={loadError} />
      </div>

      {!canWrite && (
        <p className="mb-4 rounded-lg border border-info/30 bg-info/5 px-3 py-2 text-[12.5px] text-info">{t("readOnlyNotice")}</p>
      )}
      {canWrite && !canPush && (
        <p className="mb-4 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-[12.5px] text-warning">{t("noPushPermissionNotice")}</p>
      )}

      {loadError ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-center text-sm text-danger">{t("loadError")}</div>
      ) : !hasAnyAnnouncementsAtAll ? (
        <AnnouncementEmptyState />
      ) : (
        <>
          <div className="mb-4">
            <AnnouncementFilters value={filters} creators={creators} hasActiveFilters={hasActiveFilters} resultCount={listResult?.total ?? 0} />
          </div>
          <AnnouncementsDashboardClient rows={listResult?.rows ?? []} rowNumberOffset={(page - 1) * PAGE_SIZE} />
          <Pagination
            currentPage={page}
            totalPages={listResult?.totalPages ?? 1}
            totalItems={listResult?.total ?? 0}
            pageSize={PAGE_SIZE}
            searchParams={sp as Record<string, string | undefined>}
            basePath="/admin/announcements"
          />
        </>
      )}
    </div>
  );
}
