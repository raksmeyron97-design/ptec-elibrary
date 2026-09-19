import { getTranslations } from "next-intl/server";
import { ChevronDown } from "lucide-react";
import {
  PRIVACY_FILTERS,
  PRIVACY_ROW_META,
  PRIVACY_TABLE_ROWS,
  type PrivacyTableRowId,
  type PrivacyVisibility,
} from "@/lib/privacy/policy";
import Chip, { type ChipTone } from "@/components/policy/Chip";
import PrivacyTableController from "./PrivacyTableController";

/**
 * The data-practice table: ten categories, one row each.
 *
 * SHAPE. It replaced ten repeated cards, and the shape is the argument — the
 * question a reader brings to this section is comparative ("which of these can
 * anyone see?", "what is kept longest?"), and ten cards can only be answered by
 * reading all ten. A table answers it by scanning one column.
 *
 * Five columns carry the comparison; `source` and `sharing` are the follow-up
 * questions and live in an expandable detail row, so the scannable columns stay
 * scannable at a phone's width.
 *
 * COLOUR IS NEVER THE SIGNAL. The visibility chip carries an icon shape and its
 * full text label as well as its colour, and the retention tint sits behind a
 * cell that still prints the actual retention in words. Remove every colour
 * from this table and nothing becomes unanswerable.
 *
 * RENDERING. Server component, every row present in the HTML. The filtering and
 * the expansion are attached afterwards by PrivacyTableController, which owns
 * the reasoning for why they are not React state.
 */

/** Chip tone per visibility class — the one mapping, used by both surfaces. */
const TONE: Record<PrivacyVisibility, ChipTone> = {
  private: "private",
  shared: "shared",
  public: "public",
  steward: "steward",
};

/** The five columns that stay in the table, in display order. `category` is the
 *  row header; `source` and `sharing` are in the detail row. */
const VISIBLE_COLUMNS = ["examples", "purpose", "retention", "access"] as const;

/** Which of the two renderings a node belongs to. */
type Surface = "table" | "card";

export default async function PrivacyDataTable({ km }: { km: boolean }) {
  const t = await getTranslations("privacy.table");
  const headingFont = km ? "font-khmer-serif" : "";

  // Ids and toggle handles are scoped to their SURFACE. The desktop table and
  // the mobile card list render the same ten categories, so an id built from
  // the row alone appears twice in the document — which makes `aria-controls`
  // point at whichever copy the browser found first, and that is the one that
  // is `display: none`.
  const detailId = (row: string, surface: Surface) => `privacy-detail-${surface}-${row}`;
  const handle = (row: string, surface: Surface) => `${row}:${surface}`;

  /** Server-rendered row attributes the controller reads back. Keeping them
   *  here means the classification is written once per row and both the table
   *  and the mobile card get the identical set. */
  const rowAttrs = (row: PrivacyTableRowId, surface: Surface) => {
    const meta = PRIVACY_ROW_META[row];
    return {
      "data-filter-row": "",
      "data-row-id": row,
      "data-surface": surface,
      "data-visibility": meta.visibility,
      "data-source": meta.source,
      "data-retention": meta.retention,
    } as const;
  };

  const visibilityChip = (row: PrivacyTableRowId) => (
    <Chip
      tone={TONE[PRIVACY_ROW_META[row].visibility]}
      label={t(`visibility.${PRIVACY_ROW_META[row].visibility}`)}
      km={km}
    />
  );

  /** The expand control. `aria-controls` points at the detail row; it starts
   *  collapsed and the controller flips `aria-expanded` with the row. */
  const toggle = (row: PrivacyTableRowId, surface: Surface, className = "") => (
    <button
      type="button"
      data-row-toggle={handle(row, surface)}
      aria-expanded="false"
      aria-controls={detailId(row, surface)}
      className={`inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg border border-divider px-2.5 py-1.5 text-[12.5px] font-medium text-text-muted transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface [&[aria-expanded=true]_svg]:rotate-180 ${className}`}
    >
      {/* The accessible name states WHICH category, because ten buttons all
          named "Details" are ten identical entries in a screen reader's
          controls list. */}
      <span className="sr-only">{t("detailsLabel", { category: t(`rows.${row}.category`) })}</span>
      <span aria-hidden="true">{t("detailsShort")}</span>
      <ChevronDown
        className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none"
        aria-hidden="true"
      />
    </button>
  );

  /** Source / exact access wording / shared-with — the follow-up questions. */
  const detailBody = (row: PrivacyTableRowId) => (
    <dl className="grid gap-x-4 gap-y-2 text-[13px] sm:grid-cols-3">
      {(["source", "access", "sharing"] as const).map((c) => (
        <div key={c}>
          <dt className={`font-semibold text-text-muted ${headingFont}`}>{t(`columns.${c}`)}</dt>
          <dd className="policy-wrap mt-0.5 text-text-body">{t(`rows.${row}.${c}`)}</dd>
        </div>
      ))}
    </dl>
  );

  // `t.raw` hands the template over with its `{shown}`/`{total}` placeholders
  // intact — the controller substitutes the counts in the browser. Calling
  // `t()` here would need those numbers, which only exist after a filter runs.
  const statusTemplate = String(t.raw("filterStatus"));

  return (
    <PrivacyTableController statusTemplate={statusTemplate}>
      <div className="mt-6">
        {/* ── Legend ──────────────────────────────────────────────────────
            Above the table, not below it: a key a reader meets after the
            thing it explains is a key they have already worked around. */}
        <div className="rounded-xl border border-divider bg-bg-app/50 p-4">
          <p className={`text-[13px] font-semibold text-text-heading ${headingFont}`}>
            {t("legend.title")}
          </p>
          <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-2">
            {(Object.keys(TONE) as PrivacyVisibility[]).map((v) => (
              <li key={v} className="flex items-center gap-2">
                <Chip tone={TONE[v]} label={t(`visibility.${v}`)} km={km} />
                <span className="text-[12.5px] text-text-muted">{t(`visibility.${v}Hint`)}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Filters ─────────────────────────────────────────────────────
            Toggle buttons, not links: the filter changes what is shown on
            this page and navigates nowhere. `aria-pressed` carries the state
            and CSS draws it, so pressing one re-renders nothing. */}
        <div
          className="mt-5 flex flex-wrap items-center gap-2"
          role="group"
          aria-label={t("filterLabel")}
          data-policy-print="hide"
        >
          {PRIVACY_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              data-filter={f}
              aria-pressed={f === "all"}
              className={`min-h-9 cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app border-divider text-text-body hover:border-brand/40 hover:text-brand aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-brand-contrast aria-pressed:hover:text-brand-contrast ${headingFont}`}
            >
              {t(`filters.${f}`)}
            </button>
          ))}
          {/* Announced, never drawn: the visible answer to "did that work?" is
              the table itself shrinking. A screen-reader user cannot see that,
              so the count is spoken. `polite` so it waits for the reader. */}
          <p
            data-filter-status=""
            role="status"
            aria-live="polite"
            className="sr-only"
          />
        </div>

        {/* ── Desktop / tablet: the semantic table ────────────────────── */}
        <div className="privacy-table-desktop mt-4 hidden overflow-x-auto rounded-2xl border border-divider lg:block">
          <table className="w-full border-collapse text-left text-[13.5px]">
            <caption className="sr-only">{t("caption")}</caption>
            <thead>
              <tr className="bg-bg-app">
                <th
                  scope="col"
                  className={`border-b border-divider px-3 py-3 align-bottom text-[12px] font-semibold uppercase tracking-wide text-text-muted ${headingFont}`}
                >
                  {t("columns.category")}
                </th>
                {VISIBLE_COLUMNS.map((c) => (
                  <th
                    key={c}
                    scope="col"
                    className={`whitespace-nowrap border-b border-divider px-3 py-3 align-bottom text-[12px] font-semibold uppercase tracking-wide text-text-muted ${headingFont}`}
                  >
                    {/* The visibility column is headed "Visibility", not
                        "Who can access it": a five-word header sets the
                        column's minimum width in an auto table layout, and it
                        was taking ~150px more than the chips inside it need —
                        squeezing the three prose columns that carry the
                        actual answers. The full question survives as the
                        label on the expanded detail row, where it has room. */}
                    {c === "access" ? t("columns.visibility") : t(`columns.${c}`)}
                  </th>
                ))}
                <th scope="col" className="border-b border-divider px-3 py-3">
                  <span className="sr-only">{t("columns.details")}</span>
                </th>
              </tr>
            </thead>
            {/* One <tbody> per category, not one wrapping all ten. A table
                may hold many <tbody> elements but they may not nest, and the
                pair (category row + its detail row) is exactly the unit that
                should stripe together and stay together across a page break. */}
            {PRIVACY_TABLE_ROWS.map((row) => (
              <tbody key={row} className="odd:bg-brand/[0.04]">
                  <tr
                    {...rowAttrs(row, "table")}
                    className="transition-colors duration-150 hover:bg-brand/[0.09]"
                  >
                    <th
                      scope="row"
                      // A floor on the category column. Without it the auto
                      // table layout gives the two content-sized columns on the
                      // right their width first and squeezes this one until
                      // single words no longer fit on a line.
                      className={`policy-wrap min-w-[8.5rem] border-b border-divider px-3 py-3 align-top text-[13.5px] font-semibold text-text-heading ${headingFont}`}
                    >
                      {t(`rows.${row}.category`)}
                    </th>
                    <td className="border-b border-divider px-3 py-3 align-top leading-snug text-text-body">
                      {t(`rows.${row}.examples`)}
                    </td>
                    <td className="border-b border-divider px-3 py-3 align-top leading-snug text-text-body">
                      {t(`rows.${row}.purpose`)}
                    </td>
                    <td
                      className="retention-tint border-b border-divider px-3 py-3 align-top leading-snug text-text-body"
                      data-tier={PRIVACY_ROW_META[row].retention}
                    >
                      {t(`rows.${row}.retention`)}
                    </td>
                    {/* `w-px` + a nowrap child is the "size to content" idiom:
                        the chip and the button take exactly what they need and
                        the four prose columns keep the rest. */}
                    <td className="w-px border-b border-divider px-3 py-3 align-top">
                      {visibilityChip(row)}
                    </td>
                    <td className="w-px whitespace-nowrap border-b border-divider px-3 py-3 align-top text-right">
                      {toggle(row, "table")}
                    </td>
                  </tr>
                  <tr
                    id={detailId(row, "table")}
                    data-detail-for={handle(row, "table")}
                    hidden
                    className="bg-bg-app/40"
                  >
                    <td colSpan={6} className="border-b border-divider px-3 py-3">
                      {detailBody(row)}
                    </td>
                  </tr>
              </tbody>
            ))}
          </table>
        </div>

        {/* ── Mobile: the same ten categories as cards ────────────────────
            A five-column table at 360px is a horizontal scroll nobody makes.
            Driven from the same source, so the two can never drift; only one
            is in the accessibility tree at a time because the other is
            `display: none`. */}
        <ul className="privacy-table-mobile mt-4 space-y-4 lg:hidden">
          {PRIVACY_TABLE_ROWS.map((row) => (
            <li
              key={row}
              {...rowAttrs(row, "card")}
              className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3
                  className={`policy-wrap text-[15px] font-semibold text-text-heading ${headingFont}`}
                >
                  {t(`rows.${row}.category`)}
                </h3>
                {visibilityChip(row)}
              </div>
              <dl className="mt-3 grid grid-cols-[minmax(0,6.5rem)_1fr] gap-x-3 gap-y-2 text-[13.5px]">
                {(["examples", "purpose"] as const).map((c) => (
                  <div key={c} className="contents">
                    <dt className="font-medium text-text-muted">{t(`columns.${c}`)}</dt>
                    <dd className="policy-wrap text-text-body">{t(`rows.${row}.${c}`)}</dd>
                  </div>
                ))}
                <div className="contents">
                  <dt className="font-medium text-text-muted">{t("columns.retention")}</dt>
                  <dd
                    className="retention-tint policy-wrap -my-0.5 rounded-r px-2 py-0.5 text-text-body"
                    data-tier={PRIVACY_ROW_META[row].retention}
                  >
                    {t(`rows.${row}.retention`)}
                  </dd>
                </div>
              </dl>
              <div className="mt-3">{toggle(row, "card", "w-full justify-center")}</div>
              <div
                id={detailId(row, "card")}
                data-detail-for={handle(row, "card")}
                hidden
                className="mt-3 border-t border-divider pt-3"
              >
                {detailBody(row)}
              </div>
            </li>
          ))}
        </ul>

        {/* Only ever seen if a filter matches nothing. It cannot today — every
            filter has at least one row — but a category added later could make
            one empty, and an empty table with no explanation reads as broken. */}
        <p
          data-filter-empty=""
          hidden
          className="mt-4 rounded-xl border border-divider bg-bg-app/60 px-4 py-6 text-center text-[14px] text-text-muted"
        >
          {t("noResults")}
        </p>
      </div>
    </PrivacyTableController>
  );
}
