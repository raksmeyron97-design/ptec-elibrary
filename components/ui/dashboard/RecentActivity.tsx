// components/ui/dashboard/RecentActivity.tsx
// TERTIARY section — real events only, composed by lib/dashboard/recent-activity.ts.
// A quiet list, not another bordered-card grid, so it doesn't compete with
// the primary/secondary sections above it.
import { Link } from "@/i18n/navigation";
import { Eye, Bookmark, Download, History } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { DashboardActivityItem, DashboardActivityType } from "@/lib/dashboard/recent-activity";
import { formatRelativeTime } from "@/lib/dashboard/relative-time";

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
    <section aria-label={t("recentActivity")}>
      <h2 className="mb-3 text-[15px] font-bold text-text-heading">{t("recentActivity")}</h2>

      {items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-divider bg-bg-surface px-5 py-6">
          <History className="h-5 w-5 shrink-0 text-text-muted" aria-hidden="true" />
          <p className="text-[13px] text-text-muted">{t("noActivityDesc")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-divider overflow-hidden rounded-2xl border border-divider bg-bg-surface">
          {items.map((item, i) => {
            const Icon = ICON[item.type];
            return (
              <li key={`${item.type}-${item.slug}-${i}`}>
                <Link
                  href={`/books/${item.slug}`}
                  className="focus-field flex items-center gap-3 px-4 py-3 transition hover:bg-paper"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/8 text-brand" aria-hidden="true">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1" dir="auto">
                    <span className="block truncate text-[13px] font-medium text-text-heading">
                      <span className="font-semibold text-brand">{VERB[item.type]}</span> {item.title}
                    </span>
                    <span className="block text-[11.5px] text-text-muted">
                      {formatRelativeTime(item.occurredAt, t)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
