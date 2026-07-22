"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarRange,
  Check,
  ChevronDown,
  FileStack,
  LayoutGrid,
  ListFilter,
  Loader2,
  RotateCw,
  Search,
  ServerCog,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import ExportMenu from "@/components/admin/ExportMenu";
import {
  activeFilterCount,
  serializeDashboardFilters,
  DASHBOARD_VIEWS,
  type ContentTypeFilter,
  type DashboardFilters,
  type DashboardRange,
  type DashboardView,
  type LanguageFilter,
} from "@/lib/admin/dashboard-shared";

const RANGE_PRESETS: Exclude<DashboardRange, "custom">[] = ["today", "7d", "30d", "90d"];
const TYPES: ContentTypeFilter[] = ["all", "book", "research_report", "publication", "post"];
const LANGS: LanguageFilter[] = ["all", "en", "km"];

const VIEW_ICON: Record<DashboardView, LucideIcon> = {
  overview: LayoutGrid,
  content: FileStack,
  search: Search,
  audience: Users,
  system: ServerCog,
};

/** Built once: an Intl formatter is expensive and this one never varies. */
const YMD_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Phnom_Penh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function todayYmd(): string {
  return YMD_FORMAT.format(new Date());
}

/**
 * The dashboard's single control surface: view tabs and every period/filter
 * control on one slim sticky row, replacing the three stacked bars the page
 * used to open with (greeting card → toolbar → tab rail).
 *
 * Sticky behaviour: it pins to the top of the admin content scroll area with
 * an opaque background and a real bottom edge, so scrolled content passes
 * *under* it rather than showing through. Everything that can overlap it
 * (menus, definition popovers, drawers) sits on a higher layer of the shared
 * z-scale defined in admin.css, and `.dash-scroll-root` sets scroll-padding so
 * keyboard focus never lands behind the bar.
 *
 * All state lives in the URL (?view&range&from&to&compare&type&dept&lang), so
 * any dashboard view is bookmarkable and shareable between administrators.
 */
export default function DashboardControlBar({
  filters,
  active,
  showSystem,
  departments,
  exportHref,
}: {
  filters: DashboardFilters;
  active: DashboardView;
  showSystem: boolean;
  departments: string[];
  exportHref: string;
}) {
  const t = useTranslations("adminDashboard.toolbar");
  const tTabs = useTranslations("adminDashboard.tabs");
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [panel, setPanel] = useState<"none" | "date" | "filters">("none");
  const [from, setFrom] = useState(filters.from ?? "");
  const [to, setTo] = useState(filters.to ?? "");
  const panelRef = useRef<HTMLDivElement>(null);
  const dateBtnRef = useRef<HTMLButtonElement>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);

  const apply = (next: DashboardFilters) => {
    const qs = serializeDashboardFilters(next);
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  // Escape closes the open panel and returns focus to the control that opened
  // it; an outside click just closes it.
  useEffect(() => {
    if (panel === "none") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const opener = panel === "date" ? dateBtnRef.current : filterBtnRef.current;
      setPanel("none");
      opener?.focus();
    };
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (dateBtnRef.current?.contains(target) || filterBtnRef.current?.contains(target)) return;
      setPanel("none");
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [panel]);

  const max = todayYmd();
  const customValid = Boolean(from && to && from <= to && from <= max);
  const activeCount = activeFilterCount(filters);
  const views = DASHBOARD_VIEWS.filter((v) => v !== "system" || showSystem);

  const quietBtn =
    "flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] px-2.5 text-[12.5px] font-medium text-text-muted transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
  const selectClass =
    "h-10 w-full min-w-[150px] cursor-pointer rounded-[10px] border border-divider bg-bg-surface px-2.5 text-[13px] font-medium text-text-body focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand";

  /** Removable chips for every non-default audience filter. */
  const chips: { key: string; label: string; clear: DashboardFilters }[] = [];
  if (filters.type !== "all") {
    chips.push({ key: "type", label: t(`type.${filters.type}`), clear: { ...filters, type: "all" } });
  }
  if (filters.dept) {
    chips.push({ key: "dept", label: filters.dept, clear: { ...filters, dept: null } });
  }
  if (filters.lang !== "all") {
    chips.push({ key: "lang", label: t(`lang.${filters.lang}`), clear: { ...filters, lang: "all" } });
  }

  const rangeLabel =
    filters.range === "custom" && filters.from && filters.to
      ? `${filters.from} → ${filters.to}`
      : t(`range.${filters.range}`);

  return (
    <div className="dash-controlbar">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 py-1.5">
        {/* ── View tabs ── */}
        <nav aria-label={tTabs("ariaLabel")} className="-mx-1 min-w-0 max-w-full overflow-x-auto px-1">
          <ul className="dash-tabrail flex min-w-max">
            {views.map((view) => {
              const qs = serializeDashboardFilters({ ...filters, view });
              const Icon = VIEW_ICON[view];
              return (
                <li key={view}>
                  <Link
                    href={qs ? `/admin?${qs}` : "/admin"}
                    aria-current={view === active ? "page" : undefined}
                    className="dash-tab"
                  >
                    <Icon className="dash-tab-ico h-4 w-4" aria-hidden="true" />
                    {tTabs(view)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ── Period + filters + utilities ── */}
        <div className="ms-auto flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <div className="dash-seg" role="group" aria-label={t("rangeLabel")}>
            {RANGE_PRESETS.map((r) => (
              <button
                key={r}
                type="button"
                disabled={isPending}
                aria-pressed={filters.range === r}
                className="dash-seg-btn disabled:cursor-wait"
                onClick={() => {
                  setPanel("none");
                  apply({ ...filters, range: r, from: undefined, to: undefined });
                }}
              >
                {t(`range.${r}`)}
              </button>
            ))}
            <button
              ref={dateBtnRef}
              type="button"
              disabled={isPending}
              aria-pressed={filters.range === "custom"}
              aria-expanded={panel === "date"}
              className="dash-seg-btn flex items-center gap-1 disabled:cursor-wait"
              onClick={() => setPanel((p) => (p === "date" ? "none" : "date"))}
            >
              <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
              {t("range.custom")}
            </button>
          </div>

          <label className="flex h-9 cursor-pointer select-none items-center gap-1.5 rounded-[10px] px-1.5 text-[12.5px] font-medium text-text-muted hover:text-text-heading">
            <input
              type="checkbox"
              checked={filters.compare}
              disabled={isPending}
              onChange={(e) => apply({ ...filters, compare: e.target.checked })}
              className="h-3.5 w-3.5 cursor-pointer accent-[var(--ptec-brand,#1E3A8A)]"
            />
            {t("compareShort")}
          </label>

          <button
            ref={filterBtnRef}
            type="button"
            disabled={isPending}
            aria-expanded={panel === "filters"}
            onClick={() => setPanel((p) => (p === "filters" ? "none" : "filters"))}
            className={`${quietBtn} ${activeCount > 0 ? "text-brand" : ""}`}
          >
            <ListFilter className="h-3.5 w-3.5" aria-hidden="true" />
            {t("filters")}
            {activeCount > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold tabular-nums text-white">
                {activeCount}
              </span>
            )}
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </button>

          <span className="flex items-center gap-0.5">
            {isPending && (
              <span role="status" className="flex items-center">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" aria-hidden="true" />
                <span className="sr-only">{t("updating")}</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => startTransition(() => router.refresh())}
              className={quietBtn}
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden lg:inline">{t("refresh")}</span>
              <span className="sr-only lg:hidden">{t("refresh")}</span>
            </button>
            <ExportMenu href={exportHref} buttonClassName={quietBtn} />
          </span>
        </div>
      </div>

      {/* ── Active filter chips (only when something is filtered) ── */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1 pb-1.5">
          <span className="text-[11.5px] font-medium text-text-muted">{t("activeFilters")}:</span>
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              disabled={isPending}
              onClick={() => apply(c.clear)}
              className="flex h-6 cursor-pointer items-center gap-1 rounded-full border border-brand/20 bg-brand/5 ps-2 pe-1.5 text-[11.5px] font-semibold text-brand transition-colors hover:bg-brand/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <span className="max-w-[160px] truncate" dir="auto">
                {c.label}
              </span>
              <X className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">{t("removeFilter")}</span>
            </button>
          ))}
          <button
            type="button"
            disabled={isPending}
            onClick={() => apply({ ...filters, type: "all", dept: null, lang: "all" })}
            className="cursor-pointer rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold text-text-muted underline hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {t("clearFilters")}
          </button>
        </div>
      )}

      {/* ── Expandable panels: custom range / filters ──
           A sheet on small screens, an inline panel from sm up. */}
      {panel !== "none" && (
        <div
          ref={panelRef}
          role="group"
          aria-label={panel === "date" ? t("rangeLabel") : t("filters")}
          className="dash-panel"
        >
          {panel === "date" ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[12px] font-medium text-text-muted">
                {t("from")}
                <input
                  type="date"
                  value={from}
                  max={to || max}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-10 rounded-[10px] border border-divider bg-bg-surface px-2.5 text-[13px] text-text-body focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                />
              </label>
              <label className="flex flex-col gap-1 text-[12px] font-medium text-text-muted">
                {t("to")}
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  max={max}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-10 rounded-[10px] border border-divider bg-bg-surface px-2.5 text-[13px] text-text-body focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                />
              </label>
              <button
                type="button"
                disabled={!customValid || isPending}
                onClick={() => {
                  apply({ ...filters, range: "custom", from, to });
                  setPanel("none");
                }}
                className="flex h-10 cursor-pointer items-center gap-1.5 rounded-[10px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {t("apply")}
              </button>
              <p className="w-full text-[11.5px] text-text-muted sm:w-auto">
                {t("timezoneNote")}
                {filters.compare && <span className="ms-1">{t("compareNote")}</span>}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-[12px] font-medium text-text-muted">
                {t("contentType")}
                <select
                  value={filters.type}
                  disabled={isPending}
                  onChange={(e) => apply({ ...filters, type: e.target.value as ContentTypeFilter })}
                  className={selectClass}
                >
                  {TYPES.map((v) => (
                    <option key={v} value={v}>
                      {t(`type.${v}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[12px] font-medium text-text-muted">
                {t("department")}
                <select
                  value={filters.dept ?? ""}
                  disabled={isPending}
                  onChange={(e) => apply({ ...filters, dept: e.target.value || null })}
                  className={selectClass}
                >
                  <option value="">{t("allDepartments")}</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[12px] font-medium text-text-muted">
                {t("language")}
                <select
                  value={filters.lang}
                  disabled={isPending}
                  onChange={(e) => apply({ ...filters, lang: e.target.value as LanguageFilter })}
                  className={selectClass}
                >
                  {LANGS.map((v) => (
                    <option key={v} value={v}>
                      {t(`lang.${v}`)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center justify-between gap-2 sm:col-span-3">
                <p className="text-[11.5px] text-text-muted">{t("filterScope", { range: rangeLabel })}</p>
                <button
                  type="button"
                  onClick={() => setPanel("none")}
                  className="cursor-pointer rounded-[10px] border border-divider px-3 py-1.5 text-[12.5px] font-semibold text-text-body transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {t("done")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
