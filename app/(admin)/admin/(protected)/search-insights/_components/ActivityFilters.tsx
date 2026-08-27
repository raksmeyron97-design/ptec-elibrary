"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import {
  ACTIVITY_RESULT_FILTERS,
  PAGE_SIZES,
  SEARCH_LANGUAGES,
} from "@/lib/admin/search-insights-shared";

const FIELD =
  "h-9 rounded-lg border border-divider bg-bg-surface px-2.5 text-[12.5px] text-text-body transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/** Filters for the raw search log. Separate URL keys from the zero-result
 *  workspace (`a*` prefix) so the two tables page independently. */
export default function ActivityFilters({
  aq,
  alang,
  astatus,
  atype,
  asize,
  resourceTypes,
}: {
  aq: string;
  alang: string;
  astatus: string;
  atype: string;
  asize: number;
  resourceTypes: string[];
}) {
  const t = useTranslations("adminSearchInsights.activity");
  const router = useRouter();
  const params = useSearchParams();
  const [term, setTerm] = useState(aq);
  const initial = useRef(true);

  // `aq` changes when navigation (back/forward, another control) rewrites the
  // URL out from under the debounced input — adjust the local echo during
  // render rather than in an effect, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevAq, setPrevAq] = useState(aq);
  if (aq !== prevAq) {
    setPrevAq(aq);
    setTerm(aq);
  }

  const push = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    next.delete("apage");
    router.push(`?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    if (term === aq) return;
    const timer = setTimeout(() => {
      push((next) => {
        if (term.trim()) next.set("aq", term.trim());
        else next.delete("aq");
      });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-divider px-5 py-3">
      <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          dir="auto"
          className={`${FIELD} w-full ps-8`}
        />
      </div>

      <label className="sr-only" htmlFor="activity-status">{t("statusLabel")}</label>
      <select
        id="activity-status"
        value={astatus}
        onChange={(event) => push((next) => {
          if (event.target.value === "all") next.delete("astatus");
          else next.set("astatus", event.target.value);
        })}
        className={FIELD}
      >
        {ACTIVITY_RESULT_FILTERS.map((value) => (
          <option key={value} value={value}>{t(`resultStatus.${value}`)}</option>
        ))}
      </select>

      <label className="sr-only" htmlFor="activity-lang">{t("languageLabel")}</label>
      <select
        id="activity-lang"
        value={alang}
        onChange={(event) => push((next) => {
          if (event.target.value === "all") next.delete("alang");
          else next.set("alang", event.target.value);
        })}
        className={FIELD}
      >
        {SEARCH_LANGUAGES.map((value) => (
          <option key={value} value={value}>{t(`language.${value}`)}</option>
        ))}
      </select>

      {resourceTypes.length > 0 && (
        <>
          <label className="sr-only" htmlFor="activity-type">{t("typeLabel")}</label>
          <select
            id="activity-type"
            value={atype}
            onChange={(event) => push((next) => {
              if (event.target.value === "all") next.delete("atype");
              else next.set("atype", event.target.value);
            })}
            className={FIELD}
          >
            <option value="all">{t("allTypes")}</option>
            {resourceTypes.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </>
      )}

      <label className="sr-only" htmlFor="activity-size">{t("rowsLabel")}</label>
      <select
        id="activity-size"
        value={asize}
        onChange={(event) => push((next) => {
          if (Number(event.target.value) === 10) next.delete("asize");
          else next.set("asize", event.target.value);
        })}
        className={FIELD}
      >
        {PAGE_SIZES.map((value) => (
          <option key={value} value={value}>{t("rowsPerPage", { count: value })}</option>
        ))}
      </select>
    </div>
  );
}
