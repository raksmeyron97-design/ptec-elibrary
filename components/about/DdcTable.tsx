// components/about/DdcTable.tsx
//
// The accessible data-table equivalent of <DdcExplorer>'s bar chart. Both are
// rendered on /about/collection; this one is the canonical, copy-pasteable,
// screen-reader-friendly view of the same numbers, and it is a SERVER
// component so the table costs nothing in the client bundle.
//
// It also carries the honest reporting the source data requires:
//   • DDC 800 appears TWICE in the library's records (literature/rhetoric and
//     fiction). Both rows are shown exactly as supplied, each flagged in a
//     text column, rather than one being silently renumbered.
//   • School textbooks are not a Dewey class at all; the row is marked as a
//     local grouping so the "Total" is not read as a total of Dewey classes.

import { formatNumber, localized, percentOf, type AboutLocale } from "@/lib/about/format";
import type { DdcCategory } from "@/lib/about/types";

export default function DdcTable({
  categories,
  locale,
  labels,
}: {
  categories: DdcCategory[];
  locale: AboutLocale;
  labels: {
    caption: string;
    code: string;
    category: string;
    titles: string;
    share: string;
    total: string;
    localGrouping: string;
    codeConflict: string;
  };
}) {
  const total = categories.reduce((sum, c) => sum + c.titles, 0);

  return (
    <div
      className="overflow-x-auto rounded-2xl border border-divider bg-bg-surface shadow-sm"
      tabIndex={0}
      role="region"
      aria-label={labels.caption}
    >
      <table className="w-full min-w-[34rem] border-collapse text-left">
        <caption className="sr-only">{labels.caption}</caption>
        <thead>
          <tr className="border-b border-divider bg-paper">
            <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {labels.code}
            </th>
            <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
              {labels.category}
            </th>
            <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">
              {labels.titles}
            </th>
            <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">
              {labels.share}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-divider">
          {categories.map((category) => {
            const title = localized(category.title, locale);
            return (
              <tr key={category.id}>
                <td className="px-4 py-3 align-top">
                  <span className="text-sm font-semibold tabular-nums text-text-heading">
                    {category.code}
                  </span>
                </td>
                {/* The subject is the row's header cell — screen readers then
                    announce it with each figure in the row. */}
                <th scope="row" className="px-4 py-3 text-left align-top font-normal">
                  {title && (
                    <span lang={title.lang} className="about-wrap text-sm font-medium text-text-heading">
                      {title.text}
                    </span>
                  )}
                  {(category.isLocalGrouping || category.hasCodeConflict) && (
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {category.isLocalGrouping && (
                        <span className="inline-flex rounded-full border border-divider bg-paper px-2 py-0.5 text-[10px] font-medium text-text-muted">
                          {labels.localGrouping}
                        </span>
                      )}
                      {category.hasCodeConflict && (
                        <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                          {labels.codeConflict}
                        </span>
                      )}
                    </span>
                  )}
                </th>
                <td className="px-4 py-3 text-right align-top text-sm font-medium tabular-nums text-text-heading">
                  {formatNumber(category.titles, locale)}
                </td>
                <td className="px-4 py-3 text-right align-top text-sm tabular-nums text-text-muted">
                  {percentOf(category.titles, total).toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-divider bg-paper">
            <td className="px-4 py-3" />
            <th scope="row" className="px-4 py-3 text-left text-sm font-semibold text-text-heading">
              {labels.total}
            </th>
            <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-text-heading">
              {formatNumber(total, locale)}
            </td>
            <td className="px-4 py-3 text-right text-sm tabular-nums text-text-muted">100%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
