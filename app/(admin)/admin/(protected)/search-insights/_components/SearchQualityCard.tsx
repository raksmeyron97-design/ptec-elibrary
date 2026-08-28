import { getTranslations } from "next-intl/server";
import { Gauge } from "lucide-react";
import type { SearchKpis } from "@/lib/admin/search-insights-shared";

/**
 * Three rates as meters. The fill carries the rate, the track is the same hue
 * at low alpha so the state reads across the whole bar rather than only where
 * it is filled — and each row prints its own number, so nothing depends on
 * reading a bar length.
 */
export default async function SearchQualityCard({ kpis }: { kpis: SearchKpis }) {
  const t = await getTranslations("adminSearchInsights.quality");

  const rows = [
    { key: "success", value: kpis.successRate, color: "var(--ptec-success)" },
    { key: "zero", value: kpis.zeroResultRate, color: "var(--ptec-danger)" },
    { key: "click", value: kpis.clickRate, color: "var(--ptec-series-views)" },
  ] as const;

  return (
    <section aria-labelledby="search-quality-title" className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
      <h2 id="search-quality-title" className="flex items-center gap-2 text-[15px] font-bold text-text-heading">
        <Gauge className="h-4 w-4 text-brand" aria-hidden="true" />
        {t("title")}
      </h2>
      <p className="mt-1 text-[12px] text-text-muted">{t("subtitle")}</p>

      <dl className="mt-4 space-y-3.5">
        {rows.map((row) => (
          <div key={row.key}>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[12.5px] font-semibold text-text-body">{t(`${row.key}Label`)}</dt>
              <dd className="text-[15px] font-bold tabular-nums text-text-heading">
                {row.value === null ? "—" : `${row.value}%`}
              </dd>
            </div>
            <div
              className="mt-1.5 h-2 overflow-hidden rounded-full"
              style={{ background: `color-mix(in srgb, ${row.color} 16%, transparent)` }}
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full transition-[width]"
                // A rate above 100 is possible for the click measure (several
                // clicks per search); the bar caps, the number does not lie.
                style={{ width: `${Math.min(100, Math.max(0, row.value ?? 0))}%`, background: row.color }}
              />
            </div>
            <p className="mt-1 text-[11px] leading-4 text-text-muted">{t(`${row.key}Hint`)}</p>
          </div>
        ))}
      </dl>

      {kpis.unmeasured > 0 && (
        <p className="mt-4 rounded-lg bg-paper px-3 py-2 text-[11px] leading-4 text-text-muted">
          {t("unmeasuredNote", { count: kpis.unmeasured })}
        </p>
      )}
    </section>
  );
}
