"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Loader2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { EngagementBreakdownLoadState } from "./useEngagementBreakdown";

type DetailsMode = "mobile" | "tablet" | "desktop";

function detailsMode(): DetailsMode {
  if (typeof window === "undefined") return "tablet";
  if (window.matchMedia("(min-width: 1024px)").matches) return "desktop";
  if (window.matchMedia("(max-width: 767px)").matches) return "mobile";
  return "tablet";
}

function useDetailsMode(): DetailsMode {
  const [mode, setMode] = useState<DetailsMode>(detailsMode);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const mobile = window.matchMedia("(max-width: 767px)");
    const update = () => setMode(desktop.matches ? "desktop" : mobile.matches ? "mobile" : "tablet");
    desktop.addEventListener("change", update);
    mobile.addEventListener("change", update);
    return () => {
      desktop.removeEventListener("change", update);
      mobile.removeEventListener("change", update);
    };
  }, []);
  return mode;
}

function trapDialog(event: KeyboardEvent<HTMLElement>, close: () => void) {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== "Tab") return;
  const controls = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (controls.length === 0) return;
  const first = controls[0];
  const last = controls.at(-1)!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function DetailBody({
  load,
  metricLabel,
  bucketLabel,
}: {
  load: EngagementBreakdownLoadState & { retry: () => void };
  metricLabel: string;
  bucketLabel: string;
}) {
  const t = useTranslations("adminDashboard.engagement");
  const locale = useLocale();
  if (load.status === "loading" || load.status === "idle") {
    return (
      <p role="status" className="flex items-center gap-2 py-5 text-xs text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {t("detailsLoading")}
      </p>
    );
  }
  if (load.status === "error") {
    return (
      <div role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-3 text-danger-text">
        <p className="text-xs font-semibold">
          {load.error === "timeout" ? t("detailsTimeout") : t("detailsError")}
        </p>
        <button
          type="button"
          onClick={load.retry}
          className="mt-2 rounded-lg bg-bg-surface px-2.5 py-1.5 text-xs font-bold text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  const data = load.data;
  const showMetricRanking = !data.partial && data.ranking.status === "metric";
  const showFallback = !data.partial && data.ranking.status === "fallback";
  const number = new Intl.NumberFormat(locale);
  return (
    <div className="space-y-3">
      {data.partial && (
        <div role="status" className="flex gap-2 rounded-xl border border-warning-line bg-warning-soft p-3 text-warning-text">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="text-xs leading-5">{t("partialDetails")}</p>
        </div>
      )}
      {data.scope.aggregationScope === "peakDay" && data.scope.representativeDate && (
        <p className="rounded-lg bg-info-soft px-2.5 py-2 text-xs font-semibold text-info-text">
          {t("peakDayWithin", { date: data.scope.representativeDate })}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-2 rounded-xl border border-divider bg-paper/60 p-3">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">{metricLabel}</dt>
          <dd className="mt-1 text-xl font-bold tabular-nums text-text-heading">{number.format(data.total)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t("selectedDate")}</dt>
          <dd className="mt-1 text-xs font-semibold text-text-heading">{bucketLabel}</dd>
        </div>
      </dl>

      <section aria-labelledby="engagement-ranking-heading">
        <h4 id="engagement-ranking-heading" className="text-xs font-bold text-text-heading">
          {showMetricRanking
            ? t("topResourcesForMetric", { metric: metricLabel })
            : showFallback
              ? t("fallbackResources")
              : t("rankingUnavailable")}
        </h4>
        {(showMetricRanking || showFallback) && data.ranking.items.length > 0 ? (
          <ol className="mt-1.5 divide-y divide-divider rounded-xl border border-divider bg-bg-surface">
            {data.ranking.items.map((item, index) => (
              <li key={`${item.type}:${item.id}`} className="flex items-center gap-2 px-3 py-2 text-xs">
                <span className="w-4 shrink-0 text-xs font-bold text-text-muted">{index + 1}</span>
                <Link
                  href={item.editHref}
                  dir="auto"
                  className="min-w-0 flex-1 dash-truncate-head font-semibold text-text-body hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {item.title}
                </Link>
                <span className="shrink-0 tabular-nums text-text-muted">{number.format(item.count)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 text-xs leading-5 text-text-muted">
            {data.ranking.reason === "noData" ? t("noChartData") : t("rankingUnavailableHint")}
          </p>
        )}
      </section>
      {data.unattributed > 0 && (
        <p className="text-xs text-text-muted">{t("unattributed", { count: data.unattributed })}</p>
      )}
    </div>
  );
}

export default function SelectedBucketDetails({
  bucketLabel,
  metricLabel,
  plottedValue,
  selected,
  expanded,
  onExpandedChange,
  onClear,
  load,
}: {
  bucketLabel: string;
  metricLabel: string;
  plottedValue: number;
  selected: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onClear: () => void;
  load: EngagementBreakdownLoadState & { retry: () => void };
}) {
  const t = useTranslations("adminDashboard.engagement");
  const mode = useDetailsMode();
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (expanded) closeRef.current?.focus();
  }, [expanded, mode]);

  const closeDetails = () => {
    onExpandedChange(false);
    window.setTimeout(() => openerRef.current?.focus(), 0);
  };

  let panel: ReactNode = null;
  if (expanded) {
    const header = (
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-divider pb-3">
        <div>
          <p className="dash-eyebrow">{metricLabel}</p>
          <h3 id="selected-bucket-details-title" className="text-sm font-bold text-text-heading">
            {t("detailsTitle", { date: bucketLabel })}
          </h3>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={closeDetails}
          aria-label={t("closeDetails")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
    const body = <DetailBody load={load} metricLabel={metricLabel} bucketLabel={bucketLabel} />;

    if (mode === "tablet") {
      panel = (
        <section
          aria-labelledby="selected-bucket-details-title"
          className="mt-3 rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm"
          onKeyDown={(event) => event.key === "Escape" && closeDetails()}
        >
          {header}
          {body}
        </section>
      );
    } else {
      const position = mode === "mobile"
        ? "inset-x-0 bottom-0 max-h-[82vh] rounded-t-2xl border-t"
        : "inset-y-0 end-0 h-full w-[min(420px,92vw)] border-s";
      panel = (
        <>
          <button
            type="button"
            className="dash-drawer-scrim cursor-default"
            aria-label={t("closeDetails")}
            onClick={closeDetails}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="selected-bucket-details-title"
            onKeyDown={(event) => trapDialog(event, closeDetails)}
            className={`fixed z-[calc(var(--dash-z-overlay)+1)] overflow-y-auto border-divider bg-bg-surface p-4 shadow-2xl ${position}`}
          >
            {header}
            {body}
          </aside>
        </>
      );
    }
  }

  return (
    <div className="min-h-[68px] border-t border-divider/70 pt-2.5">
      {selected ? (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-paper/60 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="dash-truncate text-xs font-semibold text-text-muted">{bucketLabel}</p>
              <p className="text-xs font-bold text-text-heading">
                {t("selectedSummary", { metric: metricLabel, value: plottedValue })}
              </p>
            </div>
            <button
              ref={openerRef}
              type="button"
              onClick={() => onExpandedChange(true)}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-brand hover:bg-brand/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {t("viewDetails")}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onClear}
              aria-label={t("clearSelection")}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-bg-surface hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          {panel}
        </>
      ) : (
        <p className="px-2 py-3 text-xs text-text-muted">{t("selectionHint")}</p>
      )}
    </div>
  );
}
