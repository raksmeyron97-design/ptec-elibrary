import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { CollectionPulse, ReaderRequestStatus } from "@/lib/admin/collection-pulse";
import DashPanel from "./DashPanel";
import { relativeFromNow } from "./formatters";

const STATUS_CLASS: Record<ReaderRequestStatus, string> = {
  pending: "dash-status--warn",
  approved: "dash-status--info",
  added: "dash-status--ok",
  rejected: "dash-status--neutral",
};

/**
 * "Reader requests" — what readers asked the library to find (or offered to
 * deposit), newest first, with the waiting count in the header.
 *
 * It shows WHAT was asked, never WHO asked: a glance panel on the most-visited
 * admin page is the wrong place to put readers' names, and the queue itself
 * (/admin/book-requests) is where a librarian acts on a request.
 *
 * `data === null` is "could not be read", which is said as such — it must not
 * collapse into the empty state, because "no reader has asked for anything"
 * and "the database did not answer" are opposite claims.
 */
export default function ReaderRequestsPanel({
  data,
  href,
  generatedAt,
}: {
  data: CollectionPulse["requests"];
  href: string;
  generatedAt: string;
}) {
  const t = useTranslations("adminDashboard.library.requests");
  const locale = useLocale();
  const now = new Date(generatedAt).getTime();

  return (
    <DashPanel
      id="requests"
      title={t("title")}
      subtitle={data ? t("subtitle", { count: data.pending }) : undefined}
      bodyClassName="flex flex-col"
      action={
        <Link href={href} className="dash-head-action">
          {t("open")}
        </Link>
      }
    >
      {data === null ? (
        <p className="px-5 py-8 text-center text-sm text-text-muted">{t("unavailable")}</p>
      ) : data.latest.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-text-muted">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-[var(--dash-line-subtle)]">
          {data.latest.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-5 py-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded-md bg-[var(--dash-well)] px-1.5 py-px text-[11px] font-semibold text-text-muted">
                    {t(`kind.${r.kind}`)}
                  </span>
                  <span className="dash-truncate text-[13px] font-bold leading-5 text-text-heading" dir="auto">
                    {r.title}
                  </span>
                </span>
                {r.author && (
                  <span className="dash-truncate text-xs leading-[18px] text-text-muted" dir="auto">
                    {t("by", { author: r.author })}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={`${STATUS_CLASS[r.status]} inline-flex items-center rounded-full bg-[var(--dash-status-bg)] px-2 py-px text-[11px] font-bold text-[var(--dash-status-fg)] ring-1 ring-inset ring-[var(--dash-status-line)]`}
                >
                  {t(`status.${r.status}`)}
                </span>
                <time dateTime={r.createdAt} className="text-xs tabular-nums text-text-muted">
                  {relativeFromNow(locale, r.createdAt, now)}
                </time>
              </span>
            </li>
          ))}
        </ul>
      )}
    </DashPanel>
  );
}
