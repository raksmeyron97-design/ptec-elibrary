import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { CheckCircle2, Pencil, X } from "lucide-react";
import Pagination from "@/components/ui/core/Pagination";
import type { MetadataQualityTier } from "@/lib/admin/thesis-metadata-quality";
import type { QualityRecordType, ScoredRecord } from "@/lib/admin/metadata-quality-report";

/** Severity of a record's own score — the meter fill and the badge share it,
 *  so the number and the bar can never tell different stories. */
function severity(pct: number): { color: string; badge: string } {
  if (pct >= 90) return { color: "var(--ptec-success)", badge: "border-success-line bg-success-soft text-success-text" };
  if (pct >= 70) return { color: "var(--ptec-series-views)", badge: "border-info-line bg-info-soft text-info-text" };
  if (pct >= 40) return { color: "var(--ptec-amber)", badge: "border-warning-line bg-warning-soft text-warning-text" };
  return { color: "var(--ptec-danger)", badge: "border-danger-line bg-danger-soft text-danger-text" };
}

const TYPE_FILTERS: (QualityRecordType | "all")[] = ["all", "book", "research"];

/**
 * The repair queue: every published record with a metadata gap, worst first.
 *
 * It is PAGINATED, which is the point. The queue was previously a hard
 * `slice(0, 30)` with a "Showing 30 of 112" chip and no next page — the other
 * 82 records were unreachable from this screen, which is precisely the set a
 * librarian working through the backlog needs on their second visit.
 *
 * Filters live in the URL (type, tier, field), so a filtered queue is a link
 * an administrator can send to a colleague, and the analysis charts above can
 * drive it by doing nothing more exotic than pointing at one.
 */
export default async function RepairQueue({
  gaps,
  totalGaps,
  page,
  pageSize,
  activeType,
  activeTier,
  activeField,
  activeFieldLabel,
  basePath,
  searchParams,
}: {
  /** Already filtered AND sliced to the current page. */
  gaps: ScoredRecord[];
  /** Size of the filtered set, before slicing. */
  totalGaps: number;
  page: number;
  pageSize: number;
  activeType: QualityRecordType | "all";
  activeTier: MetadataQualityTier | "all";
  activeField?: string;
  activeFieldLabel?: string;
  basePath: string;
  searchParams: Record<string, string | undefined>;
}) {
  const t = await getTranslations("adminDataQuality");
  const totalPages = Math.max(1, Math.ceil(totalGaps / pageSize));
  const filtered = activeType !== "all" || activeTier !== "all" || Boolean(activeField);

  /** Swap one facet, drop the page — a filter change always lands on page 1. */
  const facetHref = (key: string, value?: string): string => {
    const params = new URLSearchParams();
    for (const [name, current] of Object.entries(searchParams)) {
      if (current && name !== "page" && name !== key) params.set(name, current);
    }
    if (value) params.set(key, value);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const fieldLabel = (field: { key: string; label: string }) =>
    t.has(`fields.${field.key}`) ? t(`fields.${field.key}`) : field.label;

  return (
    <section aria-labelledby="metadata-gaps-title" className="rounded-2xl border border-divider bg-bg-surface shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider p-5">
        <div className="min-w-0">
          <h2 id="metadata-gaps-title" className="text-[15px] font-bold text-text-heading">{t("gaps.title")}</h2>
          <p className="mt-1 text-[12px] text-text-muted">{t("gaps.subtitle")}</p>
        </div>
        {totalGaps > 0 && (
          <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-semibold tabular-nums text-text-muted">
            {t("gaps.countLabel", { count: totalGaps })}
          </span>
        )}
      </div>

      {/* ── Filter row ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-divider px-5 py-3">
        <div className="dash-seg" role="group" aria-label={t("gaps.filterType")}>
          {TYPE_FILTERS.map((type) => (
            <Link
              key={type}
              href={facetHref("type", type === "all" ? undefined : type)}
              aria-current={activeType === type ? "true" : undefined}
              data-active={activeType === type}
              className="dash-seg-btn"
            >
              {type === "all" ? t("gaps.typeAll") : type === "book" ? t("gaps.typeBook") : t("gaps.typeThesis")}
            </Link>
          ))}
        </div>

        {activeField && (
          <Link
            href={facetHref("field")}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand/[0.06] px-2.5 py-1 text-[11.5px] font-semibold text-brand transition hover:bg-brand/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {t("gaps.missingField", { field: activeFieldLabel ?? activeField })}
            <X className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">{t("analysis.clearFilters")}</span>
          </Link>
        )}

        {activeTier !== "all" && (
          <Link
            href={facetHref("tier")}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand/[0.06] px-2.5 py-1 text-[11.5px] font-semibold text-brand transition hover:bg-brand/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {t(`tier.${activeTier}`)}
            <X className="h-3 w-3" aria-hidden="true" />
            <span className="sr-only">{t("analysis.clearFilters")}</span>
          </Link>
        )}

        {filtered && (
          <Link
            href={basePath}
            className="ms-auto text-[11.5px] font-semibold text-text-muted underline-offset-2 transition hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {t("analysis.clearFilters")}
          </Link>
        )}
      </div>

      {gaps.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <CheckCircle2 className="mx-auto h-7 w-7 text-success" aria-hidden="true" />
          <p className="mt-3 text-[14px] font-semibold text-text-heading">
            {filtered ? t("gaps.noMatchTitle") : t("gaps.completeTitle")}
          </p>
          <p className="mt-1 text-[12px] text-text-muted">
            {filtered ? t("gaps.noMatchBody") : t("gaps.completeBody")}
          </p>
          {filtered && (
            <Link
              href={basePath}
              className="mt-3 inline-block text-[12px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {t("analysis.clearFilters")}
            </Link>
          )}
        </div>
      ) : (
        <ol className="divide-y divide-divider">
          {gaps.map((gap) => {
            const tone = severity(gap.completeness);
            return (
              <li key={`${gap.type}-${gap.id}`} className="group p-4 transition hover:bg-paper/60 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-[52px] shrink-0">
                    <span
                      className={`block rounded-lg border px-2 py-1 text-center text-[11px] font-bold tabular-nums ${tone.badge}`}
                    >
                      {gap.completeness}%
                    </span>
                    {/* Meter: the fill carries severity, the track is the same
                        hue at low alpha, so the state reads across the whole
                        bar rather than only where it is filled. */}
                    <span
                      className="mt-1 block h-1 overflow-hidden rounded-full"
                      style={{ background: `color-mix(in srgb, ${tone.color} 18%, transparent)` }}
                      aria-hidden="true"
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${gap.completeness}%`, background: tone.color }}
                      />
                    </span>
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 truncate text-[13.5px] font-semibold text-text-heading" dir="auto">
                        {gap.title}
                      </p>
                      <span className="text-[10.5px] font-bold uppercase tracking-wider text-text-muted">
                        {gap.type === "book" ? t("gaps.typeBook") : t("gaps.typeThesis")}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {gap.missing.map((field) => {
                        const isActive = activeField === field.key;
                        return (
                          <Link
                            key={field.key}
                            href={facetHref("field", isActive ? undefined : field.key)}
                            className={`rounded-md px-2 py-1 text-[11px] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                              isActive
                                ? "bg-brand/10 font-semibold text-brand"
                                : "bg-paper text-text-muted hover:bg-brand/[0.07] hover:text-brand"
                            }`}
                          >
                            {fieldLabel(field)}
                          </Link>
                        );
                      })}
                    </div>
                  </div>

                  <Link
                    href={gap.editUrl}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-[12px] font-semibold text-text-body transition hover:border-brand/40 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    aria-label={t("gaps.editAria", { title: gap.title })}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> {t("gaps.edit")}
                  </Link>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {totalPages > 1 && (
        <div className="border-t border-divider px-5 py-4">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalGaps}
            pageSize={pageSize}
            searchParams={searchParams}
            basePath={basePath}
            pageSizeOptions={[15, 30, 60]}
          />
        </div>
      )}
    </section>
  );
}
