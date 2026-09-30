import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import type { RecentRecord } from "@/lib/admin/intelligence";
import DashPanel from "./DashPanel";
import DashCover from "./DashCover";
import { relativeFromNow } from "./formatters";

type StatusKey = "published" | "scheduled" | "draft" | "review" | "archived" | "unpublished";

const REVIEW_STATUSES = new Set(["needs_review", "pending_review", "in_review", "changes_requested"]);

/** The workflow word for a record, from the fields the catalog carries. */
export function recentStatus(r: Pick<RecentRecord, "published" | "status">): StatusKey {
  if (r.published) return "published";
  if (r.status === "scheduled") return "scheduled";
  if (r.status && REVIEW_STATUSES.has(r.status)) return "review";
  if (r.status === "archived") return "archived";
  if (r.status === "draft") return "draft";
  return "unpublished";
}

const STATUS_CLASS: Record<StatusKey, string> = {
  published: "dash-status--ok",
  scheduled: "dash-status--info",
  review: "dash-status--warn",
  draft: "dash-status--neutral",
  archived: "dash-status--neutral",
  unpublished: "dash-status--neutral",
};

/**
 * "Recently added" — the reference design's Books list, for this library:
 * the newest records across the digital collection in ANY workflow state, so
 * the librarian sees the draft and the review item they just created next to
 * what went live. Derived from the catalog the Overview already loaded; it
 * costs no query.
 *
 * A row links to its edit page only when the viewer may edit that type
 * (`editable`, from the route registry) — otherwise it is plain text rather
 * than a link to a 403.
 */
export default function RecentlyAddedPanel({
  rows,
  editable,
  addHref,
  allHref,
  generatedAt,
  className,
}: {
  rows: RecentRecord[];
  editable: Partial<Record<RecentRecord["type"], boolean>>;
  /** Upload page, or null when the viewer cannot add books. */
  addHref: string | null;
  allHref: string | null;
  generatedAt: string;
  className?: string;
}) {
  const t = useTranslations("adminDashboard.library.recent");
  const tType = useTranslations("adminDashboard.toolbar.type");
  const locale = useLocale();
  const now = new Date(generatedAt).getTime();

  return (
    <DashPanel
      id="recent"
      title={t("title")}
      subtitle={t("subtitle")}
      bodyClassName="flex flex-col"
      className={className}
      action={
        addHref ? (
          <Link href={addHref} className="dash-head-action">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("add")}
          </Link>
        ) : null
      }
    >
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-[var(--dash-line-subtle)]">
          {rows.map((r) => {
            const status = recentStatus(r);
            const content = (
              <>
                <DashCover coverUrl={r.coverUrl} title={r.title} seed={r.id} category={r.department} variant="thumb" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="dash-truncate text-[13px] font-bold leading-5 text-text-heading" dir="auto">
                    {r.title}
                  </span>
                  <span className="dash-truncate text-xs leading-[18px] text-text-muted" dir="auto">
                    {tType(r.type)}
                    {r.department ? ` · ${r.department}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={`${STATUS_CLASS[status]} inline-flex items-center rounded-full bg-[var(--dash-status-bg)] px-2 py-px text-[11px] font-bold text-[var(--dash-status-fg)] ring-1 ring-inset ring-[var(--dash-status-line)]`}
                  >
                    {t(`status.${status}`)}
                  </span>
                  <time dateTime={r.createdAt} className="text-xs tabular-nums text-text-muted">
                    {relativeFromNow(locale, r.createdAt, now)}
                  </time>
                </span>
              </>
            );
            return (
              <li key={`${r.type}:${r.id}`}>
                {editable[r.type] ? (
                  <Link
                    href={r.editHref}
                    className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-[var(--dash-well)] [--focus-ring-offset:-2px]"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-5 py-2.5">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {allHref && (
        <div className="mt-auto border-t border-[var(--dash-line-subtle)] px-5 py-3">
          <Link href={allHref} className="text-[13px] font-bold text-brand hover:underline">
            {t("all")} <span aria-hidden="true">→</span>
          </Link>
        </div>
      )}
    </DashPanel>
  );
}
