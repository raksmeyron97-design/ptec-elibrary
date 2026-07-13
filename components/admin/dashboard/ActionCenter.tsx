import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { AlertOctagon, AlertTriangle, Clock, Info, CheckCircle2, ChevronRight, ListChecks } from "lucide-react";
import type { ActionCenterData, ActionItem, ActionSeverity } from "@/lib/admin/intelligence";

const SEVERITY_STYLE: Record<
  ActionSeverity,
  { icon: typeof Info; iconColor: string; tile: string; rail: string }
> = {
  critical: { icon: AlertOctagon, iconColor: "text-rose-600", tile: "bg-rose-50 text-rose-600 ring-rose-100", rail: "dash-sev--critical" },
  warning: { icon: AlertTriangle, iconColor: "text-amber-600", tile: "bg-amber-50 text-amber-600 ring-amber-100", rail: "dash-sev--warning" },
  pending: { icon: Clock, iconColor: "text-sky-600", tile: "bg-sky-50 text-sky-600 ring-sky-100", rail: "dash-sev--pending" },
  info: { icon: Info, iconColor: "text-slate-400", tile: "bg-slate-50 text-slate-500 ring-slate-100", rail: "dash-sev--info" },
};

function ageDays(iso: string | null, now: number): number | null {
  if (!iso) return null;
  return Math.floor((now - new Date(iso).getTime()) / 86_400_000);
}

/**
 * Compact, decision-oriented queue: the most urgent items (severity-ordered,
 * capped) with one clear destination each; the rest behind "view all";
 * healthy checks reduced to a one-line footer. Severity is conveyed by icon
 * shape + sr-only text, not colour alone.
 */
export default async function ActionCenter({
  data,
  maxVisible = 4,
}: {
  data: ActionCenterData;
  maxVisible?: number;
}) {
  const t = await getTranslations("adminDashboard.actionCenter");
  const locale = await getLocale();
  const nf = new Intl.NumberFormat(locale === "km" ? "km-KH" : "en-US");
  const now = new Date(data.generatedAt).getTime();

  const visible = data.items.slice(0, maxVisible);
  const overflow = data.items.slice(maxVisible);
  const criticalCount = data.items.filter((i) => i.severity === "critical").length;

  const renderItem = (item: ActionItem) => {
    const style = SEVERITY_STYLE[item.severity];
    const IconCmp = style.icon;
    const days = ageDays(item.oldestAt, now);
    return (
      <li key={item.key} className={`dash-sev ${style.rail}`}>
        <Link
          href={item.href}
          className="group flex items-center gap-2.5 rounded-xl py-2 ps-3.5 pe-2 transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
        >
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${style.tile}`} aria-hidden="true">
            <IconCmp className="h-3.5 w-3.5" />
          </span>
          <span className="sr-only">{t(`severity.${item.severity}`)}:</span>
          <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-4 text-text-body">
            {t(`items.${item.key}`, { count: item.count })}
            {days !== null && days > 0 && (
              <span className="ms-1 text-[11px] text-text-muted">· {t("oldest", { days: nf.format(days) })}</span>
            )}
          </span>
          <ChevronRight
            className="h-3.5 w-3.5 shrink-0 text-text-muted/60 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      </li>
    );
  };

  return (
    <section aria-labelledby="action-center-heading" className="dash-card flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="dash-ico dash-ico--md dash-ico--brand" aria-hidden="true">
            <ListChecks className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h3 id="action-center-heading" className="text-[14px] font-bold text-text-heading">
              {t("title")}
            </h3>
            {data.items.length > 0 && (
              <p className="text-[11px] text-text-muted">
                {t("summary", { count: data.items.length })}
                {criticalCount > 0 && (
                  <span className="ms-1.5 inline-flex items-center rounded-md bg-rose-100 px-1.5 py-px text-[10px] font-bold text-rose-700">
                    {t("criticalCount", { count: criticalCount })}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {data.items.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-3 text-[12.5px] font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-100">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("allClear")}
        </p>
      ) : (
        <>
          <ul className="mt-3 flex-1 space-y-1">{visible.map(renderItem)}</ul>
          {overflow.length > 0 && (
            <details className="mt-1.5">
              <summary className="cursor-pointer rounded-md px-2 py-1 text-[11.5px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
                {t("viewAll", { count: overflow.length })}
              </summary>
              <ul className="mt-1.5 space-y-1">{overflow.map(renderItem)}</ul>
            </details>
          )}
        </>
      )}

      {data.passedKeys.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 border-t border-divider/70 pt-2.5 text-[11px] text-text-muted">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
          {t("passed", { count: data.passedKeys.length })}
        </p>
      )}
    </section>
  );
}
