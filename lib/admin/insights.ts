// Deterministic dashboard insights. Pure module (unit-tested) — every rule
// is an explainable threshold over verified aggregates; nothing here guesses
// or calls an LLM. Each insight carries an i18n key + numeric params, so the
// UI renders localized text, and a link target so it is actionable.
//
// Honesty guards: rules require minimum sample sizes (no "+300%" drama from
// 1 → 4), and produce nothing when the data is insufficient.

export type InsightSeverity = "positive" | "warning" | "info";

export type Insight = {
  /** i18n key under adminDashboard.insights.* */
  key:
    | "viewsUpConversionDown"
    | "zeroResultRepeats"
    | "newContentNoViews"
    | "deptDemandLowCoverage"
    | "storageFailuresUp"
    | "khmerSearchGrowth";
  severity: InsightSeverity;
  /** Numeric/string params interpolated into the i18n message. */
  params: Record<string, string | number>;
  /** Dashboard/admin link that shows the underlying data. */
  href: string;
};

export type InsightInputs = {
  /** Period + previous-period engagement volumes. */
  views: { current: number; previous: number };
  readerOpens: { current: number; previous: number };
  /** Distinct zero-result terms searched ≥3 times this period. */
  repeatedZeroResultTerms: number;
  /** Resources published during the period that recorded zero views. */
  newContentWithoutViews: number;
  /** Per-department demand vs coverage (already normalised). */
  departments: { name: string; resources: number; viewsPerResource: number | null }[];
  /** Storage operation failures (app_events). */
  storageErrors: { current: number; previous: number };
  /** Khmer share of searches (0–100), null when volume is too small. */
  khmerSearchShare: { current: number | null; previous: number | null; total: number };
  /** Query-string suffix reproducing the active period (e.g. "range=30d"). */
  periodQuery: string;
};

const MIN_ENGAGEMENT_SAMPLE = 20;
const MIN_SEARCH_SAMPLE = 20;

export function generateInsights(input: InsightInputs): Insight[] {
  const out: Insight[] = [];
  const q = input.periodQuery ? `&${input.periodQuery}` : "";

  // Views rising while reader-open conversion falls → discovery outpaces reading.
  {
    const { views, readerOpens } = input;
    if (
      views.previous >= MIN_ENGAGEMENT_SAMPLE &&
      views.current >= MIN_ENGAGEMENT_SAMPLE &&
      readerOpens.previous > 0
    ) {
      const viewsGrowth = (views.current - views.previous) / views.previous;
      const convNow = readerOpens.current / views.current;
      const convPrev = readerOpens.previous / views.previous;
      if (viewsGrowth >= 0.2 && convPrev > 0 && convNow <= convPrev * 0.9) {
        out.push({
          key: "viewsUpConversionDown",
          severity: "warning",
          params: {
            viewsGrowthPct: Math.round(viewsGrowth * 100),
            convNowPct: Math.round(convNow * 100),
            convPrevPct: Math.round(convPrev * 100),
          },
          href: `/admin?view=overview${q}`,
        });
      }
    }
  }

  if (input.repeatedZeroResultTerms >= 3) {
    out.push({
      key: "zeroResultRepeats",
      severity: "warning",
      params: { terms: input.repeatedZeroResultTerms },
      href: "/admin/search-insights",
    });
  }

  if (input.newContentWithoutViews >= 3) {
    out.push({
      key: "newContentNoViews",
      severity: "info",
      params: { count: input.newContentWithoutViews },
      href: `/admin?view=content&preset=neverViewed${q}`,
    });
  }

  // High demand per resource + small collection → acquisition opportunity.
  {
    const depts = input.departments.filter((d) => d.viewsPerResource !== null && d.resources > 0);
    if (depts.length >= 3) {
      const sortedVpr = [...depts].map((d) => d.viewsPerResource as number).sort((a, b) => a - b);
      const sortedRes = [...depts].map((d) => d.resources).sort((a, b) => a - b);
      const medianVpr = sortedVpr[Math.floor(sortedVpr.length / 2)];
      const medianRes = sortedRes[Math.floor(sortedRes.length / 2)];
      if (medianVpr > 0) {
        const hot = depts.find(
          (d) =>
            (d.viewsPerResource as number) >= medianVpr * 2 &&
            d.resources < medianRes &&
            (d.viewsPerResource as number) >= 3,
        );
        if (hot) {
          out.push({
            key: "deptDemandLowCoverage",
            severity: "info",
            params: {
              dept: hot.name,
              viewsPerResource: hot.viewsPerResource as number,
              resources: hot.resources,
            },
            href: `/admin?view=content&dept=${encodeURIComponent(hot.name)}${q}`,
          });
        }
      }
    }
  }

  if (input.storageErrors.current >= 3 && input.storageErrors.current > input.storageErrors.previous) {
    out.push({
      key: "storageFailuresUp",
      severity: "warning",
      params: {
        current: input.storageErrors.current,
        previous: input.storageErrors.previous,
      },
      href: `/admin?view=system${q}`,
    });
  }

  {
    const { current, previous, total } = input.khmerSearchShare;
    if (current !== null && previous !== null && total >= MIN_SEARCH_SAMPLE && current - previous >= 10) {
      out.push({
        key: "khmerSearchGrowth",
        severity: "positive",
        params: { nowPct: Math.round(current), prevPct: Math.round(previous) },
        href: `/admin?view=search${q}`,
      });
    }
  }

  return out;
}
