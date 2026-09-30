"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  Info,
  ListChecks,
  MoreHorizontal,
} from "lucide-react";
import type { ActionCenterData, ActionItem, ActionSeverity } from "@/lib/admin/intelligence";

type FilterKey = "all" | "critical" | "warning" | "pending" | "clear";

/** Severity in the shared vocabulary: one `.dash-status--*` class per level
 *  supplies the pill surface, its ring, its ink and the icon's mark colour, so
 *  the pill and its glyph can never say two different things. Each level also
 *  owns a distinct icon shape — colour is never the only channel. */
const SEVERITY_STYLE: Record<ActionSeverity, { icon: typeof Info; status: string }> = {
  critical: { icon: AlertOctagon, status: "dash-status--crit" },
  warning: { icon: AlertTriangle, status: "dash-status--warn" },
  pending: { icon: Clock, status: "dash-status--info" },
  info: { icon: Info, status: "dash-status--neutral" },
};

const DEFAULT_VISIBLE = 3;

const FILTERS: FilterKey[] = ["all", "critical", "warning", "pending", "clear"];

/**
 * "Needs attention": an operational queue, not a list of links.
 *
 * Each row states the problem in plain language, what it is costing (measured
 * impact only — never an estimate), which module owns it, how long it has been
 * open, and offers a primary fix plus any secondary routes. Severity is
 * carried by an icon shape, a written label and the filter chips, so it never
 * depends on colour.
 *
 * These alerts are *derived* from live data rather than stored as tickets, so
 * they cannot be assigned or manually dismissed — they clear themselves when
 * the underlying condition is fixed. The "Clear" filter shows the checks that
 * currently pass, which is the honest equivalent of a resolved queue.
 */
export default function NeedsAttentionPanel({ data }: { data: ActionCenterData }) {
  const t = useTranslations("adminDashboard.actionCenter");
  const tCol = useTranslations("adminDashboard.library.attentionColumns");
  const locale = useLocale();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [expanded, setExpanded] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [menuRow, setMenuRow] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // "now" is the server's generation time, so server and client agree.
  const now = new Date(data.generatedAt).getTime();
  const rtf = useMemo(
    () => new Intl.RelativeTimeFormat(locale === "km" ? "km-KH" : "en-US", { numeric: "auto" }),
    [locale],
  );
  const nf = useMemo(() => new Intl.NumberFormat(locale === "km" ? "km-KH" : "en-US"), [locale]);

  const detected = (iso: string | null): string | null => {
    if (!iso) return null;
    const diffMs = now - new Date(iso).getTime();
    if (!Number.isFinite(diffMs)) return null;
    const days = Math.floor(diffMs / 86_400_000);
    if (days >= 1) return rtf.format(-days, "day");
    const hours = Math.floor(diffMs / 3_600_000);
    if (hours >= 1) return rtf.format(-hours, "hour");
    return rtf.format(-Math.max(1, Math.floor(diffMs / 60_000)), "minute");
  };

  const counts = {
    all: data.items.length,
    critical: data.items.filter((i) => i.severity === "critical").length,
    warning: data.items.filter((i) => i.severity === "warning").length,
    pending: data.items.filter((i) => i.severity === "pending").length,
    clear: data.passedKeys.length,
  };

  const filtered =
    filter === "all" || filter === "clear"
      ? data.items
      : data.items.filter((i) => i.severity === filter);
  const visible = expanded ? filtered : filtered.slice(0, DEFAULT_VISIBLE);
  const hidden = filtered.length - visible.length;

  const renderItem = (item: ActionItem) => {
    const style = SEVERITY_STYLE[item.severity];
    const Icon = style.icon;
    const isOpen = openRow === item.key;
    const detectedLabel = detected(item.oldestAt);

    return (
      <li key={item.key} className={`dash-attention-row ${style.status}`}>
        {/* One row of a table from `lg` (severity · area · issue · detected ·
            actions, under the column headers), a stacked card below it. The
            severity is a word, an icon shape and a colour — never colour
            alone. */}
        {/* One column below `lg`: meta line, then the issue at full width,
            then the actions on their own line. Beside the issue, the action
            cluster squeezed the sentence to one word per line on a phone. */}
        <div className="grid grid-cols-1 items-start gap-y-2 px-5 py-3 lg:grid-cols-[8rem_7.5rem_minmax(0,1fr)_10rem_15.5rem] lg:items-center lg:gap-x-4">
          {/* Severity, area and age are ONE element each. Below `lg` they
              share a meta line above the issue; from `lg` the wrapper
              dissolves (`display: contents`) and `order` drops each into its
              column. Rendering them twice — once per layout — would put every
              label in the accessibility tree twice. */}
          <span className="flex flex-wrap items-center gap-2 lg:contents">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[var(--dash-status-bg)] px-2.5 py-0.5 text-xs font-bold text-[var(--dash-status-fg)] ring-1 ring-inset ring-[var(--dash-status-line)] lg:order-1">
              <Icon className="dash-mark h-3.5 w-3.5" aria-hidden="true" />
              {t(`severity.${item.severity}`)}
            </span>
            <span className="rounded-md bg-[var(--dash-well)] px-1.5 py-px text-xs font-semibold text-text-muted lg:order-2 lg:w-fit lg:bg-transparent lg:px-0 lg:text-[13px]">
              {t(`module.${item.module}`)}
            </span>
            <span className={`text-xs text-text-muted lg:order-4 ${detectedLabel ? "" : "max-lg:hidden"}`}>
              {detectedLabel ? t("detected", { when: detectedLabel }) : "—"}
            </span>
          </span>

          {/* A real minimum width: without it the action cluster squeezes the
              text column to a few pixels and the sentence wraps to one word —
              one *glyph* in Khmer — per line. */}
          <div className="min-w-[min(100%,180px)] lg:order-3">
            <p className="text-sm font-semibold leading-5 text-text-heading">
              {t(`items.${item.key}`, { count: item.count })}
            </p>
            {item.impact && (
              <p className="dash-prose mt-0.5">
                {t(`impact.${item.impact.key}`, { count: nf.format(item.impact.value) })}
              </p>
            )}

            {isOpen && (
              <p className="mt-1.5 rounded-lg bg-[var(--dash-well)] p-2.5 text-xs leading-5 text-text-body">
                {t(`explain.${item.key}`)}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 justify-self-end lg:order-5">
            <Link
              href={item.href}
              className="flex h-9 items-center gap-1 whitespace-nowrap rounded-[10px] border border-brand/25 bg-white px-3 text-xs font-bold text-brand transition-colors hover:bg-brand/5"
            >
              {t(`action.${item.key}`)}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>

            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenRow(isOpen ? null : item.key)}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] text-text-muted transition-colors hover:bg-[var(--dash-well)] hover:text-text-heading"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
              <span className="sr-only">{isOpen ? t("collapseRow") : t("expandRow")}</span>
            </button>

            {item.secondary && item.secondary.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={menuRow === item.key}
                  onClick={() => setMenuRow(menuRow === item.key ? null : item.key)}
                  onBlur={(e) => {
                    if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setMenuRow(null);
                  }}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] text-text-muted transition-colors hover:bg-[var(--dash-well)] hover:text-text-heading"
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only">{t("moreActions")}</span>
                </button>
                {menuRow === item.key && (
                  <div
                    role="menu"
                    tabIndex={-1}
                    aria-label={t("moreActions")}
                    className="dash-popover absolute end-0 top-full z-[var(--dash-z-popover)] mt-1 w-52 p-1.5"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setMenuRow(null);
                    }}
                  >
                    {item.secondary.map((sec) => (
                      <Link
                        key={sec.key}
                        role="menuitem"
                        href={sec.href}
                        onBlur={(e) => {
                          if (!e.currentTarget.closest("[role=menu]")?.parentElement?.contains(e.relatedTarget as Node))
                            setMenuRow(null);
                        }}
                        className="block rounded-lg px-2.5 py-2 text-xs font-medium text-text-body transition-colors hover:bg-paper [--focus-ring-offset:-2px]"
                      >
                        {t(`secondary.${sec.key}`)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </li>
    );
  };

  const severityChip = (f: FilterKey) =>
    f === "critical"
      ? "dash-status--crit"
      : f === "warning"
        ? "dash-status--warn"
        : f === "pending"
          ? "dash-status--info"
          : f === "clear"
            ? "dash-status--ok"
            : "";

  return (
    <section
      id="attention"
      aria-labelledby="attention-heading"
      className="dash-card scroll-mt-28 overflow-visible"
    >
      <header className="dash-panel-head">
        <span className="dash-ico dash-ico--md dash-ico--brand" aria-hidden="true">
          <ListChecks className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="attention-heading" className="text-sm font-bold leading-5 text-text-heading">
            {t("title")}
          </h2>
          <p className="mt-0.5 text-xs leading-[18px] text-text-muted">
            {data.items.length > 0 ? t("summary", { count: data.items.length }) : t("allClearShort")}
          </p>
        </div>

        {/* Severity filters as chips in their own severity colours — the
            count is the reason to press one, so it is printed on it. */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("filterLabel")}>
          {FILTERS.map((f) => {
            const active = filter === f;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={active}
                disabled={counts[f] === 0 && f !== "all"}
                onClick={() => {
                  setFilter(f);
                  setExpanded(false);
                }}
                className={`dash-chip cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                  active ? "dash-chip--active" : severityChip(f)
                }`}
              >
                {t(`filter.${f}`)}
                <span className="tabular-nums opacity-80">{counts[f]}</span>
              </button>
            );
          })}
        </div>
      </header>

      {filter === "clear" ? (
        <div className="px-5 py-4">
          {data.passedKeys.length === 0 ? (
            <p className="rounded-xl bg-[var(--dash-well)] px-3 py-6 text-center text-xs text-text-muted">
              {t("noneClear")}
            </p>
          ) : (
            <>
              <p className="text-xs text-text-muted">{t("clearExplain")}</p>
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {data.passedKeys.map((key) => (
                  <li
                    key={key}
                    className="dash-status--ok flex items-center gap-2 rounded-xl bg-[var(--dash-status-bg)] px-3 py-2 text-xs font-medium text-[var(--dash-status-fg)] ring-1 ring-inset ring-[var(--dash-status-line)]"
                  >
                    <CheckCircle2 className="dash-mark h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {t(`checkName.${key}`)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-5 py-4">
          <p className="dash-status--ok flex items-center justify-center gap-2 rounded-xl bg-[var(--dash-status-bg)] px-3 py-6 text-sm font-semibold text-[var(--dash-status-fg)] ring-1 ring-inset ring-[var(--dash-status-line)]">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            {filter === "all" ? t("allClear") : t("noneInFilter")}
          </p>
        </div>
      ) : (
        <>
          {/* Column headers name the table's columns for sighted readers from
              `lg`; each row still states its own severity and area in words,
              so nothing depends on reading across. */}
          <div
            aria-hidden="true"
            className="hidden border-b border-[var(--dash-line-subtle)] bg-[var(--dash-well)] px-5 py-2 lg:grid lg:grid-cols-[8rem_7.5rem_minmax(0,1fr)_10rem_15.5rem] lg:gap-x-4"
          >
            <span className="dash-label">{tCol("severity")}</span>
            <span className="dash-label">{tCol("area")}</span>
            <span className="dash-label">{tCol("issue")}</span>
            <span className="dash-label">{tCol("detected")}</span>
            <span className="dash-label text-end">{tCol("action")}</span>
          </div>
          <ul ref={listRef} className="divide-y divide-[var(--dash-line-subtle)]">
            {visible.map(renderItem)}
          </ul>
        </>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--dash-line-subtle)] px-5 py-2.5">
        {filter !== "clear" && (hidden > 0 || expanded) ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="cursor-pointer rounded-lg px-1 py-1 text-[13px] font-bold text-brand hover:underline"
          >
            {/* `filtered.length`, not `hidden`: the label reads "View all
                ({count})", so the number has to be the total it would show. */}
            {expanded ? t("showLess") : t("viewAll", { count: filtered.length })}
          </button>
        ) : (
          <span />
        )}
        {data.passedKeys.length > 0 && filter !== "clear" && (
          <p className="dash-status--ok flex items-center gap-1.5 text-xs text-text-muted">
            <CheckCircle2 className="dash-mark h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t("passed", { count: data.passedKeys.length })}
          </p>
        )}
      </div>
    </section>
  );
}
