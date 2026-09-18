import { getTranslations } from "next-intl/server";
import { BORROWING_ALLOWANCES } from "@/lib/about/content";
import { toAboutLocale, localized } from "@/lib/about/format";

/**
 * The borrowing allowance per audience: who, which material, how many items,
 * how long, and what renewal they get.
 *
 * The value labels are reused from `about.rules.quick` rather than duplicated
 * into the `policy` namespace — /about/rules already names these exact concepts
 * in both languages ("{count} days", "Student teachers", "Books in Khmer"), and
 * a second set of strings for one idea is a second thing to keep in sync. Only
 * the COLUMN headings are new, because that page has no table to head.
 *
 * The renewal wording is the library's own `LocalizedText`, rendered through
 * `localized()` so a string the source supplied in only one language carries
 * the right `lang` attribute — a Khmer sentence read out by an English voice is
 * unintelligible.
 *
 * Server component.
 */
export default async function PolicyAllowances({ locale }: { locale: string }) {
  // Sequential, not Promise.all, and deliberately so: both resolve from the
  // same request-scoped cache, so there is no I/O to overlap — and a
  // destructured `const [t, tq] = await Promise.all(...)` hides the binding
  // from lib/i18n-keys.test.ts, which can then no longer check that these keys
  // exist in the namespace they are asked in.
  const t = await getTranslations("policy.allowances");
  const tq = await getTranslations("about.rules.quick");
  const aboutLocale = toAboutLocale(locale);
  const km = locale === "km";
  const font = km ? "font-khmer-serif" : "";

  const audienceLabel = (audience: string) =>
    audience === "staff" ? tq("forStaff") : tq("forStudents");

  const materialLabel = (key: "khmer" | "english" | "default") =>
    key === "khmer" ? tq("khmerBooks") : key === "english" ? tq("englishBooks") : tq("allBooks");

  const th = `border-b border-divider px-3 py-3 text-[12px] font-semibold uppercase tracking-wide text-text-muted ${font}`;
  const td = "policy-wrap border-b border-divider px-3 py-3 align-top text-text-body";

  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-divider">
      <table className="w-full border-collapse text-left text-[13.5px]">
        <caption className="sr-only">{t("caption")}</caption>
        <thead>
          <tr className="bg-bg-app">
            <th scope="col" className={th}>{t("who")}</th>
            <th scope="col" className={th}>{t("material")}</th>
            <th scope="col" className={th}>{tq("maxItems")}</th>
            <th scope="col" className={th}>{t("period")}</th>
          </tr>
        </thead>
        {/* One <tbody> per audience, which is what makes `scope="rowgroup"`
            true: the audience name heads exactly the rows in its own group.
            In a single shared <tbody> that scope would claim it heads every
            row in the table, including the other audience's. */}
        {BORROWING_ALLOWANCES.map((allowance) => (
          <tbody key={allowance.audience} className="odd:bg-brand/[0.04]">
            {allowance.loanDays.map((loan, i) => {
              const renewal = localized(loan.renewal, aboutLocale);
              return (
                <tr key={loan.key}>
                  {/* An audience can have two loan periods, so its name heads
                      the run once — repeating it would read as two separate
                      groups of borrowers. */}
                  {i === 0 && (
                    <th
                      scope="rowgroup"
                      rowSpan={allowance.loanDays.length}
                      className={`policy-wrap border-b border-divider px-3 py-3 align-top text-left font-semibold text-text-heading ${font}`}
                    >
                      {audienceLabel(allowance.audience)}
                    </th>
                  )}
                  <td className={td}>{materialLabel(loan.key)}</td>
                  {i === 0 && (
                    <td
                      rowSpan={allowance.loanDays.length}
                      className={`${td} tabular-nums`}
                    >
                      {tq("maxItemsValue", { count: allowance.maxItems })}
                    </td>
                  )}
                  <td className={td}>
                    <span className="font-semibold tabular-nums">
                      {tq("days", { count: loan.days })}
                    </span>
                    {renewal && (
                      <span className="mt-0.5 block text-text-muted" lang={renewal.lang}>
                        {renewal.text}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}
