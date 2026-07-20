import { useTranslations } from "next-intl";
import { Megaphone, CalendarClock, FileEdit, Bell, TrendingUp } from "lucide-react";
import type { AnnouncementMetrics as Metrics } from "@/lib/admin/announcements/query";

/** Server-safe (no "use client") — every value is real, computed server-side
 *  in lib/admin/announcements/query.ts with cheap `count: "exact", head: true`
 *  queries, never a full table scan. */
export default function AnnouncementMetricsCards({ metrics, error }: { metrics: Metrics | null; error?: boolean }) {
  const t = useTranslations("adminAnnouncements.metrics");

  const cards = [
    { key: "active", label: t("active"), value: metrics?.active, icon: Megaphone, tone: "success" as const, hint: t("activeHint") },
    { key: "scheduled", label: t("scheduled"), value: metrics?.scheduled, icon: CalendarClock, tone: "info" as const, hint: t("scheduledHint") },
    { key: "drafts", label: t("drafts"), value: metrics?.drafts, icon: FileEdit, tone: "neutral" as const, hint: t("draftsHint") },
    { key: "subscribers", label: t("subscribers"), value: metrics?.pushSubscribers, icon: Bell, tone: "brand" as const, hint: t("subscribersHint") },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {cards.map((c) => (
        <div key={c.key} className="rounded-xl border border-divider bg-bg-surface p-4" title={c.hint}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{c.label}</span>
            <c.icon className={`h-4 w-4 ${toneText(c.tone)}`} aria-hidden="true" />
          </div>
          {error ? (
            <p className="text-sm font-medium text-danger">{t("unavailable")}</p>
          ) : c.value === undefined ? (
            <div className="h-7 w-12 animate-pulse rounded bg-paper" aria-hidden="true" />
          ) : (
            <p className="text-2xl font-bold tabular-nums text-text-heading">{c.value}</p>
          )}
        </div>
      ))}

      <div className="rounded-xl border border-divider bg-bg-surface p-4" title={t("deliveryRateHint")}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{t("deliveryRate")}</span>
          <TrendingUp className="h-4 w-4 text-brand" aria-hidden="true" />
        </div>
        {error ? (
          <p className="text-sm font-medium text-danger">{t("unavailable")}</p>
        ) : !metrics ? (
          <div className="h-7 w-12 animate-pulse rounded bg-paper" aria-hidden="true" />
        ) : metrics.deliverySuccessRate === null ? (
          <p className="text-sm text-text-muted">{t("noDeliveryData")}</p>
        ) : (
          <p className="text-2xl font-bold tabular-nums text-text-heading">
            {Math.round(metrics.deliverySuccessRate * 100)}%
            <span className="ml-1.5 text-xs font-normal text-text-muted">
              {t("deliveryAttempts", { count: metrics.deliveryAttempts })}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

function toneText(tone: "success" | "info" | "neutral" | "brand" | "danger"): string {
  switch (tone) {
    case "success": return "text-success";
    case "info": return "text-info";
    case "brand": return "text-brand";
    case "danger": return "text-danger";
    default: return "text-text-muted";
  }
}
