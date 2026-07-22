"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_METRIC, parseMetric, type DashboardMetric } from "@/lib/admin/dashboard-shared";

/** What a details drawer can be opened for: an engagement metric, or health. */
export type DetailsTarget = DashboardMetric | "health" | null;

type MetricSelectionApi = {
  metric: DashboardMetric;
  selectMetric: (m: DashboardMetric) => void;
  details: DetailsTarget;
  openDetails: (t: Exclude<DetailsTarget, null>) => void;
  closeDetails: () => void;
};

const MetricSelectionContext = createContext<MetricSelectionApi | null>(null);

/**
 * Shared selection state for the Overview: which engagement metric the KPI row
 * and the chart agree on, and which details drawer is open.
 *
 * The metric is mirrored into `?metric=` with `history.pushState` rather than
 * a router navigation: it changes nothing the server queries, so a round trip
 * would re-run every analytics query to render an identical page. Back/forward
 * still work — `popstate` re-reads the URL — and a shared link restores the
 * selection because the server passes the parsed value in as `initialMetric`.
 */
export function MetricSelectionProvider({
  initialMetric,
  children,
}: {
  initialMetric: DashboardMetric;
  children: ReactNode;
}) {
  const [metric, setMetric] = useState<DashboardMetric>(initialMetric);
  const [details, setDetails] = useState<DetailsTarget>(null);

  const selectMetric = useCallback((next: DashboardMetric) => {
    setMetric(next);
    const url = new URL(window.location.href);
    if (next === DEFAULT_METRIC) url.searchParams.delete("metric");
    else url.searchParams.set("metric", next);
    window.history.pushState(null, "", url.toString());
  }, []);

  useEffect(() => {
    const onPop = () => {
      setMetric(parseMetric(new URLSearchParams(window.location.search).get("metric") ?? undefined));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const api = useMemo<MetricSelectionApi>(
    () => ({
      metric,
      selectMetric,
      details,
      openDetails: (t) => setDetails(t),
      closeDetails: () => setDetails(null),
    }),
    [metric, selectMetric, details],
  );

  return <MetricSelectionContext.Provider value={api}>{children}</MetricSelectionContext.Provider>;
}

export function useMetricSelection(): MetricSelectionApi {
  const ctx = use(MetricSelectionContext);
  if (!ctx) throw new Error("useMetricSelection must be used inside MetricSelectionProvider");
  return ctx;
}
