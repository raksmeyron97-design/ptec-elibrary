import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { BarChart3, Filter, TrendingUp } from "lucide-react";
import type { MetadataQualityTier } from "@/lib/admin/thesis-metadata-quality";
import type { FieldImpact, QualityReport } from "@/lib/admin/metadata-quality-report";

/** How many field bars to draw before the rest folds into "other gaps". */
const VISIBLE_FIELDS = 8;

/**
 * Tier is a STATE (how healthy is this record), not an identity, so it wears
 * the reserved status tokens rather than a categorical hue — and every segment
 * carries its label and count as text, so the colour is never the only thing
 * saying which is which.
 */
const TIER_COLOR: Record<MetadataQualityTier, string> = {
  complete: "var(--ptec-success)",
  good: "var(--ptec-series-views)",
  needs_review: "var(--ptec-amber)",
  incomplete: "var(--ptec-danger)",
};

function pct(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

/**
 * The analysis half of Data Quality: not "which records are broken" (the
 * repair queue below answers that) but "what is broken, across the whole
 * collection, and what should I fix first".
 *
 * Both charts are filter controls. Clicking a field or a tier scopes the
 * repair queue underneath to exactly that population, so the answer to "which
 * 47 records are missing a license?" is one click from the bar that says 47 —
 * a chart that only reports is a chart the reader has to act on somewhere
 * else.
 *
 * Server-rendered CSS bars rather than an SVG plot: every value is real text
 * in the DOM, so it is readable, selectable, translatable and reachable by a
 * screen reader without a table alternative bolted on beside it.
 */
export default async function MetadataAnalysis({
  report,
  activeField,
  activeTier,
  basePath,
  searchParams,
}: {
  report: QualityReport;
  activeField?: string;
  activeTier?: string;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  const t = await getTranslations("adminDataQuality");

  /** A filter link that toggles one facet and always resets to page 1. */
  const facetHref = (key: "field" | "tier", value: string, active: boolean): string => {
    const params = new URLSearchParams();
    for (const [name, current] of Object.entries(searchParams)) {
      if (current && name !== "page" && name !== key) params.set(name, current);
    }
    if (!active) params.set(key, value);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const fieldLabel = (field: { key: string; label: string }) =>
    t.has(`fields.${field.key}`) ? t(`fields.${field.key}`) : field.label;

  const visible = report.fields.slice(0, VISIBLE_FIELDS);
  const hidden = report.fields.slice(VISIBLE_FIELDS);
  const hiddenCount = hidden.reduce((sum, field) => sum + field.count, 0);
  // The bar encodes IMPACT, because impact is what the list is sorted by.
  // Drawing the record count instead put three equal-length bars in three
  // different rank positions (48 records missing a Description is worth 4.7
  // points, 48 missing a Category only 2.7) — a chart ordered by one variable
  // and drawn by another reads as broken, however correct both numbers are.
  //
  // Scaled against the largest bar rather than against a fixed 100: at a few
  // points of impact every bar would otherwise be a stub.
  const scale = Math.max(0.1, ...visible.map((field) => field.impact));
  const tierTotal = report.tiers.reduce((sum, tier) => sum + tier.count, 0);

  return (
    <section
      aria-labelledby="quality-analysis-title"
      className="rounded-2xl border border-divider bg-bg-surface shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider p-5">
        <div className="min-w-0">
          <h2 id="quality-analysis-title" className="flex items-center gap-2 text-[15px] font-bold text-text-heading">
            <BarChart3 className="h-4 w-4 text-brand" aria-hidden="true" />
            {t("analysis.title")}
          </h2>
          <p className="mt-1 max-w-2xl text-[12px] leading-5 text-text-muted">{t("analysis.subtitle")}</p>
        </div>
        {(activeField || activeTier) && (
          <Link
            href={basePath}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-divider px-2.5 py-1.5 text-[11.5px] font-semibold text-text-body transition hover:border-brand/40 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            {t("analysis.clearFilters")}
          </Link>
        )}
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)]">
        {/* ── Ranked field impact ─────────────────────────────────────── */}
        <div className="min-w-0">
          <h3 className="text-[12.5px] font-bold text-text-heading">{t("analysis.fieldsTitle")}</h3>
          <p className="mt-0.5 text-[11.5px] leading-4 text-text-muted">{t("analysis.fieldsHint")}</p>

          {visible.length === 0 ? (
            <p className="mt-4 rounded-xl bg-paper px-3 py-6 text-center text-[12px] text-text-muted">
              {t("analysis.fieldsEmpty")}
            </p>
          ) : (
            <ol className="mt-3 space-y-1">
              {visible.map((field) => {
                const active = activeField === field.key;
                return (
                  <li key={field.key}>
                    <Link
                      href={facetHref("field", field.key, active)}
                      aria-pressed={active}
                      className={`group grid grid-cols-[minmax(84px,1.1fr)_minmax(0,2.4fr)_auto] items-center gap-3 rounded-lg px-2 py-1.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                        active ? "bg-brand/[0.07]" : "hover:bg-paper"
                      }`}
                    >
                      <span className={`truncate text-[12px] ${active ? "font-bold text-brand" : "font-semibold text-text-body"}`}>
                        {fieldLabel(field)}
                      </span>
                      <span className="flex h-5 min-w-0 items-center" aria-hidden="true">
                        {/* Rounded at the data end, square at the baseline —
                            the bar grows from the label, so only the far end
                            is a value. */}
                        <span
                          className="h-2.5 rounded-e-[4px] transition-[width]"
                          style={{
                            width: `${Math.max(2, pct(field.impact, scale))}%`,
                            background: active ? "var(--ptec-brand)" : "var(--ptec-series-views)",
                            opacity: active ? 1 : 0.85,
                          }}
                        />
                      </span>
                      <span className="flex items-baseline justify-end gap-2 whitespace-nowrap">
                        <span className="w-[62px] text-end text-[12.5px] font-bold tabular-nums text-text-heading">
                          {t("analysis.impactPoints", { points: field.impact.toFixed(1) })}
                        </span>
                        {/* Bare number, no unit: the column header above says
                            what it counts, and a unit word here is the one
                            string in the row that would need re-measuring in
                            every language. */}
                        <span className="w-[34px] text-end text-[11px] tabular-nums text-text-muted">
                          {field.count}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}

          {hidden.length > 0 && (
            <p className="mt-2 px-2 text-[11px] text-text-muted">
              {t("analysis.fieldsMore", { count: hidden.length, records: hiddenCount })}
            </p>
          )}

          {visible.length > 0 && (
            <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-paper/70 px-3 py-2 text-[11.5px] leading-4 text-text-muted">
              <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
              {t("analysis.topFix", {
                field: fieldLabel(visible[0]),
                points: visible[0].impact.toFixed(1),
                percent: report.averageCompleteness,
                target: Math.min(100, Math.round(report.averageCompleteness + visible[0].impact)),
              })}
            </p>
          )}
        </div>

        {/* ── Tier distribution ───────────────────────────────────────── */}
        <div className="min-w-0">
          <h3 className="text-[12.5px] font-bold text-text-heading">{t("analysis.tiersTitle")}</h3>
          <p className="mt-0.5 text-[11.5px] leading-4 text-text-muted">
            {t("analysis.tiersHint", { count: report.scoredCount })}
          </p>

          <div
            className="mt-3 flex h-3 gap-px overflow-hidden rounded-full bg-paper"
            role="img"
            aria-label={report.tiers
              .map((tier) => t("analysis.tierAria", { label: t(`tier.${tier.tier}`), count: tier.count }))
              .join(", ")}
          >
            {report.tiers.map((tier) =>
              tier.count > 0 ? (
                <span
                  key={tier.tier}
                  style={{ width: `${pct(tier.count, tierTotal)}%`, background: TIER_COLOR[tier.tier] }}
                />
              ) : null,
            )}
          </div>

          <ul className="mt-3 space-y-1">
            {report.tiers.map((tier) => {
              const active = activeTier === tier.tier;
              return (
                <li key={tier.tier}>
                  <Link
                    href={facetHref("tier", tier.tier, active)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                      active ? "bg-brand/[0.07] font-bold text-brand" : "text-text-body hover:bg-paper"
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: TIER_COLOR[tier.tier] }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate">{t(`tier.${tier.tier}`)}</span>
                    <span className="tabular-nums font-semibold">{tier.count}</span>
                    <span className="w-10 text-end tabular-nums text-text-muted">
                      {Math.round(pct(tier.count, tierTotal))}%
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-divider pt-3">
            {([
              ["book", report.byType.book],
              ["research", report.byType.research],
            ] as const).map(([type, stats]) => (
              <div key={type}>
                <dt className="text-[10.5px] font-bold uppercase tracking-wider text-text-muted">
                  {type === "book" ? t("metrics.books") : t("metrics.theses")}
                </dt>
                <dd className="text-[16px] font-bold text-text-heading">
                  {stats.average}%
                  <span className="ms-1.5 text-[11px] font-normal tabular-nums text-text-muted">
                    {t("analysis.recordCount", { count: stats.count })}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}

export type { FieldImpact };
