import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileWarning,
  GraduationCap,
  LinkIcon,
  Pencil,
  ShieldAlert,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  getMetadataGaps,
  getDataQualitySummary,
  getBrokenFiles,
  getResourceStatsReconciliation,
} from "@/app/actions/data-quality";
import ResourceCountAudit from "@/components/admin/ResourceCountAudit";
import { PageHeader } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

type T = (key: string, values?: Record<string, string | number>) => string;

function completenessStyle(pct: number): string {
  if (pct >= 80) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (pct >= 50) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function timeAgo(iso: string | null, t: T): string {
  if (!iso) return t("time.never");
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return t("time.unknown");
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
  if (days === 0) return t("time.today");
  if (days === 1) return t("time.yesterday");
  if (days < 30) return t("time.daysAgo", { count: days });
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "UTC" });
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">{label}</p>
        <span className="text-brand">{icon}</span>
      </div>
      <p className="mt-3 text-[28px] font-bold tabular-nums text-text-heading">{value}</p>
      <p className="mt-0.5 text-[11.5px] text-text-muted">{detail}</p>
    </div>
  );
}

export default async function DataQualityPage() {
  const [t, summary, gaps, brokenFiles, resourceStats] = await Promise.all([
    getTranslations("adminDataQuality"),
    getDataQualitySummary(),
    getMetadataGaps(),
    getBrokenFiles(),
    getResourceStatsReconciliation(),
  ]);

  const totalRecords = summary.totalBooks + summary.totalTheses;
  const averageCompleteness = totalRecords > 0
    ? Math.round(
        (summary.avgBookCompleteness * summary.totalBooks
          + summary.avgThesisCompleteness * summary.totalTheses) / totalRecords,
      )
    : 100;
  const healthyFiles = Math.max(
    0,
    summary.checkedFileCount - summary.brokenFileCount - summary.unknownFileCount,
  );
  const percent = (count: number) => summary.checkedFileCount > 0
    ? (count / summary.checkedFileCount) * 100
    : 0;
  const urgentCount = brokenFiles.length + gaps.filter((gap) => gap.completeness < 50).length;
  const lastSweep = timeAgo(summary.fileHealthCheckedAt, t);

  return (
    <main className="mx-auto max-w-[1400px]">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
            urgentCount > 0
              ? "border-danger/25 bg-danger/5 text-danger"
              : "border-success/25 bg-success/5 text-success"
          }`}>
            {urgentCount > 0
              ? <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
            {urgentCount > 0 ? t("urgent", { count: urgentCount }) : t("noUrgent")}
          </div>
        }
      />

      {!summary.metadataAvailable && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-[12.5px] font-semibold">{t("alert.title")}</p>
            <p className="mt-0.5 text-[11.5px] text-amber-800">{t("alert.body")}</p>
          </div>
        </div>
      )}

      <section aria-labelledby="collection-health-title" className="mb-6 overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
        <div className="grid lg:grid-cols-[1.25fr_1fr]">
          <div className="border-b border-divider p-5 lg:border-b-0 lg:border-r">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{t("health.eyebrow")}</p>
                <h2 id="collection-health-title" className="mt-1 text-[18px] font-bold text-text-heading">
                  {t("health.completeness", { percent: averageCompleteness })}
                </h2>
              </div>
              <Sparkles className="h-5 w-5 text-amber-500" aria-hidden="true" />
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-paper" aria-label={t("health.barLabel", { percent: averageCompleteness })} role="img">
              <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${averageCompleteness}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2 text-[11.5px] text-text-muted">
              <span>{t("health.needMeta", { count: summary.metadataIssueCount, total: totalRecords })}</span>
              <span>{t("health.complete", { count: totalRecords - summary.metadataIssueCount })}</span>
            </div>
          </div>

          <div className="p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">{t("sweep.eyebrow")}</p>
                <p className="mt-1 text-[14px] font-semibold text-text-heading">
                  {summary.fileHealthAvailable
                    ? t("sweep.checked", { count: summary.checkedFileCount })
                    : t("sweep.unavailable")}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-text-muted">
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> {lastSweep}
              </span>
            </div>
            {summary.fileHealthAvailable && summary.checkedFileCount > 0 ? (
              <>
                <div
                  className="mt-5 flex h-3 overflow-hidden rounded-full bg-paper"
                  role="img"
                  aria-label={t("sweep.barLabel", { healthy: healthyFiles, unknown: summary.unknownFileCount, broken: summary.brokenFileCount })}
                >
                  <div className="bg-emerald-500" style={{ width: `${percent(healthyFiles)}%` }} />
                  <div className="bg-amber-400" style={{ width: `${percent(summary.unknownFileCount)}%` }} />
                  <div className="bg-rose-500" style={{ width: `${percent(summary.brokenFileCount)}%` }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-text-muted">
                  <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500" />{t("sweep.healthy", { count: healthyFiles })}</span>
                  <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-400" />{t("sweep.unknown", { count: summary.unknownFileCount })}</span>
                  <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-rose-500" />{t("sweep.broken", { count: summary.brokenFileCount })}</span>
                </div>
              </>
            ) : (
              <p className="mt-4 rounded-xl bg-paper px-3 py-2.5 text-[12px] leading-5 text-text-muted">
                {summary.fileHealthAvailable ? t("sweep.noBaseline") : t("sweep.applyMigration")}
              </p>
            )}
          </div>
        </div>
      </section>

      <section aria-label={t("metrics.aria")} className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<BookOpen className="h-4 w-4" />} label={t("metrics.books")} value={`${summary.avgBookCompleteness}%`} detail={t("metrics.publishedRecords", { count: summary.totalBooks })} />
        <MetricCard icon={<GraduationCap className="h-4 w-4" />} label={t("metrics.theses")} value={`${summary.avgThesisCompleteness}%`} detail={t("metrics.publishedRecords", { count: summary.totalTheses })} />
        <MetricCard icon={<Wrench className="h-4 w-4" />} label={t("metrics.metadataQueue")} value={summary.metadataIssueCount} detail={t("metrics.needingEdits")} />
        <MetricCard icon={<LinkIcon className="h-4 w-4" />} label={t("metrics.brokenLinks")} value={summary.brokenFileCount} detail={t("metrics.lastSweep", { time: lastSweep })} />
      </section>

      {/* Resource-count reconciliation: canonical public totals vs the cache
          vs the search index. Lives here rather than on the Overview because
          it is a data-integrity check, not a KPI. */}
      <div className="mb-8">
        {/* Keyed on the reconciliation timestamp: the panel seeds client state
            from this prop, so a fresh server fetch must remount it rather than
            leave the previous result on screen. */}
        <ResourceCountAudit
          key={resourceStats.reconciliation.checkedAt}
          initial={resourceStats}
        />
      </div>

      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <section aria-labelledby="metadata-gaps-title" className="rounded-2xl border border-divider bg-bg-surface shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider p-5">
            <div>
              <h2 id="metadata-gaps-title" className="text-[15px] font-bold text-text-heading">{t("gaps.title")}</h2>
              <p className="mt-1 text-[12px] text-text-muted">{t("gaps.subtitle")}</p>
            </div>
            {summary.metadataIssueCount > 0 && (
              <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-semibold text-text-muted">
                {t("gaps.showing", { shown: Math.min(gaps.length, 30), total: summary.metadataIssueCount })}
              </span>
            )}
          </div>

          {gaps.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <CheckCircle2 className="mx-auto h-7 w-7 text-success" aria-hidden="true" />
              <p className="mt-3 text-[14px] font-semibold text-text-heading">{t("gaps.completeTitle")}</p>
              <p className="mt-1 text-[12px] text-text-muted">{t("gaps.completeBody")}</p>
            </div>
          ) : (
            <ol className="divide-y divide-divider">
              {gaps.map((gap) => (
                <li key={`${gap.type}-${gap.id}`} className="group p-4 transition hover:bg-paper/60 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 shrink-0 rounded-lg border px-2 py-1 text-[11px] font-bold tabular-nums ${completenessStyle(gap.completeness)}`}>
                      {gap.completeness}%
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 truncate text-[13.5px] font-semibold text-text-heading">{gap.title}</p>
                        <span className="text-[10.5px] font-bold uppercase tracking-wider text-text-muted">
                          {gap.type === "book" ? t("gaps.typeBook") : t("gaps.typeThesis")}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {gap.missingFields.map((field) => (
                          <span key={field} className="rounded-md bg-paper px-2 py-1 text-[11px] text-text-muted">{field}</span>
                        ))}
                      </div>
                    </div>
                    <Link
                      href={gap.editUrl}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-body transition hover:border-brand/40 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      aria-label={t("gaps.editAria", { title: gap.title })}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> {t("gaps.edit")}
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside aria-labelledby="broken-files-title" className="rounded-2xl border border-divider bg-bg-surface shadow-sm">
          <div className="border-b border-divider p-5">
            <div className="flex items-center gap-2">
              <FileWarning className={`h-4 w-4 ${brokenFiles.length ? "text-danger" : "text-success"}`} aria-hidden="true" />
              <h2 id="broken-files-title" className="text-[15px] font-bold text-text-heading">{t("files.title")}</h2>
            </div>
            <p className="mt-1 text-[12px] text-text-muted">{t("files.subtitle")}</p>
          </div>

          {brokenFiles.length === 0 ? (
            <div className="px-5 py-10 text-center">
              {summary.fileHealthAvailable && summary.fileHealthCheckedAt ? (
                <>
                  <CheckCircle2 className="mx-auto h-7 w-7 text-success" aria-hidden="true" />
                  <p className="mt-3 text-[14px] font-semibold text-text-heading">{t("files.noneTitle")}</p>
                  <p className="mt-1 text-[12px] text-text-muted">{t("files.noneBody", { time: lastSweep })}</p>
                </>
              ) : (
                <>
                  <AlertTriangle className="mx-auto h-7 w-7 text-warning" aria-hidden="true" />
                  <p className="mt-3 text-[14px] font-semibold text-text-heading">{t("files.noBaselineTitle")}</p>
                  <p className="mt-1 text-[12px] leading-5 text-text-muted">{t("files.noBaselineBody")}</p>
                </>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-divider">
              {brokenFiles.map((file) => (
                <li key={`${file.recordType}-${file.recordId}-${file.field}`} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 rounded-lg bg-danger/5 p-2 text-danger"><FileWarning className="h-4 w-4" aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-text-heading">{file.title ?? t("files.deleted")}</p>
                      <p className="mt-0.5 text-[11.5px] text-danger">
                        {file.field === "file_url" ? t("files.pdf") : t("files.cover")} · {file.httpStatus ?? t("files.unreachable")}
                      </p>
                      <p className="mt-1 truncate text-[10.5px] text-text-muted" title={file.url}>{file.url}</p>
                      <Link href={file.editUrl} className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                        {t("files.repair")} <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-divider bg-paper/60 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">{t("files.refresh")}</p>
            <code className="mt-2 block overflow-x-auto rounded-lg border border-divider bg-bg-surface px-3 py-2 text-[10.5px] text-text-body">npx tsx scripts/check-file-health.ts</code>
          </div>
        </aside>
      </div>
    </main>
  );
}
