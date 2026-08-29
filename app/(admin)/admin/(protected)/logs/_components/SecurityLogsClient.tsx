"use client";

// Activity & Security — the admin audit console.
//
// ARCHITECTURE (unchanged, and load-bearing): filter state lives in the URL
// (?range&start&end&tab&resource&status&q&page). Every control writes params
// and navigates, so the SERVER re-runs lib/admin/activity-log.queryActivity and
// the KPI cards, the analytics, the tab badges, the table and the CSV export
// all read the SAME range and filters. That is what fixes the class of bug
// where the cards said 0 while a tab badge said 13. There is exactly one filter
// state, and it is the URL — nothing here keeps a private copy.
//
// The page is three levels, top to bottom: what is happening (KPIs) → what the
// shape of it is (timeline, security, resources) → which events exactly
// (tabs + table) → why this one (drawer). The analytics are not decoration:
// selecting a security row or a resource bar drives the list below it.
//
// This route is under /admin, which is NOT locale-prefixed, so navigation uses
// plain next/navigation and never i18n/navigation (per CLAUDE.md).

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { ActivityResult } from "@/lib/admin/activity-log";
import type { ActivityEvent, ActivityTab, EventStatus, RangePreset, ResourceType } from "@/lib/admin/activity-log-shared";
import { exportActivityLogs, type ExportFilterInput } from "../actions";
import ActivityDetailDrawer from "./ActivityDetailDrawer";
import ActivityTable, { type EmptyKind } from "./ActivityTable";
import ActivityTimeline from "./ActivityTimeline";
import LogsFilters, { type FilterChip } from "./LogsFilters";
import LogsHeader, { type ExportState } from "./LogsHeader";
import LogsKpiGrid from "./LogsKpiGrid";
import LogsPagination from "./LogsPagination";
import ResourceActivity from "./ResourceActivity";
import SecurityOverview, { type SecurityDrill } from "./SecurityOverview";
import { FONT, INK, INK2, INK3, LINE, eyebrow } from "./logs-ui";
import { createTimeFormatter, formatClock } from "./time";

export type ClientFilters = {
  range: RangePreset;
  tab: ActivityTab;
  resourceType: ResourceType | "all";
  status: EventStatus | "all";
  search: string;
  customStart: string | null;
  customEnd: string | null;
};

const RANGE_KEY: Record<RangePreset, string> = { "24h": "last24h", "7d": "last7d", "30d": "last30d", "90d": "last90d", custom: "custom" };

export default function SecurityLogsClient({
  result,
  filters,
  canSeePersonal,
}: {
  result: ActivityResult;
  filters: ClientFilters;
  canSeePersonal: boolean;
}) {
  const t = useTranslations("adminLogs");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [selected, setSelected] = useState<ActivityEvent | null>(null);
  const [exportState, setExportState] = useState<ExportState>("idle");

  // ── URL writer — the single mutation point for filter state ───────────────
  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value == null || value === "" || value === "all") next.delete(key);
        else next.set(key, value);
      }
      // Any change that is not itself a page change returns to page 1 —
      // otherwise a narrower filter can land you on a page that no longer
      // exists and the table looks empty for the wrong reason.
      if (!("page" in updates)) next.delete("page");
      const query = next.toString();
      startTransition(() => router.push(query ? `${pathname}?${query}` : pathname, { scroll: false }));
    },
    [router, pathname, searchParams],
  );

  const clearAll = useCallback(() => {
    startTransition(() => router.push(pathname, { scroll: false }));
  }, [router, pathname]);

  const refresh = useCallback(() => startTransition(() => router.refresh()), [router]);

  // Debounced search. The input is uncontrolled (defaultValue) so a slow
  // navigation can never yank a character back out from under the typist.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchInput = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setParams({ q: value || null }), 400);
  }, [setParams]);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // ── Export ────────────────────────────────────────────────────────────────
  const exportInput: ExportFilterInput = useMemo(
    () => ({
      range: filters.range,
      tab: filters.tab,
      resourceType: filters.resourceType,
      status: filters.status,
      search: filters.search,
      customStart: filters.customStart,
      customEnd: filters.customEnd,
    }),
    [filters],
  );

  const doExport = useCallback(() => {
    setExportState("busy");
    startTransition(async () => {
      try {
        // The server action re-checks authorization and re-applies the same
        // masking rules as the table — the CSV can never contain a column the
        // caller is not allowed to read on screen.
        const res = await exportActivityLogs(exportInput);
        if (!res.ok) { setExportState(res.error === "empty" ? "empty" : "error"); return; }
        const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = res.filename;
        anchor.click();
        URL.revokeObjectURL(url);
        setExportState("done");
        setTimeout(() => setExportState("idle"), 3000);
      } catch {
        setExportState("error");
      }
    });
  }, [exportInput]);

  // ── Derived labels ────────────────────────────────────────────────────────
  const rangeLabel = useMemo(() => {
    if (filters.range !== "custom") return t(`range.${RANGE_KEY[filters.range]}`);
    const dateOnly = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Phnom_Penh" });
    const start = filters.customStart ? dateOnly.format(new Date(filters.customStart)) : "";
    const end = filters.customEnd ? dateOnly.format(new Date(filters.customEnd)) : "";
    return start && end ? t("range.customApplied", { start, end }) : t("range.custom");
  }, [filters.range, filters.customStart, filters.customEnd, locale, t]);

  // Anchored to the SERVER's query bound, not Date.now() — see ./time.ts.
  const fmt = useMemo(
    () => createTimeFormatter(locale, result.appliedRange.end, t("time.justNow")),
    [locale, result.appliedRange.end, t],
  );
  const updatedAt = useMemo(() => formatClock(locale, result.appliedRange.end), [locale, result.appliedRange.end]);

  // ── Active filter chips ───────────────────────────────────────────────────
  const chips: FilterChip[] = useMemo(() => {
    const out: FilterChip[] = [];
    // The default range is not a "filter" — showing a chip for the state the
    // page opens in would mean it is never unfiltered.
    if (filters.range !== "24h") out.push({ key: "range", label: rangeLabel, clear: { range: null, start: null, end: null } });
    if (filters.tab !== "all") out.push({ key: "tab", label: t(`tabs.${filters.tab}`), clear: { tab: null } });
    if (filters.resourceType !== "all") out.push({ key: "resource", label: t(`resource.${filters.resourceType}`), clear: { resource: null } });
    if (filters.status !== "all") out.push({ key: "status", label: t(`status.${filters.status}`), clear: { status: null } });
    if (filters.search) out.push({ key: "q", label: t("filters.searchChip", { term: filters.search }), clear: { q: null } });
    return out;
  }, [filters, rangeLabel, t]);

  // ── Tabs. Account/Admin appear only when the range actually contains them,
  //    so the rail does not advertise five empty destinations — but a tab the
  //    URL currently selects is always shown, or clearing it becomes
  //    impossible.
  const tabs: ActivityTab[] = useMemo(() => {
    const base: ActivityTab[] = ["all", "downloads", "views", "security"];
    for (const extra of ["account", "admin"] as const) {
      if (result.tabCounts[extra] > 0 || filters.tab === extra) base.push(extra);
    }
    return base;
  }, [result.tabCounts, filters.tab]);

  const emptyKind: EmptyKind = useMemo(() => {
    if (filters.tab === "security" && result.tabCounts.security === 0 && chips.length <= 1) return "secure";
    return chips.length > 0 ? "filtered" : "none";
  }, [filters.tab, result.tabCounts.security, chips.length]);

  // ── Drill-downs: the analytics drive the list ─────────────────────────────
  const onSecurityDrill = useCallback((drill: SecurityDrill) => {
    setParams({ tab: drill.tab, status: drill.status ?? null });
    document.getElementById("logs-activity")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [setParams]);

  const onResourceDrill = useCallback((resourceType: ResourceType) => {
    setParams({ resource: filters.resourceType === resourceType ? null : resourceType });
  }, [setParams, filters.resourceType]);

  return (
    <div style={{ fontFamily: FONT, color: INK, display: "flex", flexDirection: "column", gap: 18 }}>
      <LogsHeader
        rangeLabel={rangeLabel}
        updatedAt={updatedAt}
        pending={isPending}
        exportState={exportState}
        onRefresh={refresh}
        onExport={doExport}
      />

      <LogsFilters
        range={filters.range}
        resourceType={filters.resourceType}
        status={filters.status}
        search={filters.search}
        customStart={filters.customStart}
        customEnd={filters.customEnd}
        chips={chips}
        onParams={setParams}
        onClearAll={clearAll}
        onSearchInput={onSearchInput}
        pending={isPending}
      />

      <section aria-labelledby="logs-overview" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 id="logs-overview" style={eyebrow}>{t("overview.heading")}</h2>
        <LogsKpiGrid
          summary={result.summary}
          rangeLabel={rangeLabel}
          onSecurityDrill={() => onSecurityDrill({ tab: "security", status: null })}
        />
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
          <div style={{ gridColumn: "1 / -1", minWidth: 0 }}>
            <ActivityTimeline analytics={result.analytics} locale={locale} rangeLabel={rangeLabel} />
          </div>
          <SecurityOverview security={result.analytics.security} onDrill={onSecurityDrill} />
          <ResourceActivity rows={result.analytics.byResource} onDrill={onResourceDrill} />
        </div>
      </section>

      <section id="logs-activity" className="dash-card" style={{ overflow: "hidden", scrollMarginTop: 16 }} aria-labelledby="logs-activity-heading">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "13px 14px 12px", borderBottom: `1px solid ${LINE}` }}>
          <h2 id="logs-activity-heading" style={{ ...eyebrow, color: INK3 }}>{t("activity.heading")}</h2>
          <div className="dash-scroll-x" style={{ maxWidth: "100%" }}>
            <div className="dash-tabrail" role="tablist" aria-label={t("activity.heading")}>
              {tabs.map((tab) => {
                const active = filters.tab === tab;
                const count = tab === "all" ? result.tabCounts.all : result.tabCounts[tab as Exclude<ActivityTab, "all">];
                return (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setParams({ tab: tab === "all" ? null : tab })}
                    className="dash-tab"
                  >
                    {t(`tabs.${tab}`)}
                    <span
                      style={{
                        fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                        fontVariantNumeric: "tabular-nums",
                        background: active ? "var(--dash-blue)" : "var(--dash-line-subtle)",
                        color: active ? "#fff" : INK2,
                      }}
                    >
                      {count.toLocaleString()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <ActivityTable
          events={result.events}
          emptyKind={emptyKind}
          onOpen={setSelected}
          onClearFilters={clearAll}
          fmt={fmt}
          pending={isPending}
        />

        <LogsPagination
          page={result.pagination.page}
          pageSize={result.pagination.pageSize}
          total={result.pagination.total}
          totalPages={result.pagination.totalPages}
          onPage={(page) => setParams({ page: page === 0 ? null : String(page) })}
          pending={isPending}
        />
      </section>

      {selected && (
        <ActivityDetailDrawer
          event={selected}
          canSeePersonal={canSeePersonal}
          onClose={() => setSelected(null)}
          fmt={fmt}
        />
      )}
    </div>
  );
}
