"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import { useClientNav, SortSelect } from "@/components/ui/books/ClientNavWrapper";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useMountTransition } from "@/lib/hooks/useMountTransition";

type SortOption = { value: string; label: string };

/**
 * Mobile-only (`md:hidden`) result toolbar + bottom filter sheet for /books.
 *
 * Filters stay URL-driven: every selection navigates immediately through
 * ClientNavWrapper (same semantics as the desktop selects), so Back/Forward,
 * bookmarks, and "open a book and return" all preserve state for free. The
 * sheet survives those navigations because only searchParams change — the
 * client component instance keeps its `open` state across server re-renders.
 */
export default function MobileFilterSheet({
  basePath,
  total,
  countLabel,
  dept,
  language,
  format,
  sort,
  departments,
  languages,
  formats,
  sortOptions,
}: {
  basePath: string;
  /** Exact DB count for the active filters — used for the empty check only. */
  total: number;
  /** Pre-resolved count text from the server page, so the mobile toolbar and
   *  the desktop header state the same thing. Building it here instead would
   *  be a second place the "N of M" rule could drift. */
  countLabel: string;
  dept?: string;
  language?: string;
  format?: string;
  sort?: string;
  departments: string[];
  languages: string[];
  formats: string[];
  sortOptions: SortOption[];
}) {
  const t = useTranslations("books");
  const { navigate } = useClientNav();
  const searchParams = useSearchParams();
  const sheetId = useId();
  const [open, setOpen] = useState(false);
  const sheet = useMountTransition(open);

  const activeCount = [dept, language, format].filter(Boolean).length;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const trapRef = useFocusTrap<HTMLDivElement>(open && sheet.mounted);

  const setParam = useCallback(
    (key: string, value: string | undefined) => {
      const p = new URLSearchParams(searchParams.toString());
      if (value) p.set(key, value);
      else p.delete(key);
      p.delete("page"); // filter changes always restart at page 1
      const qs = p.toString();
      navigate(`${basePath}${qs ? `?${qs}` : ""}`);
    },
    [searchParams, navigate, basePath],
  );

  const clearAll = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    ["dept", "language", "format", "page"].forEach((k) => p.delete(k));
    const qs = p.toString();
    navigate(`${basePath}${qs ? `?${qs}` : ""}`);
  }, [searchParams, navigate, basePath]);

  const optionPill = (active: boolean) =>
    `rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors min-h-11 ${
      active
        ? "bg-brand text-brand-contrast border-brand"
        : "bg-paper text-text-body border-divider hover:border-brand/30"
    }`;

  return (
    <div className="md:hidden">
      {/* ── Result toolbar ── */}
      <div className="flex items-center justify-between gap-2">
        <p aria-live="polite" className="min-w-0 flex-1 truncate text-[13px] text-text-muted">
          {countLabel}
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
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
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

      {/* ── Overlay ── */}
      {sheet.mounted && (
        <div
          onClick={close}
          aria-hidden="true"
          className="fixed inset-0 z-[60] bg-slate-950/45 backdrop-blur-[2px] transition-opacity duration-200 ease-out motion-reduce:transition-none"
          style={{ opacity: sheet.shown ? 1 : 0 }}
        />
      )}

      {/* ── Bottom sheet ── */}
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
            <h2 className="text-[15px] font-bold text-text-heading">
              {t("filterSheetTitle")}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label={t("done")}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {/* Live count inside the sheet too, so users hear/see the effect
                of each tap without closing it. */}
            <p aria-live="polite" className="pt-3 text-[12.5px] text-text-muted">
              {countLabel}
            </p>

            <FilterGroup label={t("categoryLabel")}>
              <button
                type="button"
                onClick={() => setParam("dept", undefined)}
                aria-pressed={!dept}
                className={optionPill(!dept)}
              >
                {t("allCategories")}
              </button>
              {departments.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setParam("dept", dept === d ? undefined : d)}
                  aria-pressed={dept === d}
                  className={optionPill(dept === d)}
                >
                  {d}
                </button>
              ))}
            </FilterGroup>

            {languages.length > 0 && (
              <FilterGroup label={t("filterLanguage")}>
                <button
                  type="button"
                  onClick={() => setParam("language", undefined)}
                  aria-pressed={!language}
                  className={optionPill(!language)}
                >
                  {t("allOption")}
                </button>
                {languages.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setParam("language", language === l ? undefined : l)}
                    aria-pressed={language === l}
                    className={optionPill(language === l)}
                  >
                    {l}
                  </button>
                ))}
              </FilterGroup>
            )}

            {formats.length > 0 && (
              <FilterGroup label={t("filterFormat")}>
                <button
                  type="button"
                  onClick={() => setParam("format", undefined)}
                  aria-pressed={!format}
                  className={optionPill(!format)}
                >
                  {t("allOption")}
                </button>
                {formats.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setParam("format", format === f ? undefined : f)}
                    aria-pressed={format === f}
                    className={optionPill(format === f)}
                  >
                    {f}
                  </button>
                ))}
              </FilterGroup>
            )}

            <FilterGroup label={t("sortLabel")}>
              {sortOptions.map((opt) => {
                const active = (sort || "newest") === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setParam("sort", opt.value)}
                    aria-pressed={active}
                    className={optionPill(active)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </FilterGroup>
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

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-4 border-0 p-0">
      <legend className="pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}
