import { BadgeCheck, Flag, ShieldQuestion } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { LABEL } from "./styles";

/**
 * About this record: how far it has been checked, how much it has been used,
 * and where to report a mistake.
 *
 * Verification lives here and nowhere else on the page (it used to be a hero
 * badge, a sidebar callout and a citation warning at once). An unverified
 * thesis is the normal state of a fresh deposit, not a fault, so it reads as
 * a note with an action. The counts are the stored counts, set in full with
 * the locale's separators — "1,284", not "1.3K".
 */
export default function RecordStatus({
  verifiedAt,
  views,
  downloads,
  reportHref,
}: {
  verifiedAt: string | null;
  views: number;
  downloads: number;
  reportHref: string;
}) {
  const t = useTranslations("thesisDetail");
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale === "km" ? "km-KH" : "en-GB");
  const verified = Boolean(verifiedAt);
  const verifiedOn = verifiedAt
    ? new Date(verifiedAt).toLocaleDateString(locale === "km" ? "km-KH" : "en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <section aria-labelledby="record-status-heading" className="rounded-xl border border-border bg-bg-surface p-5">
      <h2 id="record-status-heading" className={LABEL}>
        {t("statusHeading")}
      </h2>

      <ul className="mt-4 grid gap-2 text-[13.5px] leading-5 text-text-body">
        <li className="flex items-start gap-2">
          {verified ? (
            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          )}
          <p className="min-w-0">
            <strong className="block font-semibold text-text-heading">
              {verified ? t("statusVerifiedOn", { date: verifiedOn ?? "" }) : t("statusUnverified")}
            </strong>
            {verified ? t("statusVerifiedNote") : t("statusUnverifiedNote")}
          </p>
        </li>
      </ul>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-paper p-3">
          <dt className={LABEL}>{t("statusViews")}</dt>
          <dd className="mt-0.5 text-[20px] font-semibold leading-[26px] tabular-nums text-text-heading">
            {number.format(views)}
          </dd>
        </div>
        <div className="rounded-lg bg-paper p-3">
          <dt className={LABEL}>{t("statusDownloads")}</dt>
          <dd className="mt-0.5 text-[20px] font-semibold leading-[26px] tabular-nums text-text-heading">
            {number.format(downloads)}
          </dd>
        </div>
      </dl>

      <a
        href={reportHref}
        className="mt-4 inline-flex items-center gap-1.5 rounded-sm text-[13px] font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
      >
        <Flag className="h-4 w-4" aria-hidden="true" />
        {t("statusReport")}
      </a>
    </section>
  );
}
