"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { SEARCH_RANGES, type SearchRange } from "@/lib/admin/search-insights-shared";

/**
 * The one control that scopes the whole page.
 *
 * Range and comparison live in the URL, so a view is bookmarkable and every
 * section below re-renders against the same window — the page previously had
 * no date control at all and each section carried its own hard-coded period.
 *
 * Refresh is `router.refresh()`, not a reload: the server components re-run
 * and the DOM is reconciled, so scroll position, open menus and focus survive.
 */
export default function InsightsToolbar({
  range,
  compare,
  generatedAt,
}: {
  range: SearchRange;
  compare: boolean;
  generatedAt: string;
}) {
  const t = useTranslations("adminSearchInsights.toolbar");
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [age, setAge] = useState<string>("");

  // "Updated just now" has to keep counting without re-rendering the tree.
  useEffect(() => {
    const tick = () => {
      const minutes = Math.floor((Date.now() - new Date(generatedAt).getTime()) / 60_000);
      setAge(minutes < 1 ? t("justNow") : t("minutesAgo", { count: minutes }));
    };
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [generatedAt, t]);

  const push = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    // Any scope change invalidates both tables' page numbers.
    next.delete("page");
    next.delete("apage");
    startTransition(() => router.push(`?${next.toString()}`, { scroll: false }));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="dash-seg" role="group" aria-label={t("rangeLabel")}>
        {SEARCH_RANGES.filter((value) => value !== "custom").map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={range === value}
            data-active={range === value}
            onClick={() => push((next) => {
              next.set("range", value);
              next.delete("from");
              next.delete("to");
            })}
            className="dash-seg-btn text-[11.5px]"
          >
            {t(`range.${value}`)}
          </button>
        ))}
      </div>

      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-divider px-2.5 py-1.5 text-[11.5px] font-semibold text-text-body">
        <input
          type="checkbox"
          checked={compare}
          onChange={(event) => push((next) => {
            if (event.target.checked) next.delete("compare");
            else next.set("compare", "off");
          })}
          className="h-3.5 w-3.5 accent-[var(--ptec-brand)]"
        />
        {t("compare")}
      </label>

      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg border border-divider px-2.5 py-1.5 text-[11.5px] font-semibold text-text-body transition hover:border-brand/40 hover:text-brand disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} aria-hidden="true" />
        {t("refresh")}
      </button>

      <p className="text-[11px] text-text-muted" aria-live="polite">{age}</p>
    </div>
  );
}
