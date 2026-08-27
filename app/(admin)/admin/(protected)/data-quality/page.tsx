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
  ShieldAlert,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  getMetadataQualityReport,
  getFileHealthSummary,
  getBrokenFiles,
  getResourceStatsReconciliation,
  getCanonicalBackfillReconciliation,
  getSeoHealth,
} from "@/app/actions/data-quality";
import {
  filterGaps,
  TIER_ORDER,
  type QualityRecordType,
} from "@/lib/admin/metadata-quality-report";
import type { MetadataQualityTier } from "@/lib/admin/thesis-metadata-quality";
import ResourceCountAudit from "@/components/admin/ResourceCountAudit";
import CanonicalBackfillAudit from "@/components/admin/CanonicalBackfillAudit";
import SeoHealthAudit from "@/components/admin/SeoHealthAudit";
import MetadataAnalysis from "@/components/admin/data-quality/MetadataAnalysis";
import RepairQueue from "@/components/admin/data-quality/RepairQueue";
import { PageHeader } from "@/components/admin/kit";

export const dynamic = "force-dynamic";

const BASE_PATH = "/admin/data-quality";
const DEFAULT_PAGE_SIZE = 15;
const PAGE_SIZES = [15, 30, 60];

type T = (key: string, values?: Record<string, string | number>) => string;

type SP = {
  page?: string;
  size?: string;
  type?: string;
  tier?: string;
  field?: string;
};

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

/**
 * A quiet divider naming the intent of the block below it, so the page reads
 * as three jobs rather than one long scroll: what state is the collection in,
 * what work is queued, and do the underlying numbers reconcile.
 */
function ZoneHeader({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
      <span className="h-3.5 w-[3px] shrink-0 rounded-full bg-accent" aria-hidden="true" />
      <p className="text-[10.5px] font-bold uppercase tracking-[0.11em] text-[var(--ptec-accent-text)]">{label}</p>
      <p className="text-[11.5px] leading-4 text-text-muted">{hint}</p>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail: string;
  /** Only the two counters that can represent outstanding work take a tone. */
  tone?: "neutral" | "warning" | "danger";
}) {
  const accent =
    tone === "danger" ? "var(--ptec-danger)" : tone === "warning" ? "var(--ptec-amber)" : "var(--ptec-series-views)";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent, opacity: 0.9 }} aria-hidden="true" />
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">{label}</p>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      {/* Proportional figures: a standalone value at 28px reads gappy with
          equal-width digits. Tabular is for columns that must align. */}
      <p className="mt-3 text-[28px] font-bold text-text-heading">{value}</p>
      <p className="mt-0.5 text-[11.5px] text-text-muted">{detail}</p>
    </div>
  );
}

export default async function DataQualityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [t, metadata, fileHealth, brokenFiles, resourceStats, backfill, seoHealth] = await Promise.all([
    getTranslations("adminDataQuality"),
    getMetadataQualityReport(),
    getFileHealthSummary(),
    getBrokenFiles(),
    getResourceStatsReconciliation(),
    getCanonicalBackfillReconciliation(),
    getSeoHealth(),
  ]);

  const report = metadata.report;

  // ── URL state ──────────────────────────────────────────────────────────
  const activeType: QualityRecordType | "all" =
    sp.type === "book" || sp.type === "research" ? sp.type : "all";
  const activeTier: MetadataQualityTier | "all" = TIER_ORDER.includes(sp.tier as MetadataQualityTier)
    ? (sp.tier as MetadataQualityTier)
    : "all";
  const activeField = report.fields.some((field) => field.key === sp.field) ? sp.field : undefined;
  const pageSize = PAGE_SIZES.includes(Number(sp.size)) ? Number(sp.size) : DEFAULT_PAGE_SIZE;

  const filtered = filterGaps(report.gaps, { type: activeType, tier: activeTier, field: activeField });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  // Clamp rather than 404: a filter change can shrink the set under the page
  // number already in the URL, and dropping the reader on an empty page there
  // looks like data loss.
  const page = Math.min(Math.max(1, Number(sp.page ?? "1") || 1), totalPages);
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  const activeFieldLabel = (() => {
    const field = report.fields.find((entry) => entry.key === activeField);
    if (!field) return undefined;
    return t.has(`fields.${field.key}`) ? t(`fields.${field.key}`) : field.label;
  })();

  const percent = (count: number) =>
    fileHealth.checkedFileCount > 0 ? (count / fileHealth.checkedFileCount) * 100 : 0;
  const urgentCount =
    brokenFiles.length + report.gaps.filter((gap) => gap.completeness < 50).length;
  const lastSweep = timeAgo(fileHealth.checkedAt, t);
  const searchParamsRecord = sp as Record<string, string | undefined>;

  return (
    <div className="w-full space-y-8">
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

      {!metadata.available && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-warning-text">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-[12.5px] font-semibold">{t("alert.title")}</p>
            <p className="mt-0.5 text-[11.5px]">{t("alert.body")}</p>
          </div>
        </div>
      )}

      {/* ── Zone 1 · State of the collection ──────────────────────────── */}
      <div className="space-y-4">
        <ZoneHeader label={t("zones.stateLabel")} hint={t("zones.stateHint")} />

        <section aria-labelledby="collection-health-title" className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
          <div className="grid lg:grid-cols-[1.25fr_1fr]">
            <div className="border-b border-divider p-5 lg:border-b-0 lg:border-r">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">{t("health.eyebrow")}</p>
                  <h2 id="collection-health-title" className="mt-1 text-[18px] font-bold text-text-heading">
                    {t("health.completeness", { percent: report.averageCompleteness })}
                  </h2>
                </div>
                <Sparkles className="h-5 w-5 text-accent" aria-hidden="true" />
              </div>
              <div
                className="mt-5 h-3 overflow-hidden rounded-full bg-paper"
                aria-label={t("health.barLabel", { percent: report.averageCompleteness })}
                role="img"
              >
                <div
                  className="h-full rounded-full transition-[width]"
                  style={{ width: `${report.averageCompleteness}%`, background: "var(--ptec-brand)" }}
                />
              </div>
              <div className="mt-3 flex flex-wrap justify-between gap-2 text-[11.5px] text-text-muted">
                <span>{t("health.needMeta", { count: report.gaps.length, total: report.scoredCount })}</span>
                <span>{t("health.complete", { count: report.completeCount })}</span>
              </div>
            </div>

            <div className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">{t("sweep.eyebrow")}</p>
                  <p className="mt-1 text-[14px] font-semibold text-text-heading">
                    {fileHealth.available
                      ? t("sweep.checked", { count: fileHealth.checkedFileCount })
                      : t("sweep.unavailable")}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[11.5px] text-text-muted">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> {lastSweep}
                </span>
              </div>
              {fileHealth.available && fileHealth.checkedFileCount > 0 ? (
                <>
                  <div
                    className="mt-5 flex h-3 gap-px overflow-hidden rounded-full bg-paper"
                    role="img"
                    aria-label={t("sweep.barLabel", {
                      healthy: fileHealth.healthyFileCount,
                      unknown: fileHealth.unknownFileCount,
                      broken: fileHealth.brokenFileCount,
                    })}
                  >
                    <div style={{ width: `${percent(fileHealth.healthyFileCount)}%`, background: "var(--ptec-success)" }} />
                    <div style={{ width: `${percent(fileHealth.unknownFileCount)}%`, background: "var(--ptec-amber)" }} />
                    <div style={{ width: `${percent(fileHealth.brokenFileCount)}%`, background: "var(--ptec-danger)" }} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <i className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--ptec-success)" }} />
                      {t("sweep.healthy", { count: fileHealth.healthyFileCount })}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <i className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--ptec-amber)" }} />
                      {t("sweep.unknown", { count: fileHealth.unknownFileCount })}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <i className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--ptec-danger)" }} />
                      {t("sweep.broken", { count: fileHealth.brokenFileCount })}
                    </span>
                  </div>
                </>
              ) : (
                <p className="mt-4 rounded-xl bg-paper px-3 py-2.5 text-[12px] leading-5 text-text-muted">
                  {fileHealth.available ? t("sweep.noBaseline") : t("sweep.applyMigration")}
                </p>
              )}
            </div>
          </div>
        </section>

        <section aria-label={t("metrics.aria")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<BookOpen className="h-4 w-4" />}
            label={t("metrics.books")}
            value={`${report.byType.book.average}%`}
            detail={t("metrics.publishedRecords", { count: report.byType.book.count })}
          />
          <MetricCard
            icon={<GraduationCap className="h-4 w-4" />}
            label={t("metrics.theses")}
            value={`${report.byType.research.average}%`}
            detail={t("metrics.publishedRecords", { count: report.byType.research.count })}
          />
          <MetricCard
            icon={<Wrench className="h-4 w-4" />}
            label={t("metrics.metadataQueue")}
            value={report.gaps.length}
            detail={t("metrics.needingEdits")}
            tone={report.gaps.length > 0 ? "warning" : "neutral"}
          />
          <MetricCard
            icon={<LinkIcon className="h-4 w-4" />}
            label={t("metrics.brokenLinks")}
            value={fileHealth.brokenFileCount}
            detail={t("metrics.lastSweep", { time: lastSweep })}
            tone={fileHealth.brokenFileCount > 0 ? "danger" : "neutral"}
          />
        </section>

        <MetadataAnalysis
          report={report}
          activeField={activeField}
          activeTier={activeTier === "all" ? undefined : activeTier}
          basePath={BASE_PATH}
          searchParams={searchParamsRecord}
        />
      </div>

      {/* ── Zone 2 · Work queued ──────────────────────────────────────── */}
      <div className="space-y-4">
        <ZoneHeader label={t("zones.repairLabel")} hint={t("zones.repairHint")} />

        <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <RepairQueue
            gaps={pageItems}
            totalGaps={filtered.length}
            page={page}
            pageSize={pageSize}
            activeType={activeType}
            activeTier={activeTier}
            activeField={activeField}
            activeFieldLabel={activeFieldLabel}
            basePath={BASE_PATH}
            searchParams={searchParamsRecord}
          />

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
                {fileHealth.available && fileHealth.checkedAt ? (
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
              <ul className="max-h-[640px] divide-y divide-divider overflow-y-auto">
                {brokenFiles.map((file) => (
                  <li key={`${file.recordType}-${file.recordId}-${file.field}`} className="p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 rounded-lg bg-danger/5 p-2 text-danger"><FileWarning className="h-4 w-4" aria-hidden="true" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-text-heading" dir="auto">{file.title ?? t("files.deleted")}</p>
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
      </div>

      {/* ── Zone 3 · Integrity checks ─────────────────────────────────────
          Diagnostics, not KPIs: do the public totals, the canonical backfill
          and the SEO metadata still reconcile with the records themselves?
          They sit last because they are consulted, not worked through. */}
      <div className="space-y-4">
        <ZoneHeader label={t("zones.integrityLabel")} hint={t("zones.integrityHint")} />

        {/* Keyed on the reconciliation timestamp: the panel seeds client state
            from this prop, so a fresh server fetch must remount it rather than
            leave the previous result on screen. */}
        <ResourceCountAudit key={resourceStats.reconciliation.checkedAt} initial={resourceStats} />
        <CanonicalBackfillAudit data={backfill} />
        <SeoHealthAudit data={seoHealth} />
      </div>
    </div>
  );
}
