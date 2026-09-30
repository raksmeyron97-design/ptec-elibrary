import Link from "next/link";
import { useTranslations } from "next-intl";
import { Eye } from "lucide-react";
import type { TopContentRow } from "@/lib/admin/intelligence";
import DashPanel from "./DashPanel";
import DashCover from "./DashCover";

/** Eight covers is one row at full width and a comfortable swipe on a phone. */
export const SHELF_SIZE = 8;

/**
 * "Most read" — the period's most-viewed records as a shelf of covers, the
 * reference design's "Recommended books for the week" made honest: ranked by
 * measured detail views (staff visits already excluded upstream), not chosen.
 *
 * Posts are left out on purpose: this is the COLLECTION being read, and a news
 * post is not a holding. Below `md` the shelf scrolls sideways rather than
 * stacking eight covers into a column. The list is an <ol>, so position is
 * announced by the list itself; the gold rank badge is its visual echo.
 */
export default function MostReadShelf({
  rows,
  periodTitle,
  reportHref,
  editable,
}: {
  rows: TopContentRow[];
  /** e.g. "Last 30 days" — already localised. */
  periodTitle: string;
  reportHref: string;
  editable: Partial<Record<TopContentRow["type"], boolean>>;
}) {
  const t = useTranslations("adminDashboard.library.shelf");
  const tType = useTranslations("adminDashboard.toolbar.type");

  const shelf = rows.filter((r) => r.type !== "post" && r.views > 0).slice(0, SHELF_SIZE);

  return (
    <DashPanel
      id="shelf"
      title={t("title", { range: periodTitle })}
      subtitle={t("subtitle")}
      action={
        <Link href={reportHref} className="text-[13px] font-bold text-brand hover:underline">
          {t("report")} <span aria-hidden="true">→</span>
        </Link>
      }
    >
      {shelf.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <ol className="dash-scroll-x -mx-5 flex snap-x gap-4 px-5 pb-1 md:mx-0 md:grid md:grid-cols-4 md:gap-5 md:px-0 md:pb-0 xl:grid-cols-8 [&>li]:w-[124px] [&>li]:shrink-0 [&>li]:snap-start md:[&>li]:w-auto">
          {shelf.map((r, i) => {
            const href = editable[r.type] ? r.editHref : r.publicHref;
            const body = (
              <>
                <div className="relative">
                  <span className="dash-shelf-rank" aria-hidden="true">
                    {i + 1}
                  </span>
                  <DashCover coverUrl={r.coverUrl} title={r.title} seed={r.id} category={r.department} variant="shelf" />
                </div>
                <span
                  className="mt-2.5 line-clamp-2 min-h-11 text-[13px] font-semibold leading-[22px] text-text-heading"
                  dir="auto"
                >
                  {r.title}
                </span>
                <span className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-xs text-text-muted">
                  <Eye className="h-3.5 w-3.5 shrink-0 text-[var(--ptec-series-views)]" aria-hidden="true" />
                  <span className="tabular-nums">{t("views", { count: r.views })}</span>
                </span>
                {/* Most of the shelf is books; only a thesis or an article is
                    worth naming, and on its own line so the count never wraps. */}
                {r.type !== "book" && <span className="dash-truncate text-xs text-text-muted">{tType(r.type)}</span>}
              </>
            );
            return (
              <li key={`${r.type}:${r.id}`} className="dash-shelf-item min-w-0">
                {href ? (
                  <Link href={href} className="flex flex-col rounded-lg [--focus-ring-offset:3px]">
                    {body}
                  </Link>
                ) : (
                  <div className="flex flex-col">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </DashPanel>
  );
}
