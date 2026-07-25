import { getTranslations } from "next-intl/server";
import {
  PRIVACY_TABLE_ROWS,
  PRIVACY_TABLE_COLUMNS,
  type PrivacyTableColumn,
} from "@/lib/privacy/policy";

/**
 * The data-practice table. On lg+ it is a real semantic <table> with a caption
 * and scoped row/column headers. On small screens the same rows render as
 * stacked definition-list cards (the table is `hidden`, so screen readers see
 * exactly one copy). Both are driven from the same PRIVACY_TABLE_ROWS source,
 * so they can never drift.
 */
export default async function PrivacyDataTable({ km }: { km: boolean }) {
  const t = await getTranslations("privacy.table");
  const headingFont = km ? "font-khmer-serif" : "";

  const columns = PRIVACY_TABLE_COLUMNS;
  const col = (c: PrivacyTableColumn) => t(`columns.${c}`);

  return (
    <div className="mt-6">
      {/* Desktop / tablet: semantic table */}
      <div className="privacy-table-desktop hidden overflow-x-auto rounded-2xl border border-divider lg:block">
        <table className="w-full border-collapse text-left text-[13.5px]">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr className="bg-bg-app">
              {columns.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className={`border-b border-divider px-3 py-3 align-bottom text-[12px] font-semibold uppercase tracking-wide text-text-muted ${headingFont}`}
                >
                  {col(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PRIVACY_TABLE_ROWS.map((row) => (
              <tr key={row} className="odd:bg-bg-surface even:bg-bg-app/40">
                <th
                  scope="row"
                  className="border-b border-divider px-3 py-3 align-top text-[13.5px] font-semibold text-text-heading"
                >
                  {t(`rows.${row}.category`)}
                </th>
                {columns.slice(1).map((c) => (
                  <td
                    key={c}
                    className="border-b border-divider px-3 py-3 align-top leading-snug text-text-body"
                  >
                    {t(`rows.${row}.${c}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <ul className="privacy-table-mobile space-y-4 lg:hidden">
        {PRIVACY_TABLE_ROWS.map((row) => (
          <li
            key={row}
            className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm"
          >
            <h3 className={`text-[15px] font-semibold text-text-heading ${headingFont}`}>
              {t(`rows.${row}.category`)}
            </h3>
            <dl className="mt-3 grid grid-cols-[minmax(0,7rem)_1fr] gap-x-3 gap-y-2 text-[13.5px]">
              {columns.slice(1).map((c) => (
                <div key={c} className="contents">
                  <dt className="font-medium text-text-muted">{col(c)}</dt>
                  <dd className="text-text-body">{t(`rows.${row}.${c}`)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
