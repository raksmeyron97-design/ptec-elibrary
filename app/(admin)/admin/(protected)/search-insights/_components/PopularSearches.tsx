import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import type { SearchAnalyticsTerm } from "@/app/actions/search-insights";

/**
 * Module scope, not a component-body closure: `Date.now()` inside a function
 * defined and called within render is flagged as impure by the purity lint.
 * Matches `timeAgo()` in `CommentsSection.tsx`.
 */
function lastSeenLabel(iso: string | undefined, relative: Intl.RelativeTimeFormat): string | null {
  if (!iso) return null;
  const days = Math.round((Date.parse(iso) - Date.now()) / 86_400_000);
  return Number.isFinite(days) ? relative.format(days, "day") : null;
}

/**
 * Ranked search terms.
 *
 * A ranked bar list rather than a plain list: the bar is scaled against the
 * top term, so the shape of demand (one dominant query vs a flat long tail)
 * is legible at a glance. One hue for every bar — the categories are nominal,
 * and colouring them by value would spend the identity channel re-encoding
 * the length the reader can already see.
 */
export default async function PopularSearches({
  items,
  totalSearches,
  viewAllHref,
  variant = "top",
}: {
  items: SearchAnalyticsTerm[];
  totalSearches: number;
  viewAllHref: string;
  /** "top" = successful searches, "zero" = searches that found nothing. */
  variant?: "top" | "zero";
}) {
  const [t, locale] = await Promise.all([
    getTranslations("adminSearchInsights.popular"),
    getLocale(),
  ]);
  const numberFormat = new Intl.NumberFormat(locale);
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const scale = Math.max(1, ...items.map((item) => item.count));
  const color = variant === "zero" ? "var(--ptec-danger)" : "var(--ptec-series-views)";

  return (
    <section
      aria-labelledby={`popular-${variant}-title`}
      className="rounded-2xl border border-divider bg-bg-surface shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider p-5">
        <div className="min-w-0">
          <h2 id={`popular-${variant}-title`} className="flex items-center gap-2 text-[15px] font-bold text-text-heading">
            <TrendingUp className="h-4 w-4" style={{ color }} aria-hidden="true" />
            {t(`${variant}Title`)}
          </h2>
          <p className="mt-1 text-[12px] text-text-muted">{t(`${variant}Subtitle`)}</p>
        </div>
        {items.length > 0 && (
          <Link
            href={viewAllHref}
            className="shrink-0 text-[11.5px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {t("viewAll")}
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-[13.5px] font-semibold text-text-heading">{t("emptyTitle")}</p>
          <p className="mt-1 text-[12px] text-text-muted">{t("emptyBody")}</p>
        </div>
      ) : (
        <ol className="divide-y divide-divider">
          {items.map((item, index) => {
            const share = totalSearches > 0 ? Math.round((item.count / totalSearches) * 1000) / 10 : 0;
            const seen = lastSeenLabel(item.lastSearchedAt, relative);
            return (
              <li key={item.term} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-2.5">
                <span className="text-[11px] font-bold tabular-nums text-text-muted">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-text-heading" dir="auto" title={item.term}>
                    {item.term}
                  </p>
                  <span className="mt-1 flex h-2 items-center" aria-hidden="true">
                    <span
                      className="h-1.5 rounded-e-[3px]"
                      style={{ width: `${Math.max(2, (item.count / scale) * 100)}%`, background: color, opacity: 0.85 }}
                    />
                  </span>
                  {seen && <p className="mt-1 text-[10.5px] text-text-muted">{t("lastSearched", { when: seen })}</p>}
                </div>
                <div className="text-end">
                  <p className="text-[13px] font-bold tabular-nums text-text-heading">{numberFormat.format(item.count)}</p>
                  <p className="text-[10.5px] tabular-nums text-text-muted">{t("share", { pct: share })}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
