import { getLocale, getTranslations } from "next-intl/server";
import { Languages } from "lucide-react";

const SEGMENT_COLOR = {
  km: "var(--ptec-series-views)",
  en: "var(--ptec-series-visitors)",
  other: "var(--dash-ink-decorative)",
} as const;

/**
 * One segmented bar rather than three unrelated cards.
 *
 * The page previously rendered Khmer, English and Other as three separate
 * tiles with three separate progress bars, which is the one layout that makes
 * a part-to-whole relationship hard to see. Each segment still carries its
 * own label, count and percentage as text.
 */
export default async function LanguageDistribution({
  usage,
}: {
  usage: { km: number; en: number; other: number };
}) {
  const [t, locale] = await Promise.all([
    getTranslations("adminSearchInsights.language"),
    getLocale(),
  ]);
  const numberFormat = new Intl.NumberFormat(locale);
  const total = usage.km + usage.en + usage.other;
  const rows = (["km", "en", "other"] as const).map((key) => ({
    key,
    count: usage[key],
    pct: total > 0 ? Math.round((usage[key] / total) * 100) : 0,
  }));

  return (
    <section aria-labelledby="language-split-title" className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
      <h2 id="language-split-title" className="flex items-center gap-2 text-[15px] font-bold text-text-heading">
        <Languages className="h-4 w-4 text-brand" aria-hidden="true" />
        {t("title")}
      </h2>
      <p className="mt-1 text-[12px] text-text-muted">{t("subtitle")}</p>

      {total === 0 ? (
        <p className="mt-5 rounded-xl bg-paper px-4 py-6 text-center text-[12.5px] text-text-muted">{t("empty")}</p>
      ) : (
        <>
          <div
            className="mt-4 flex h-3 gap-px overflow-hidden rounded-full bg-paper"
            role="img"
            aria-label={rows.map((row) => t("aria", { language: t(row.key), pct: row.pct })).join(", ")}
          >
            {rows.map((row) =>
              row.count > 0 ? (
                <span key={row.key} style={{ width: `${row.pct}%`, background: SEGMENT_COLOR[row.key] }} />
              ) : null,
            )}
          </div>

          <dl className="mt-3.5 space-y-2">
            {rows.map((row) => (
              <div key={row.key} className="flex items-center gap-2 text-[12.5px]">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: SEGMENT_COLOR[row.key] }}
                  aria-hidden="true"
                />
                <dt className="min-w-0 flex-1 truncate text-text-body">{t(row.key)}</dt>
                <dd className="tabular-nums font-semibold text-text-heading">{numberFormat.format(row.count)}</dd>
                <dd className="w-10 text-end tabular-nums text-text-muted">{row.pct}%</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
