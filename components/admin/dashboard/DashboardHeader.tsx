import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { Upload, ExternalLink } from "lucide-react";
import type { DashboardView } from "@/lib/admin/dashboard-shared";
import HeaderMenu, { type HeaderMenuItem } from "./HeaderMenu";

const APP_TZ = "Asia/Phnom_Penh";

export type QuickActionKey =
  | "addBook"
  | "addThesis"
  | "addPublication"
  | "createPost"
  | "manageUsers"
  | "reviewRequests";

/**
 * Compact operational page header (~56px, one row on desktop).
 *
 * Left: the view's own title — an operational label, not a greeting card —
 * with the greeting, live system status and data freshness compressed onto a
 * single secondary line. Right: one primary action, a Create menu, a quiet
 * utility menu and the public-site link. Global controls (search, language,
 * notifications, profile) deliberately stay in the admin shell topbar and are
 * never duplicated here.
 *
 * `status` is streamed in by the caller inside its own Suspense boundary, so
 * a slow or failing health probe never delays the rest of the page.
 */
export default async function DashboardHeader({
  view,
  name,
  actions,
  publicSiteUrl,
  status,
}: {
  view: DashboardView;
  name: string | null;
  actions: QuickActionKey[];
  publicSiteUrl: string;
  status?: ReactNode;
}) {
  const [t, tTabs, locale] = await Promise.all([
    getTranslations("adminDashboard.header"),
    getTranslations("adminDashboard.tabs"),
    getLocale(),
  ]);

  const hour = parseInt(
    new Date().toLocaleString("en-US", { timeZone: APP_TZ, hour: "numeric", hour12: false }),
    10,
  );
  const greetingKey = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const firstName = name?.trim().split(/\s+/)[0] ?? "Admin";
  const can = (k: QuickActionKey) => actions.includes(k);

  const createItems: HeaderMenuItem[] = [
    can("addThesis") && {
      key: "addThesis",
      label: t("actions.addThesis"),
      href: "/admin/theses/create",
      iconKey: "addThesis",
    },
    can("addPublication") && {
      key: "addPublication",
      label: t("actions.addPublication"),
      href: "/admin/publications/new",
      iconKey: "addPublication",
    },
    can("createPost") && {
      key: "createPost",
      label: t("actions.createPost"),
      href: "/admin/posts/new",
      iconKey: "createPost",
    },
  ].filter(Boolean) as HeaderMenuItem[];

  const utilityItems: HeaderMenuItem[] = [
    can("manageUsers") && {
      key: "manageUsers",
      label: t("actions.manageUsers"),
      href: "/admin/users",
      iconKey: "manageUsers",
    },
    can("reviewRequests") && {
      key: "reviewRequests",
      label: t("actions.reviewRequests"),
      href: "/admin/book-requests",
      iconKey: "reviewRequests",
    },
  ].filter(Boolean) as HeaderMenuItem[];

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pb-1">
      <div className="min-w-0">
        <h1 className="truncate text-[20px] font-bold leading-tight tracking-tight text-[var(--dash-ink)] sm:text-[22px]">
          {tTabs(view)}
        </h1>
        <div
          className="mt-0.5 flex min-h-[18px] flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] leading-[18px] text-text-muted"
          // Khmer greetings run long; wrapping is expected, truncation is not.
          lang={locale}
        >
          <span>{t(greetingKey, { name: firstName })}</span>
          {status}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {can("addBook") && (
          <Link
            href="/admin/upload"
            className="flex h-10 items-center gap-1.5 rounded-[10px] bg-brand px-3.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            {t("actions.addBook")}
          </Link>
        )}
        {createItems.length > 0 && <HeaderMenu label={t("create")} items={createItems} iconKey="create" />}
        {utilityItems.length > 0 && (
          <HeaderMenu label={t("more")} items={utilityItems} iconKey="more" variant="quiet" />
        )}
        <a
          href={publicSiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-10 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-medium text-text-muted transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{t("actions.viewSite")}</span>
          <span className="sr-only sm:hidden">{t("actions.viewSite")}</span>
        </a>
      </div>
    </header>
  );
}
