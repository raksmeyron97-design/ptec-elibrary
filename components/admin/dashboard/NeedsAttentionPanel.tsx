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

const SEVERITY_STYLE: Record<
  ActionSeverity,
  { icon: typeof Info; text: string; tile: string; rail: string }
> = {
  critical: {
    icon: AlertOctagon,
    text: "text-rose-700",
    tile: "bg-rose-50 text-rose-600 ring-rose-100",
    rail: "dash-sev--critical",
  },
  warning: {
    icon: AlertTriangle,
    text: "text-amber-700",
    tile: "bg-amber-50 text-amber-600 ring-amber-100",
    rail: "dash-sev--warning",
  },
  pending: {
    icon: Clock,
    text: "text-sky-700",
    tile: "bg-sky-50 text-sky-600 ring-sky-100",
    rail: "dash-sev--pending",
  },
  info: {
    icon: Info,
    text: "text-slate-600",
    tile: "bg-slate-50 text-slate-500 ring-slate-100",
    rail: "dash-sev--info",
  },
};

const DEFAULT_VISIBLE = 3;

const FILTERS: FilterKey[] = ["all", "critical", "warning", "pending", "clear"];

/**
 * "Needs attention": an operational queue, not a list of links.
 *
 * Each row states the problem in plain language, what it is costing (measured
 * impact only — never an estimate), which module owns it, how long it has been
 * open, and offers a primary fix plus any secondary routes. Severity is
 * carried by an icon shape, a rail, a written label and the filter chips, so
 * it never depends on colour.
 *
 * These alerts are *derived* from live data rather than stored as tickets, so
 * they cannot be assigned or manually dismissed — they clear themselves when
 * the underlying condition is fixed. The "Clear" filter shows the checks that
 * currently pass, which is the honest equivalent of a resolved queue.
 */
export default function NeedsAttentionPanel({ data }: { data: ActionCenterData }) {
  const t = useTranslations("adminDashboard.actionCenter");
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
      <li key={item.key} className={`dash-sev dash-attention-row ${style.rail}`}>
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2 py-2.5 ps-3.5 pe-2">
          <span
            className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${style.tile}`}
            aria-hidden="true"
          >
            <Icon className="h-4 w-4" />
          </span>

          {/* A real minimum width: without it the action cluster squeezes the
              text column to a few pixels and the sentence wraps to one word —
              one *glyph* in Khmer — per line. Below that width the actions
              wrap onto their own row instead. */}
          <div className="min-w-[min(100%,180px)] flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className={`text-[10px] font-bold uppercase tracking-wide ${style.text}`}>
                {t(`severity.${item.severity}`)}
              </span>
              <span className="rounded-md bg-paper px-1.5 py-px text-[10px] font-semibold text-text-muted">
                {t(`module.${item.module}`)}
              </span>
              {detectedLabel && (
                <span className="text-[10.5px] text-text-muted">{t("detected", { when: detectedLabel })}</span>
              )}
            </p>
            <p className="mt-0.5 text-[13px] font-semibold leading-5 text-text-heading">
              {t(`items.${item.key}`, { count: item.count })}
            </p>
            {item.impact && (
              <p className="mt-0.5 text-[11.5px] leading-4 text-text-muted">
                {t(`impact.${item.impact.key}`, { count: nf.format(item.impact.value) })}
              </p>
            )}

            {isOpen && (
              <p className="mt-1.5 rounded-lg bg-paper/70 p-2.5 text-[11.5px] leading-5 text-text-body">
                {t(`explain.${item.key}`)}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 max-sm:w-full max-sm:justify-end">
            <Link
              href={item.href}
              className="flex h-9 items-center gap-1 rounded-[10px] border border-brand/25 bg-brand/5 px-2.5 text-[12px] font-semibold text-brand transition-colors hover:bg-brand/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {t(`action.${item.key}`)}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>

            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenRow(isOpen ? null : item.key)}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] text-text-muted transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] text-text-muted transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
                    {item.secondary.map((s) => (
                      <Link
                        key={s.key}
                        role="menuitem"
                        href={s.href}
                        onBlur={(e) => {
                          if (!e.currentTarget.closest("[role=menu]")?.parentElement?.contains(e.relatedTarget as Node))
                            setMenuRow(null);
                        }}
                        className="block rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-text-body transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
                      >
                        {t(`secondary.${s.key}`)}
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

  return (
    <section aria-labelledby="attention-heading" className="dash-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="dash-ico dash-ico--md dash-ico--brand" aria-hidden="true">
            <ListChecks className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 id="attention-heading" className="text-[14px] font-bold text-text-heading">
              {t("title")}
            </h2>
            <p className="text-[11.5px] text-text-muted">
              {data.items.length > 0 ? t("summary", { count: data.items.length }) : t("allClearShort")}
            </p>
          </div>
        </div>

        <div className="dash-seg flex-wrap" role="group" aria-label={t("filterLabel")}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              disabled={counts[f] === 0 && f !== "all"}
              onClick={() => {
                setFilter(f);
                setExpanded(false);
              }}
              className="dash-seg-btn text-[11.5px] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t(`filter.${f}`)}
              <span className="ms-1 tabular-nums opacity-70">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {filter === "clear" ? (
        <div className="mt-3">
          {data.passedKeys.length === 0 ? (
            <p className="rounded-xl bg-paper/70 px-3 py-6 text-center text-[12.5px] text-text-muted">
              {t("noneClear")}
            </p>
          ) : (
            <>
              <p className="text-[11.5px] text-text-muted">{t("clearExplain")}</p>
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {data.passedKeys.map((key) => (
                  <li
                    key={key}
                    className="flex items-center gap-2 rounded-xl bg-emerald-50/60 px-3 py-2 text-[12px] font-medium text-emerald-900 ring-1 ring-inset ring-emerald-100"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                    {t(`checkName.${key}`)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <p className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-6 text-[12.5px] font-semibold text-emerald-900 ring-1 ring-inset ring-emerald-100">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          {filter === "all" ? t("allClear") : t("noneInFilter")}
        </p>
      ) : (
        <>
          <ul ref={listRef} className="mt-3 space-y-1.5">
            {visible.map(renderItem)}
          </ul>
          {(hidden > 0 || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-2 cursor-pointer rounded-lg px-2 py-1 text-[12px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {expanded ? t("showLess") : t("viewAll", { count: hidden })}
            </button>
          )}
        </>
      )}

      {data.passedKeys.length > 0 && filter !== "clear" && (
        <p className="mt-3 flex items-center gap-1.5 border-t border-divider/70 pt-2.5 text-[11px] text-text-muted">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
          {t("passed", { count: data.passedKeys.length })}
        </p>
      )}
    </section>
  );
}
