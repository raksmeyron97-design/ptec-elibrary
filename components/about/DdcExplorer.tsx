"use client";

// components/about/DdcExplorer.tsx
//
// The subject-class explorer on /about/collection.
//
// ── Why this is not a chart library ──
// The visual is twelve horizontal bars. A charting dependency for that would
// add tens of kilobytes to a public page to draw twelve <div>s with a width
// percentage — so the bars are CSS, and every value is real text in the DOM.
//
// ── Accessibility ──
// The "chart" is a list of BUTTONS, not an SVG. That means:
//   • every value is already readable by a screen reader, in reading order;
//   • every bar is keyboard-focusable and operable with Enter/Space for free;
//   • `aria-pressed` communicates which class is selected.
// A semantic <table> with the same numbers is rendered by <DdcTable> below,
// so the visualization is never the only route to the data.
//
// Colour carries NO meaning here: every bar is the same brand colour, and the
// selected state is signalled by a ring, a filled background and
// `aria-pressed` — not by hue. Twelve colour-coded categories would fail
// contrast somewhere and mean nothing to a colour-blind reader anyway.
//
// URL state uses replaceState: a reader clicking through five classes should
// not have to press Back five times to leave the page.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import type { DdcCategory } from "@/lib/about/types";
import { barWidth, formatNumber, localized, percentOf, type AboutLocale } from "@/lib/about/format";

const QUERY_KEY = "class";

export default function DdcExplorer({
  categories,
  locale,
}: {
  categories: DdcCategory[];
  locale: AboutLocale;
}) {
  const t = useTranslations("about.collection.ddc");
  const total = categories.reduce((sum, c) => sum + c.titles, 0);
  const max = categories.reduce((peak, c) => Math.max(peak, c.titles), 0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Read the deep link after mount only — the page is prerendered, so reading
  // a search param during render would desynchronise server and client markup.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get(QUERY_KEY);
    if (param && categories.some((c) => c.id === param)) setSelectedId(param);
  }, [categories]);

  const select = useCallback((id: string) => {
    setSelectedId((current) => {
      const next = current === id ? null : id;
      const url = new URL(window.location.href);
      if (next) url.searchParams.set(QUERY_KEY, next);
      else url.searchParams.delete(QUERY_KEY);
      window.history.replaceState(null, "", url);
      return next;
    });
  }, []);

  const selected = categories.find((c) => c.id === selectedId) ?? null;
  const selectedTitle = localized(selected?.title, locale);
  const selectedScope = localized(selected?.scope, locale);

  return (
    <div>
      <ul aria-label={t("chartLabel")} className="space-y-1.5">
        {categories.map((category) => {
          const title = localized(category.title, locale);
          const isSelected = category.id === selectedId;
          const count = formatNumber(category.titles, locale);
          if (!title) return null;

          return (
            <li key={category.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => select(category.id)}
                className={[
                  "group flex w-full min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                                    isSelected
                    ? "border-brand bg-surface-brand-soft ring-1 ring-brand"
                    : "border-transparent hover:border-divider hover:bg-paper",
                ].join(" ")}
              >
                <span
                  className={`w-11 shrink-0 rounded-md px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums ${
                    category.isLocalGrouping
                      ? "bg-paper text-text-muted"
                      : "bg-brand/10 text-brand"
                  }`}
                >
                  {category.code}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    lang={title.lang}
                    className="about-wrap block text-sm font-medium text-text-heading"
                  >
                    {title.text}
                  </span>
                  {/* The bar is decorative: the number beside it is the
                      actual value, so hiding the bar loses nothing. */}
                  <span
                    aria-hidden="true"
                    className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-paper"
                  >
                    <span
                      className="block h-full rounded-full bg-brand/70 transition-[width] duration-300 group-hover:bg-brand motion-reduce:transition-none"
                      style={{ width: barWidth(category.titles, max) }}
                    />
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold tabular-nums text-text-heading">
                    {count}
                  </span>
                  <span className="block text-[11px] tabular-nums text-text-muted">
                    {percentOf(category.titles, total).toFixed(1)}%
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Detail panel for the selected class. aria-live so a keyboard or
          screen-reader user learns that pressing a bar produced content
          further down the page. */}
      <div aria-live="polite" className="mt-4">
        {selected && selectedTitle && (
          <div className="rounded-2xl border border-brand/30 bg-surface-brand-soft p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">
              {t("colCode")} {selected.code}
            </p>
            <h3 lang={selectedTitle.lang} className="about-wrap mt-1 text-lg font-semibold text-text-heading">
              {selectedTitle.text}
            </h3>
            {selectedScope && (
              <p lang={selectedScope.lang} className="about-copy mt-2 text-sm text-text-body">
                {selectedScope.text}
              </p>
            )}
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-text-muted">{t("colTitles")}</dt>
                <dd className="text-lg font-semibold tabular-nums text-text-heading">
                  {formatNumber(selected.titles, locale)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-text-muted">{t("colShare")}</dt>
                <dd className="text-lg font-semibold tabular-nums text-text-heading">
                  {percentOf(selected.titles, total).toFixed(1)}%
                </dd>
              </div>
            </dl>

            {/* Flags rendered as text, never as a colour cue. */}
            {(selected.isLocalGrouping || selected.hasCodeConflict) && (
              <p className="mt-4 flex gap-2 border-t border-brand/20 pt-3 text-xs text-text-muted">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {selected.isLocalGrouping && t("localGroupingHint")}
                  {selected.isLocalGrouping && selected.hasCodeConflict && " "}
                  {selected.hasCodeConflict && t("codeConflictHint")}
                </span>
              </p>
            )}

            {/* No "browse this class in the catalogue" action: the public
                catalogue has no DDC facet, so the button would go nowhere.
                Add it here the day that filter exists. */}
          </div>
        )}
      </div>
    </div>
  );
}
