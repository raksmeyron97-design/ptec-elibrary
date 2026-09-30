"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { RelatedReason, RelatedThesis } from "@/lib/theses/record";
import { scriptOf } from "@/lib/theses/script";
import { SECTION_HEADING } from "./styles";

const REASON_KEY: Record<RelatedReason, string> = {
  advisor: "reasonAdvisor",
  cohort: "reasonCohort",
  faculty: "reasonFaculty",
};

/**
 * Related theses, each with the reason it is here — the same advisor, the
 * same program and cohort, the same program and faculty (lib/theses/
 * record.server.ts). A reason with no theses is not offered, and a record
 * with none at all renders nothing: the old section topped itself up with
 * "popular" theses related to nothing, and printed an empty state otherwise.
 *
 * The reasons are filters over one grid. Every card is in the HTML; a filter
 * only hides the others.
 */
export default function RelatedTheses({ items }: { items: RelatedThesis[] }) {
  const t = useTranslations("thesisDetail");
  const [filter, setFilter] = useState<RelatedReason | "all">("all");
  if (items.length === 0) return null;

  const reasons = (Object.keys(REASON_KEY) as RelatedReason[]).filter((r) => items.some((i) => i.reason === r));
  const chip = (current: boolean) =>
    `inline-flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-[13.5px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 ${
      current ? "border-info-line bg-info-soft text-info-text" : "border-border bg-bg-surface text-text-heading hover:border-brand hover:text-brand"
    }`;

  return (
    <section aria-labelledby="related-theses-heading" className="mt-14">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="related-theses-heading" className={SECTION_HEADING}>
          {t("relatedTitle")}
        </h2>
        <Link
          href="/theses"
          className="rounded-sm text-[13.5px] font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          {t("relatedBrowseAll")}
        </Link>
      </div>

      {reasons.length > 1 && (
        <div role="group" aria-label={t("relatedFilter")} className="mt-3 flex flex-wrap gap-2">
          <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")} className={chip(filter === "all")}>
            {t("relatedAll")}
            <span className={`ml-1.5 tabular-nums ${filter === "all" ? "" : "text-text-muted"}`}>{items.length}</span>
          </button>
          {reasons.map((r) => (
            <button key={r} type="button" aria-pressed={filter === r} onClick={() => setFilter(r)} className={chip(filter === r)}>
              {t(REASON_KEY[r])}
              <span className={`ml-1.5 tabular-nums ${filter === r ? "" : "text-text-muted"}`}>
                {items.filter((i) => i.reason === r).length}
              </span>
            </button>
          ))}
        </div>
      )}

      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.slug} hidden={filter !== "all" && item.reason !== filter}>
            <Link
              href={`/theses/${item.slug}`}
              className="flex h-full flex-col gap-2 rounded-xl border border-border bg-bg-surface p-5 transition-[box-shadow,border-color] duration-150 hover:border-surface-brand-line hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
            >
              <h3 className="line-clamp-3 font-record text-[17px] font-semibold leading-6 text-text-heading [&:lang(km)]:font-kh" lang={scriptOf(item.title)}>
                {item.title}
              </h3>
              {(item.byline || item.academicYear) && (
                <p className="text-[13.5px] leading-5 text-text-muted">
                  {[item.byline, item.academicYear].filter(Boolean).join(" · ")}
                </p>
              )}
              <p className="mt-auto pt-2 text-[12.5px] font-medium leading-[18px] text-text-muted">{t(REASON_KEY[item.reason])}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
