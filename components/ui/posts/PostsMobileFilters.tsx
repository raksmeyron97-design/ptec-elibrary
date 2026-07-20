"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useClientNav, SortSelect } from "@/components/ui/books/ClientNavWrapper";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useMountTransition } from "@/lib/hooks/useMountTransition";
import { SlidersIcon, CloseIcon } from "./icons";

type Option = { value: string; label: string };

function pill(active: boolean) {
  return `min-h-11 rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
    active
      ? "border-brand bg-brand text-brand-contrast"
      : "border-divider bg-paper text-text-body hover:border-brand/30"
  }`;
}

/**
 * Mobile-only (`md:hidden`) toolbar + bottom filter sheet for /posts. Mirrors
 * the accessible pattern used on /books: focus trap, Escape-to-close, restored
 * focus, body-scroll lock, safe-area padding, and an active-filter count. Every
 * choice is URL-driven, so it survives navigation and Back/Forward.
 */
export default function PostsMobileFilters({
  basePath,
  total,
  year,
  when,
  sort,
  years,
  hasEvents,
  sortOptions,
}: {
  basePath: string;
  total: number;
  year?: string;
  when?: string;
  sort?: string;
  years: number[];
  hasEvents: boolean;
  sortOptions: Option[];
}) {
  const t = useTranslations("posts");
  const { navigate } = useClientNav();
  const searchParams = useSearchParams();
  const sheetId = useId();
  const [open, setOpen] = useState(false);
  const sheet = useMountTransition(open);

  // Category is handled by the always-visible chip row, so it isn't counted
  // here; the sheet owns year + event-time.
  const activeCount = [year, when].filter(Boolean).length;
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const trapRef = useFocusTrap<HTMLDivElement>(open && sheet.mounted);

  const setParam = useCallback(
    (key: string, value: string | undefined) => {
      const p = new URLSearchParams(searchParams.toString());
      if (value) p.set(key, value);
      else p.delete(key);
      p.delete("page");
      const qs = p.toString();
      navigate(`${basePath}${qs ? `?${qs}` : ""}`);
    },
    [searchParams, navigate, basePath],
  );

  const clearAll = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    ["year", "when", "page"].forEach((k) => p.delete(k));
    const qs = p.toString();
    navigate(`${basePath}${qs ? `?${qs}` : ""}`);
  }, [searchParams, navigate, basePath]);

  const whenOptions: Option[] = [
    { value: "", label: t("eventWhenAll") },
    { value: "upcoming", label: t("eventWhenUpcoming") },
    { value: "past", label: t("eventWhenPast") },
  ];

  return (
    <div className="md:hidden">
      <div className="flex items-center justify-between gap-2">
        <p aria-live="polite" className="min-w-0 flex-1 truncate text-[13px] text-text-muted">
          {total === 0 ? t("noResults") : t("resultCount", { count: total })}
        </p>
        <SortSelect
          value={sort || "newest"}
          options={sortOptions}
          defaultLabel={t("sortLabel")}
          paramKey="sort"
          basePath={basePath}
        />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={sheetId}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-divider bg-paper px-3.5 text-[13px] font-semibold text-text-body transition-colors hover:border-brand/30 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
        >
          <SlidersIcon />
          {t("filtersAction")}
          {activeCount > 0 && (
            <span
              aria-label={t("activeFilterCount", { count: activeCount })}
              className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold leading-none text-brand-contrast"
            >
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {sheet.mounted && (
        <div
          onClick={close}
          aria-hidden="true"
          className="fixed inset-0 z-[60] bg-slate-950/45 backdrop-blur-[2px] transition-opacity duration-200 ease-out motion-reduce:transition-none"
          style={{ opacity: sheet.shown ? 1 : 0 }}
        />
      )}

      {sheet.mounted && (
        <div
          id={sheetId}
          ref={trapRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("filterSheetTitle")}
          inert={!open}
          tabIndex={-1}
          className="fixed inset-x-0 bottom-0 z-[70] flex max-h-[85dvh] flex-col rounded-t-2xl border-t border-divider bg-bg-surface shadow-[0_-10px_32px_rgba(0,0,0,0.18)] outline-none transition-transform duration-[240ms] ease-out motion-reduce:transition-none"
          style={{ transform: sheet.shown ? "translateY(0)" : "translateY(100%)" }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-divider px-4 py-3">
            <h2 className="text-[15px] font-bold text-text-heading">{t("filterSheetTitle")}</h2>
            <button
              type="button"
              onClick={close}
              aria-label={t("done")}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <p aria-live="polite" className="pt-3 text-[12.5px] text-text-muted">
              {total === 0 ? t("noResults") : t("resultCount", { count: total })}
            </p>

            {hasEvents && (
              <fieldset className="mt-4 border-0 p-0">
                <legend className="pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  {t("eventWhenLabel")}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {whenOptions.map((opt) => {
                    const active = (when || "") === opt.value;
                    return (
                      <button
                        key={opt.value || "all"}
                        type="button"
                        onClick={() => setParam("when", opt.value || undefined)}
                        aria-pressed={active}
                        className={pill(active)}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            {years.length > 0 && (
              <fieldset className="mt-4 border-0 p-0">
                <legend className="pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
                  {t("yearLabel")}
                </legend>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setParam("year", undefined)}
                    aria-pressed={!year}
                    className={pill(!year)}
                  >
                    {t("yearAll")}
                  </button>
                  {years.map((y) => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => setParam("year", year === String(y) ? undefined : String(y))}
                      aria-pressed={year === String(y)}
                      className={pill(year === String(y))}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-divider px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={clearAll}
              disabled={activeCount === 0}
              className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-divider px-4 text-sm font-semibold text-text-body transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("clearAll")}
            </button>
            <button
              type="button"
              onClick={close}
              className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover"
            >
              {t("done")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
