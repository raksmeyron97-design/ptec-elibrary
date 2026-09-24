// components/ui/dashboard/RecentActivity.tsx
// Real events only, composed by lib/dashboard/recent-activity.ts. A quiet
// list in a card, sized to sit beside My Requests.
import { Link } from "@/i18n/navigation";
import { Eye, Bookmark, Download, History } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { DashboardActivityItem, DashboardActivityType } from "@/lib/dashboard/recent-activity";
import { formatRelativeTime } from "@/lib/dashboard/relative-time";
import { CARD, CardHeader, EmptyState } from "@/components/ui/dashboard/primitives";

const ICON: Record<DashboardActivityType, typeof Eye> = {
  opened: Eye,
  saved: Bookmark,
  downloaded: Download,
};

export default async function RecentActivity({ items }: { items: DashboardActivityItem[] }) {
  const t = await getTranslations("dashboard");

  const VERB: Record<DashboardActivityType, string> = {
    opened: t("activityOpened"),
    saved: t("activitySaved"),
    downloaded: t("activityDownloaded"),
  };

  return (
    <section aria-labelledby="activity-heading" className={`${CARD} flex h-full flex-col`}>
      <CardHeader id="activity-heading" title={t("recentActivity")} icon={History} />

      {items.length === 0 ? (
        <EmptyState compact icon={History} title={t("noActivityTitle")} description={t("noActivityDesc")} />
      ) : (
        <ul className="divide-y divide-divider border-t border-divider">
          {items.map((item, i) => {
            const Icon = ICON[item.type];
            return (
              <li key={`${item.type}-${item.slug}-${i}`}>
                <Link href={`/books/${item.slug}`} className="focus-field group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-paper/60">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper text-text-muted dark:bg-paper/60" aria-hidden="true">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text-body" dir="auto">
                    <span className="font-medium text-text-muted">{VERB[item.type]}</span>{" "}
                    <span className="font-semibold text-text-heading group-hover:text-brand">{item.title}</span>
                  </span>
                  <time dateTime={item.occurredAt} className="shrink-0 text-[11.5px] tabular-nums text-text-muted">
                    {formatRelativeTime(item.occurredAt, t)}
                  </time>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
