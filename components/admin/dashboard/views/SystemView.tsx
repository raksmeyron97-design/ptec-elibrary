import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import {
  HardDrive, Cpu, DatabaseBackup, FileCheck2, Activity, ShieldCheck, Wrench,
  CheckCircle2, AlertTriangle, AlertOctagon, CircleDashed, HelpCircle, type LucideIcon,
} from "lucide-react";
import { getSystemData } from "@/lib/admin/intelligence";
import { adminActionLabelKey, type DashboardFilters } from "@/lib/admin/dashboard-shared";
import FreshnessLine from "../FreshnessLine";

type HealthStatus = "healthy" | "warning" | "critical" | "collecting" | "unknown";

const STATUS_STYLE: Record<HealthStatus, string> = {
  healthy: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  critical: "bg-rose-100 text-rose-700",
  collecting: "bg-sky-100 text-sky-800",
  unknown: "bg-slate-100 text-slate-600",
};

/** Card-level tonal surface + status glyph per health state (colour is never
 *  the only signal — each state has a distinct icon shape and a text badge). */
const STATUS_CARD: Record<HealthStatus, { surface: string; icon: LucideIcon; iconColor: string }> = {
  healthy: { surface: "border-emerald-100 bg-emerald-50/60", icon: CheckCircle2, iconColor: "text-emerald-600" },
  warning: { surface: "border-amber-100 bg-amber-50/60", icon: AlertTriangle, iconColor: "text-amber-600" },
  critical: { surface: "border-rose-100 bg-rose-50/60", icon: AlertOctagon, iconColor: "text-rose-600" },
  collecting: { surface: "border-sky-100 bg-sky-50/60", icon: CircleDashed, iconColor: "text-sky-600" },
  unknown: { surface: "border-slate-200 bg-slate-50/70", icon: HelpCircle, iconColor: "text-slate-400" },
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
  // ops_events empty ≠ backups failing — this app may simply not track them yet.
  const backupStatus: HealthStatus =
    data.backupAgeHours === null ? "unknown" : data.backupAgeHours > 30 ? "warning" : "healthy";
  const analyticsStatus: HealthStatus = "healthy"; // queried live per request

  const chips: { key: string; status: HealthStatus; icon: typeof Cpu }[] = [
    { key: "storage", status: storageStatus, icon: HardDrive },
    { key: "ai", status: aiStatus, icon: Cpu },
    { key: "files", status: filesStatus, icon: FileCheck2 },
    { key: "backup", status: backupStatus, icon: DatabaseBackup },
    { key: "analytics", status: analyticsStatus, icon: Activity },
  ];

  const card = "dash-card p-4";

  return (
    <div className="space-y-4">
      {/* ── Health summary ── */}
      <section aria-label={t("healthTitle")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {chips.map(({ key, status, icon: IconCmp }) => {
            const card = STATUS_CARD[status];
            const StatusIcon = card.icon;
            return (
              <div key={key} className={`flex items-start gap-2.5 rounded-2xl border px-3 py-2.5 shadow-[var(--dash-elev-1)] ${card.surface}`}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/80 shadow-sm ring-1 ring-inset ring-black/[0.04]" aria-hidden="true">
                  <IconCmp className="h-4 w-4 text-text-muted" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] font-semibold text-text-body">{t(`health.${key}`)}</p>
                  <span className={`mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${STATUS_STYLE[status]}`}>
                    <StatusIcon className={`h-3 w-3 ${card.iconColor}`} aria-hidden="true" />
                    {t(`status.${status}`)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* ── Operations ── */}
        <section aria-labelledby="ops-heading" className={card}>
          <div className="flex items-center gap-2.5">
            <span className="dash-ico dash-ico--brand dash-ico--md" aria-hidden="true">
              <Wrench className="h-[18px] w-[18px]" />
            </span>
            <h3 id="ops-heading" className="text-[14px] font-bold text-text-heading">
              {t("opsTitle")}
            </h3>
          </div>
          <dl className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2">
              <dt className="text-[12px] text-text-body">{t("brokenFiles")}</dt>
              <dd className={`text-[12.5px] font-bold tabular-nums ${data.brokenFiles > 0 ? "text-rose-700" : "text-text-heading"}`}>
                <Link href="/admin/data-quality" className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                  {nf.format(data.brokenFiles)}
                </Link>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2">
              <dt className="text-[12px] text-text-body">{t("lastFileCheck")}</dt>
              <dd className="text-[12.5px] font-semibold tabular-nums text-text-heading">
                {data.lastFileHealthCheckAt ? df.format(new Date(data.lastFileHealthCheckAt)) : t("never")}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2">
              <dt className="text-[12px] text-text-body">{t("backupAge")}</dt>
              <dd className={`text-[12.5px] font-bold tabular-nums ${data.backupAgeHours !== null && data.backupAgeHours > 30 ? "text-amber-700" : "text-text-heading"}`}>
                {data.backupAgeHours === null ? t("backupNotTracked") : t("hoursAgo", { hours: nf.format(data.backupAgeHours) })}
              </dd>
            </div>
            {!data.storage.collecting && (
              <>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2">
                  <dt className="text-[12px] text-text-body">{t("zimaErrors")}</dt>
                  <dd className={`text-[12.5px] font-bold tabular-nums ${data.storage.zimaErrors > 0 ? "text-rose-700" : "text-text-heading"}`}>
                    {nf.format(data.storage.zimaErrors)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2">
                  <dt className="text-[12px] text-text-body">{t("r2Fallbacks")}</dt>
                  <dd className="text-[12.5px] font-bold tabular-nums text-text-heading">
                    {nf.format(data.storage.r2Fallbacks)}
                    {data.storage.fallbackSharePct !== null && (
                      <span className="ms-1 text-[11px] font-normal text-text-muted">({data.storage.fallbackSharePct}%)</span>
                    )}
                  </dd>
                </div>
              </>
            )}
          </dl>
          {(data.storage.collecting || data.ai.total === 0) && (
            <p className="mt-2.5 rounded-lg bg-sky-50 px-3 py-2 text-[11px] text-sky-900">{t("telemetryCollectingNote")}</p>
          )}
          {data.opsEvents.length > 0 && (
            <ul className="mt-2.5 space-y-1">
              {data.opsEvents.slice(0, 4).map((o, i) => (
                <li key={i} className="flex items-center gap-2 text-[11px] text-text-muted">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      o.status === "ok" ? "bg-emerald-500" : o.status === "warn" ? "bg-amber-500" : "bg-rose-500"
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
            <h3 id="audit-heading" className="text-[14px] font-bold text-text-heading">{t("auditTitle")}</h3>
          </div>
          {data.recentAdminActions.length === 0 ? (
            <p className="mt-3 rounded-xl bg-paper px-3 py-5 text-center text-[12px] text-text-muted">{t("noAudit")}</p>
          ) : (
            <ol className="mt-3 space-y-0.5">
              {data.recentAdminActions.map((a, i) => {
                const key = adminActionLabelKey(a.action);
                const label = key ? t(`activity.${key}`) : fallbackActionLabel(a.action);
                return (
                  <li
                    key={i}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12px] transition-colors hover:bg-paper"
                    title={a.action}
                  >
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand/10 text-[10px] font-bold text-brand ring-1 ring-inset ring-brand/10"
                      aria-hidden="true"
                    >
                      {initials(a.actor)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-text-body">
                      <span className="font-semibold text-text-heading">{a.actor}</span> · {label}
                    </span>
                    <span className="shrink-0 tabular-nums text-[10.5px] text-text-muted">
                      {df.format(new Date(a.createdAt))}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          <Link
            href="/admin/logs"
            className="mt-2.5 inline-block text-[11.5px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {t("allLogs")}
          </Link>
        </section>
      </div>

      <FreshnessLine generatedAt={data.generatedAt} />
    </div>
  );
}
