"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { LayoutGrid, FileStack, Search, Users, ServerCog, type LucideIcon } from "lucide-react";
import {
  serializeDashboardFilters,
  DASHBOARD_VIEWS,
  type DashboardFilters,
  type DashboardView,
} from "@/lib/admin/dashboard-shared";

const VIEW_ICON: Record<DashboardView, LucideIcon> = {
  overview: LayoutGrid,
  content: FileStack,
  search: Search,
  audience: Users,
  system: ServerCog,
};

/**
 * View navigation as a tinted PTEC rail. Link-based on purpose (each view is
 * a bookmarkable URL, back/forward must work); the active tab is a white pill
 * with royal-blue text, a gold 2px indicator and aria-current — several
 * non-colour signals so the selection never depends on hue alone.
 */
export default function DashboardTabs({
  filters,
  active,
  showSystem,
}: {
  filters: DashboardFilters;
  active: DashboardView;
  showSystem: boolean;
}) {
  const t = useTranslations("adminDashboard.tabs");
  const views = DASHBOARD_VIEWS.filter((v) => v !== "system" || showSystem);

  return (
    <nav aria-label={t("ariaLabel")} className="-mx-1 overflow-x-auto px-1 pb-0.5">
      <ul className="dash-tabrail flex min-w-max">
        {views.map((view) => {
          const qs = serializeDashboardFilters({ ...filters, view });
          const isActive = view === active;
          const Icon = VIEW_ICON[view];
          return (
            <li key={view}>
              <Link
                href={qs ? `/admin?${qs}` : "/admin"}
                aria-current={isActive ? "page" : undefined}
                className="dash-tab"
              >
                <Icon className="dash-tab-ico h-4 w-4" aria-hidden="true" />
                {t(view)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
