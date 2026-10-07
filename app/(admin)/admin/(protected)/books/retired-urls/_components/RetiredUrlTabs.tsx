import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCheck, ListChecks, Route } from "lucide-react";
import type { QueueTab } from "@/lib/url-redirects/queue";

/**
 * Pending ↔ Resolved ↔ Redirects, as links: the tab is URL state like every
 * other filter here, so it survives a refresh and a shared link. The
 * Redirects tab exists only for admins (its rows carry a private reason), so
 * `redirectCount` is null for everyone else and the tab is not drawn.
 */
export default function RetiredUrlTabs({
  basePath,
  tab,
  pendingCount,
  resolvedCount,
  redirectCount,
}: {
  basePath: string;
  tab: QueueTab;
  pendingCount: number;
  resolvedCount: number;
  redirectCount: number | null;
}) {
  const t = useTranslations("adminRetiredUrls.tabs");

  const tabs = [
    { key: "pending" as const, href: basePath, label: t("pending"), count: pendingCount, Icon: ListChecks },
    { key: "resolved" as const, href: `${basePath}?tab=resolved`, label: t("resolved"), count: resolvedCount, Icon: CheckCheck },
    ...(redirectCount === null
      ? []
      : [{ key: "redirects" as const, href: `${basePath}?tab=redirects`, label: t("redirects"), count: redirectCount, Icon: Route }]),
  ];

  return (
    <nav aria-label={t("aria")} className="flex flex-wrap items-center gap-2">
      {tabs.map(({ key, href, label, count, Icon }) => {
        const active = tab === key;
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`focus-field inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
              active
                ? "border-surface-brand-line bg-surface-brand-soft text-brand"
                : "border-divider bg-bg-surface text-text-body hover:bg-paper"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {label}
            <span
              className={`rounded-md px-1.5 py-0.5 text-[11.5px] font-bold tabular-nums ${
                active ? "bg-brand text-brand-contrast" : "bg-paper text-text-muted"
              }`}
            >
              {count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
