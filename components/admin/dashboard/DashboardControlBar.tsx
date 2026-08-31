"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import Link, { useLinkStatus } from "next/link";
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
import SearchableSelect from "@/components/ui/search/SearchableSelect";
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

/**
 * The inside of a view tab, so it can read its OWN navigation state.
 *
 * The dashboard page is `force-dynamic` and every view runs real analytics
 * queries, so a tab click is followed by a wait with no feedback at all — on a
 * slow query the rail simply sat there and people clicked again. `useLinkStatus`
 * is scoped to the enclosing <Link>, so only the tab actually being navigated
 * to spins; the icon is swapped rather than added, so nothing reflows.
 */
function TabBody({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  const { pending } = useLinkStatus();
  return (
    <>
      {pending ? (
        <Loader2 className="dash-tab-ico h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="dash-tab-ico h-4 w-4" aria-hidden="true" />
      )}
      {label}
      {pending && <span className="sr-only">…</span>}
    </>
  );
}

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

  /**
   * What the CONTROLS show, which is not always what the page has rendered.
   *
   * Every control used to read `filters` — the committed URL state — and be
   * `disabled` while the navigation was in flight. So clicking "90 days" left
   * "30 days" looking selected, greyed out, for as long as the analytics query
   * took, and the only feedback was a small spinner elsewhere in the bar. The
   * controls now flip immediately and the spinner reports that the page behind
   * them is catching up.
   */
  const [shown, applyOptimistic] = useOptimistic(filters);

  const apply = (next: DashboardFilters) => {
    const qs = serializeDashboardFilters(next);
    startTransition(() => {
      applyOptimistic(next);
      // `push`, not `replace`: range, type and department are deliberate,
      // low-frequency decisions, and Back is how people undo one.
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
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
  const activeCount = activeFilterCount(shown);
  const views = DASHBOARD_VIEWS.filter((v) => v !== "system" || showSystem);

  const quietBtn =
    "flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] px-2 text-xs font-medium text-text-muted transition-colors hover:bg-paper hover:text-text-heading ";
  // h-11 matches the SearchableSelect trigger used for Department, so the
  // three filter controls sit on one baseline.
  const selectClass =
    "h-11 w-full min-w-[150px] cursor-pointer rounded-lg border border-divider bg-bg-surface px-2.5 text-sm font-medium text-text-body [--focus-ring-offset:1px]";

  /** Removable chips for every non-default audience filter. */
  const chips: { key: string; label: string; clear: DashboardFilters }[] = [];
  if (shown.type !== "all") {
    chips.push({ key: "type", label: t(`type.${shown.type}`), clear: { ...shown, type: "all" } });
  }
  if (shown.dept) {
    chips.push({ key: "dept", label: shown.dept, clear: { ...shown, dept: null } });
  }
  if (shown.contentLanguage !== "all") {
    chips.push({ key: "lang", label: t(`lang.${shown.contentLanguage}`), clear: { ...shown, contentLanguage: "all" } });
  }

  const rangeLabel =
    shown.range === "custom" && shown.from && shown.to
      ? `${shown.from} → ${shown.to}`
      : t(`range.${shown.range}`);

  return (
    <div className="dash-controlbar">
      {/* Two rows until 2xl, then one.

          It used to force a single row from `xl` (1280px), which is below the
          width the row actually needs: five tab labels plus four range presets,
          a compare toggle, a filter button, refresh and export overflow at
          1280–1535px, and because the tab <nav> scrolls without a visible
          scrollbar the overflow was silent — tabs simply vanished off the end
          with nothing to say so. Wrapping to two rows shows every control. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1 py-1.5 2xl:flex-nowrap">
        {/* ── View tabs ── */}
        <nav aria-label={tTabs("ariaLabel")} className="dash-scroll-x -mx-1 min-w-0 max-w-full px-1">
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
                    <TabBody icon={Icon} label={tTabs(view)} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ── Period + filters + utilities ── */}
        <div className="ms-auto flex flex-wrap items-center gap-x-2 gap-y-1.5 2xl:flex-nowrap 2xl:shrink-0">
          <div className="dash-seg" role="group" aria-label={t("rangeLabel")}>
            {RANGE_PRESETS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={shown.range === r}
                className="dash-seg-btn"
                onClick={() => {
                  setPanel("none");
                  apply({ ...shown, range: r, from: undefined, to: undefined });
                }}
              >
                {t(`range.${r}`)}
              </button>
            ))}
            <button
              ref={dateBtnRef}
              type="button"
              aria-pressed={shown.range === "custom"}
              aria-expanded={panel === "date"}
              className="dash-seg-btn flex items-center gap-1"
              onClick={() => setPanel((p) => (p === "date" ? "none" : "date"))}
            >
              <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
              {t("range.custom")}
            </button>
          </div>

          <label className="flex h-9 cursor-pointer select-none items-center gap-1.5 rounded-[10px] px-1.5 text-xs font-medium text-text-muted hover:text-text-heading">
            <input
              type="checkbox"
              checked={shown.compare}
              onChange={(e) => apply({ ...shown, compare: e.target.checked })}
              className="h-3.5 w-3.5 cursor-pointer accent-[var(--ptec-brand)]"
            />
            {t("compareShort")}
          </label>

          <button
            ref={filterBtnRef}
            type="button"
            aria-expanded={panel === "filters"}
            onClick={() => setPanel((p) => (p === "filters" ? "none" : "filters"))}
            className={`${quietBtn} ${activeCount > 0 ? "text-brand" : ""}`}
          >
            <ListFilter className="h-3.5 w-3.5" aria-hidden="true" />
            {t("filters")}
            {activeCount > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-xs font-bold tabular-nums text-white">
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
          <span className="text-xs font-medium text-text-muted">{t("activeFilters")}:</span>
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => apply(c.clear)}
              className="flex h-6 cursor-pointer items-center gap-1 rounded-full border border-brand/20 bg-brand/5 ps-2 pe-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/10"
            >
              <span className="max-w-[160px] dash-truncate" dir="auto">
                {c.label}
              </span>
              <X className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">{t("removeFilter")}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => apply({ ...shown, type: "all", dept: null, contentLanguage: "all" })}
            className="cursor-pointer rounded-md px-1.5 py-0.5 text-xs font-semibold text-text-muted underline hover:text-brand"
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
              <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
                {t("from")}
                <input
                  type="date"
                  value={from}
                  max={to || max}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-10 rounded-[10px] border border-divider bg-bg-surface px-2.5 text-sm text-text-body [--focus-ring-offset:1px]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
                {t("to")}
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  max={max}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-10 rounded-[10px] border border-divider bg-bg-surface px-2.5 text-sm text-text-body [--focus-ring-offset:1px]"
                />
              </label>
              <button
                type="button"
                disabled={!customValid || isPending}
                onClick={() => {
                  apply({ ...shown, range: "custom", from, to });
                  setPanel("none");
                }}
                className="flex h-10 cursor-pointer items-center gap-1.5 rounded-[10px] bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {t("apply")}
              </button>
              <p className="w-full text-xs text-text-muted sm:w-auto">
                {t("timezoneNote")}
                {shown.compare && <span className="ms-1">{t("compareNote")}</span>}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
                {t("contentType")}
                <select
                  value={shown.type}
                  onChange={(e) => apply({ ...shown, type: e.target.value as ContentTypeFilter })}
                  className={selectClass}
                >
                  {TYPES.map((v) => (
                    <option key={v} value={v}>
                      {t(`type.${v}`)}
                    </option>
                  ))}
                </select>
              </label>
              {/* Departments are a long, bilingual list, so this one gets the
                  searchable widget rather than a native <select>. Not wrapped
                  in a <label>: the trigger is a button, named via ariaLabel. */}
              <div className="flex flex-col gap-1 text-xs font-medium text-text-muted">
                <span>{t("department")}</span>
                <SearchableSelect
                  name="dept"
                  value={shown.dept ?? ""}
                  onChange={(v) => apply({ ...shown, dept: v || null })}
                  ariaLabel={t("department")}
                  placeholder={t("allDepartments")}
                  options={[
                    { value: "", label: t("allDepartments") },
                    ...departments.map((d) => ({ value: d, label: d })),
                  ]}
                />
              </div>
              <label className="flex flex-col gap-1 text-xs font-medium text-text-muted">
                {t("language")}
                <select
                  value={shown.contentLanguage}
                  onChange={(e) => apply({ ...shown, contentLanguage: e.target.value as LanguageFilter })}
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
                <p className="text-xs text-text-muted">{t("filterScope", { range: rangeLabel })}</p>
                <button
                  type="button"
                  onClick={() => setPanel("none")}
                  className="cursor-pointer rounded-[10px] border border-divider px-3 py-1.5 text-xs font-semibold text-text-body transition-colors hover:bg-paper"
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
