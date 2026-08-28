import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Copy, Eye, Fingerprint, Library, ScanSearch } from "lucide-react";
import type { DuplicateConfidence } from "@/lib/admin/duplicates";
import type { DuplicateSummary as Summary } from "@/lib/admin/duplicate-review";

/**
 * The five figures at the top of the workspace. Every count is derived from
 * the detector's own groups — nothing here is estimated, and the three
 * confidence tiles double as the primary filter, so the overview and the queue
 * can never disagree about how many high-confidence groups exist.
 */

type Tone = "brand" | "warning" | "muted" | "info";

const TONE_BAR: Record<Tone, string> = {
  brand: "bg-brand",
  warning: "bg-warning",
  muted: "bg-divider",
  info: "bg-info",
};

const TONE_ICON: Record<Tone, string> = {
  brand: "text-brand",
  warning: "text-warning-text",
  muted: "text-text-muted",
  info: "text-info",
};

function Tile({
  icon,
  label,
  hint,
  value,
  tone,
  href,
  active = false,
  filterHint,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  value: number;
  tone: Tone;
  /** Present when the tile filters the queue; absent when it is a read-out. */
  href?: string;
  active?: boolean;
  filterHint?: string;
}) {
  const body = (
    <>
      <span className={`absolute inset-x-0 top-0 h-[3px] ${TONE_BAR[tone]}`} aria-hidden="true" />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-muted">{label}</p>
        <span className={TONE_ICON[tone]} aria-hidden="true">
          {icon}
        </span>
      </div>
      <p className="mt-2.5 text-[26px] font-bold leading-none text-text-heading">{value}</p>
      <p className="mt-1.5 text-[11.5px] leading-4 text-text-muted">{hint}</p>
    </>
  );

  const base = "relative block overflow-hidden rounded-2xl border bg-bg-surface p-4 shadow-sm";

  if (!href) {
    return <div className={`${base} border-divider`}>{body}</div>;
  }

  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`focus-field ${base} transition hover:border-brand ${
        active ? "border-brand ring-1 ring-brand/25" : "border-divider"
      }`}
    >
      {body}
      <span className="sr-only">{filterHint}</span>
    </Link>
  );
}

export default async function DuplicateSummary({
  summary,
  activeConfidence,
  basePath,
  searchParams,
}: {
  summary: Summary;
  activeConfidence: DuplicateConfidence | "all";
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  const t = await getTranslations("adminDuplicates");

  /** Swap the confidence facet, dropping the page number — a filter change
   *  always lands on page 1. Clicking the active tile clears the filter. */
  const confidenceHref = (value: DuplicateConfidence | "all"): string => {
    const params = new URLSearchParams();
    for (const [key, current] of Object.entries(searchParams)) {
      if (current && key !== "page" && key !== "confidence") params.set(key, current);
    }
    const next = value === activeConfidence ? "all" : value;
    if (next !== "all") params.set("confidence", next);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <section aria-label={t("summary.aria")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Tile
        icon={<Copy className="h-4 w-4" />}
        label={t("summary.groups")}
        hint={t("summary.groupsHint")}
        value={summary.groups}
        tone="info"
        href={confidenceHref("all")}
        active={activeConfidence === "all"}
        filterHint={t("summary.filterHint")}
      />
      <Tile
        icon={<Fingerprint className="h-4 w-4" />}
        label={t("summary.high")}
        hint={t("summary.highHint")}
        value={summary.high}
        tone="brand"
        href={confidenceHref("high")}
        active={activeConfidence === "high"}
        filterHint={t("summary.filterHint")}
      />
      <Tile
        icon={<ScanSearch className="h-4 w-4" />}
        label={t("summary.medium")}
        hint={t("summary.mediumHint")}
        value={summary.medium}
        tone="warning"
        href={confidenceHref("medium")}
        active={activeConfidence === "medium"}
        filterHint={t("summary.filterHint")}
      />
      <Tile
        icon={<Eye className="h-4 w-4" />}
        label={t("summary.low")}
        hint={t("summary.lowHint")}
        value={summary.low}
        tone="muted"
        href={confidenceHref("low")}
        active={activeConfidence === "low"}
        filterHint={t("summary.filterHint")}
      />
      <Tile
        icon={<Library className="h-4 w-4" />}
        label={t("summary.books")}
        hint={t("summary.booksHint")}
        value={summary.booksAffected}
        tone="info"
      />
    </section>
  );
}
