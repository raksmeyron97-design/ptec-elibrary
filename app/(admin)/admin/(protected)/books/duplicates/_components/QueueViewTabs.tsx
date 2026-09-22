import Link from "next/link";
import { useTranslations } from "next-intl";
import { ListChecks, Undo2 } from "lucide-react";

/**
 * Queue ↔ Dismissed.
 *
 * A server component with plain links, not a client toggle: the view is URL
 * state like every other filter on this page, so it survives a refresh, a
 * back button and a shared link. `next/link` rather than the i18n one — /admin
 * is outside the locale scheme.
 *
 * Both counts are always shown, including zero. "Dismissed 0" is the sentence
 * that tells a reviewer the feature exists; hiding the tab until something has
 * been dismissed hides the only way to undo one.
 */
export default function QueueViewTabs({
  basePath,
  view,
  queueCount,
  dismissedCount,
}: {
  basePath: string;
  view: "queue" | "dismissed";
  queueCount: number;
  dismissedCount: number;
}) {
  const t = useTranslations("adminDuplicates");

  const tabs = [
    { key: "queue" as const, href: basePath, label: t("views.queue"), count: queueCount, Icon: ListChecks },
    {
      key: "dismissed" as const,
      href: `${basePath}?view=dismissed`,
      label: t("views.dismissed"),
      count: dismissedCount,
      Icon: Undo2,
    },
  ];

  return (
    <nav aria-label={t("views.aria")} className="flex flex-wrap items-center gap-2">
      {tabs.map(({ key, href, label, count, Icon }) => {
        const active = view === key;
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
