// components/ui/dashboard/QuickActions.tsx
// A compact nav aid, not a content section — plain links to routes that
// already exist. Deliberately low visual weight (no cards, no borders per
// item) so it never competes with Continue Reading / Library Snapshot.
import { Link } from "@/i18n/navigation";
import { Search, Library, Bookmark, MessageSquarePlus } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function QuickActions() {
  const t = await getTranslations("dashboard");

  const actions = [
    { href: "#dashboard-search", icon: Search, label: t("quickSearch") },
    { href: "/books", icon: Library, label: t("quickBrowse") },
    { href: "/dashboard?tab=saved#library", icon: Bookmark, label: t("quickSaved") },
    { href: "/books", icon: MessageSquarePlus, label: t("quickRequest") },
  ];

  return (
    <nav aria-label={t("quickActionsLabel")} className="flex flex-wrap gap-2">
      {actions.map(({ href, icon: Icon, label }) => (
        <Link
          key={label}
          href={href}
          className="focus-field inline-flex items-center gap-1.5 rounded-full border border-divider bg-bg-surface px-3.5 py-1.5 text-[12.5px] font-medium text-text-body transition hover:border-brand/30 hover:bg-brand/5 hover:text-brand"
        >
          <Icon className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
