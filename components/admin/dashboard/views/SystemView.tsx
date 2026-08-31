import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import {
  HardDrive, Cpu, DatabaseBackup, FileCheck2, Activity, ShieldCheck, Wrench,
  CheckCircle2, AlertTriangle, AlertOctagon, CircleDashed, HelpCircle, Settings2, ShieldAlert, type LucideIcon,
} from "lucide-react";
import { getSystemData } from "@/lib/admin/intelligence";
import {
  adminActionLabelKey,
  groupConsecutiveActivity,
  isSensitiveAdminAction,
  type DashboardFilters,
} from "@/lib/admin/dashboard-shared";
import FreshnessLine from "../FreshnessLine";

type HealthStatus = "healthy" | "warning" | "critical" | "collecting" | "unknown" | "notConfigured";

/** One status class per health state; the chip, the card surface and the glyph
 *  all read their colours from it (`.dash-status--*`, admin.css), so this view
 *  cannot drift from the health ribbon on the Overview — which is exactly what
 *  had happened: `emerald-100/800` here vs `emerald-50/800` there vs
 *  `--ptec-success` in the insight panel, three greens for one meaning.
 *
 *  Colour is never the only signal — each state keeps a distinct icon shape and
 *  a text badge. */
const STATUS_CLASS: Record<HealthStatus, string> = {
  healthy: "dash-status--ok",
  warning: "dash-status--warn",
  critical: "dash-status--crit",
  collecting: "dash-status--info",
  unknown: "dash-status--neutral",
  // Deliberately neutral: "nobody wired this up yet" is a setup task, not a
  // detected failure — red/amber stays reserved for real staleness/errors.
  notConfigured: "dash-status--neutral",
};

const STATUS_ICON: Record<HealthStatus, LucideIcon> = {
  healthy: CheckCircle2,
  warning: AlertTriangle,
  critical: AlertOctagon,
  collecting: CircleDashed,
  unknown: HelpCircle,
  notConfigured: Settings2,
};

/** Actor initials for the activity timeline avatar. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Generic humaniser for audit actions without a translation ("entity.verb"
 *  → "verb entity"); the machine name stays available in the tooltip. */
function fallbackActionLabel(action: string): string {
  const a = action.toLowerCase();
  const dot = a.lastIndexOf(".");
  if (dot > 0) {
    const entity = a.slice(0, dot).replace(/[_-]+/g, " ");
    const verb = a.slice(dot + 1).replace(/[_-]+/g, " ");
    return `${verb} ${entity}`;
  }
  return a.replace(/[._-]+/g, " ");
}

/**
 * Operational visibility for ADMIN_ROLES only (gated by the page). Health
 * chips first, then compact operations facts and a human-readable activity
 * timeline — machine event names live in tooltips, never as primary text.
 */
export default async function SystemView({ filters }: { filters: DashboardFilters }) {
  const t = await getTranslations("adminDashboard.system");
  const locale = await getLocale();
  const nf = new Intl.NumberFormat(locale === "km" ? "km-KH" : "en-US");
  const df = new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-US", {
    timeZone: "Asia/Phnom_Penh",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const data = await getSystemData(filters);

  // ── Derived health statuses ──
  const storageStatus: HealthStatus = data.storage.collecting
    ? "collecting"
    : data.storage.zimaErrors > 0
      ? "critical"
      : "healthy";
  const aiStatus: HealthStatus =
    data.ai.total === 0
      ? "collecting"
      : data.ai.okRate !== null && data.ai.okRate < 80
        ? "warning"
        : "healthy";
  const filesStatus: HealthStatus =
    data.lastFileHealthCheckAt === null ? "unknown" : data.brokenFiles > 0 ? "critical" : "healthy";
  // ops_events empty ≠ backups failing — this app may simply not track them
  // yet, so that reads as a neutral setup task, never a red/amber alarm.
  const backupStatus: HealthStatus =
    data.backupAgeHours === null ? "notConfigured" : data.backupAgeHours > 30 ? "warning" : "healthy";
  const analyticsStatus: HealthStatus = "healthy"; // queried live per request

  const chips: { key: string; status: HealthStatus; icon: typeof Cpu; hint?: string }[] = [
    { key: "storage", status: storageStatus, icon: HardDrive },
    { key: "ai", status: aiStatus, icon: Cpu },
    { key: "files", status: filesStatus, icon: FileCheck2 },
    {
      key: "backup",
      status: backupStatus,
      icon: DatabaseBackup,
      hint: backupStatus === "notConfigured" ? t("backupSetupHint") : undefined,
    },
    { key: "analytics", status: analyticsStatus, icon: Activity },
  ];
  const fixLink =
    filesStatus === "critical" ? { href: data.brokenFilesHref, label: t("fixBrokenFiles") } : undefined;

  const card = "dash-card p-5";

  // Outer wrapper matches OverviewView's space-y-8 "zone" rhythm — the
  // dashboard-modernization audit's density item: this tab used to sit at
  // one flat space-y-5 level while Overview alone separated its zones with
  // extra air. Nested grids/cards below keep their own space-y-5/gap-5 —
  // that rhythm is WITHIN a zone, not between them, and stays unchanged.
  return (
    <div className="space-y-8">
      {/* ── Health summary ── */}
      <section aria-label={t("healthTitle")}>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {chips.map(({ key, status, icon: IconCmp, hint }) => {
            const StatusIcon = STATUS_ICON[status];
            return (
              /* A white card with a status CHIP, not a tinted card. Five
                 saturated tiles in a row made the whole strip read as an alert
                 even when every check was healthy; the state now lives in the
                 chip, where a glance can find it. */
              <div
                key={key}
                className={`${STATUS_CLASS[status]} dash-card flex items-start gap-2.5 p-4`}
              >
                <span className="dash-ico dash-ico--sm dash-ico--brand" aria-hidden="true">
                  <IconCmp className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="dash-truncate text-xs font-semibold text-text-body">{t(`health.${key}`)}</p>
                  <span className="dash-chip mt-1.5 text-xs font-bold">
                    <StatusIcon className="dash-mark h-3.5 w-3.5" aria-hidden="true" />
                    {t(`status.${status}`)}
                  </span>
                  {hint && <p className="dash-prose mt-1.5">{hint}</p>}
                  {key === "files" && fixLink && (
                    <Link
                      href={fixLink.href}
                      className="mt-1.5 block w-fit text-xs font-semibold text-brand hover:underline"
                    >
                      {fixLink.label} →
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* ── Operations ── */}
        <section aria-labelledby="ops-heading" className={card}>
          <div className="flex items-center gap-2.5">
            <span className="dash-ico dash-ico--brand dash-ico--md" aria-hidden="true">
              <Wrench className="h-[18px] w-[18px]" />
            </span>
            <h3 id="ops-heading" className="text-sm font-bold text-text-heading">
              {t("opsTitle")}
            </h3>
          </div>
          <dl className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2">
              <dt className="text-xs text-text-body">{t("brokenFiles")}</dt>
              <dd className={`text-sm font-bold tabular-nums ${data.brokenFiles > 0 ? "text-[var(--ptec-danger)]" : "text-text-heading"}`}>
                <Link href={data.brokenFilesHref} className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                  {nf.format(data.brokenFiles)}
                </Link>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2">
              <dt className="text-xs text-text-body">{t("lastFileCheck")}</dt>
              <dd className="text-xs font-semibold tabular-nums text-text-heading">
                {data.lastFileHealthCheckAt ? df.format(new Date(data.lastFileHealthCheckAt)) : t("never")}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2">
              <dt className="text-xs text-text-body">{t("backupAge")}</dt>
              <dd className={`text-sm font-bold tabular-nums ${data.backupAgeHours !== null && data.backupAgeHours > 30 ? "text-[var(--ptec-warning)]" : "text-text-heading"}`}>
                {data.backupAgeHours === null ? t("backupNotTracked") : t("hoursAgo", { hours: nf.format(data.backupAgeHours) })}
              </dd>
            </div>
            {!data.storage.collecting && (
              <>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2">
                  <dt className="text-xs text-text-body">{t("zimaErrors")}</dt>
                  <dd className={`text-sm font-bold tabular-nums ${data.storage.zimaErrors > 0 ? "text-[var(--ptec-danger)]" : "text-text-heading"}`}>
                    {nf.format(data.storage.zimaErrors)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2">
                  <dt className="text-xs text-text-body">{t("r2Fallbacks")}</dt>
                  <dd className="text-xs font-bold tabular-nums text-text-heading">
                    {nf.format(data.storage.r2Fallbacks)}
                    {data.storage.fallbackSharePct !== null && (
                      <span className="ms-1 text-xs font-normal text-text-muted">({data.storage.fallbackSharePct}%)</span>
                    )}
                  </dd>
                </div>
              </>
            )}
          </dl>
          {(data.storage.collecting || data.ai.total === 0) && (
            <p className="dash-status--info mt-2.5 rounded-lg bg-[var(--dash-status-bg)] px-3 py-2 text-xs text-[var(--dash-status-fg)]">
              {t("telemetryCollectingNote")}
            </p>
          )}
          {data.opsEvents.length > 0 && (
            <ul className="mt-2.5 space-y-1">
              {data.opsEvents.slice(0, 4).map((o, i) => (
                <li key={i} className="flex items-center gap-2 text-xs text-text-muted">
                  <span
                    className={`dash-dot ${
                      o.status === "ok"
                        ? "dash-status--ok"
                        : o.status === "warn"
                          ? "dash-status--warn"
                          : "dash-status--crit"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="uppercase">{o.status}</span>
                  <code className="font-mono">{o.kind}</code>
                  <span className="ms-auto tabular-nums">{df.format(new Date(o.createdAt))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Recent admin activity (human-readable) ── */}
        <section aria-labelledby="audit-heading" className={card}>
          <div className="flex items-center gap-2.5">
            <span className="dash-ico dash-ico--reader dash-ico--md" aria-hidden="true">
              <ShieldCheck className="h-[18px] w-[18px]" />
            </span>
            <h3 id="audit-heading" className="text-sm font-bold text-text-heading">{t("auditTitle")}</h3>
          </div>
          {data.recentAdminActions.length === 0 ? (
            <p className="mt-3 rounded-xl bg-paper px-3 py-5 text-center text-xs text-text-muted">{t("noAudit")}</p>
          ) : (
            <ol className="mt-3 space-y-0.5">
              {groupConsecutiveActivity(data.recentAdminActions).map((group, i) => {
                const a = group.head;
                const key = adminActionLabelKey(a.action);
                const label = key ? t(`activity.${key}`) : fallbackActionLabel(a.action);
                const sensitive = isSensitiveAdminAction(a.action);
                const rowBody = (
                  <>
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand ring-1 ring-inset ring-brand/10"
                      aria-hidden="true"
                    >
                      {initials(a.actor)}
                    </span>
                    <span className="min-w-0 flex-1 dash-truncate text-text-body">
                      <span className="font-semibold text-text-heading">{a.actor}</span> · {label}
                      {group.entries.length > 1 && (
                        <span className="ms-1 rounded-md bg-brand/10 px-1 py-px text-xs font-bold tabular-nums text-brand">
                          {t("groupTimes", { count: nf.format(group.entries.length) })}
                        </span>
                      )}
                      {sensitive && (
                        <span className="ms-1 inline-flex align-text-bottom" title={t("sensitiveAction")}>
                          <ShieldAlert className="dash-status--warn dash-mark h-3.5 w-3.5" aria-hidden="true" />
                          <span className="sr-only">{t("sensitiveAction")}</span>
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums text-xs text-text-muted">
                      {df.format(new Date(a.createdAt))}
                    </span>
                  </>
                );
                if (group.entries.length === 1) {
                  return (
                    <li
                      key={i}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-paper"
                      title={a.action}
                    >
                      {rowBody}
                    </li>
                  );
                }
                // Bulk run — one summary row, individual entries behind a toggle.
                return (
                  <li key={i} className="text-xs" title={a.action}>
                    <details>
                      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
                        {rowBody}
                      </summary>
                      <ol className="ms-[38px] space-y-0.5 border-s border-divider/70 ps-3">
                        {group.entries.map((entry, j) => (
                          <li key={j} className="flex items-center gap-2 py-0.5 text-xs text-text-muted">
                            <span className="min-w-0 flex-1 dash-truncate">{label}</span>
                            <span className="shrink-0 tabular-nums">{df.format(new Date(entry.createdAt))}</span>
                          </li>
                        ))}
                      </ol>
                    </details>
                  </li>
                );
              })}
            </ol>
          )}
          <Link
            href="/admin/logs"
            className="mt-2.5 inline-block text-xs font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {t("allLogs")}
          </Link>
        </section>
      </div>

      <FreshnessLine generatedAt={data.generatedAt} />
    </div>
  );
}
