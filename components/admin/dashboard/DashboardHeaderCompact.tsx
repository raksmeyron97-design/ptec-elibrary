import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { Upload, ExternalLink } from "lucide-react";
import HeaderMenu, { type HeaderMenuItem } from "./HeaderMenu";

const APP_TZ = "Asia/Phnom_Penh";

export type QuickActionKey = "addBook" | "addThesis" | "addPublication" | "createPost" | "manageUsers" | "reviewRequests";

/**
 * One slim header row (~72px): greeting + date/role on the left; on the right
 * a single primary action (Add book), a Create menu, a quiet utility menu and
 * a quiet external site link. No decorative illustration — the Action Center
 * must stay above the fold on a 1366×768 screen. Everything is
 * permission-aware — actions the admin cannot perform are not rendered at all.
 */
export default async function DashboardHeaderCompact({
  name,
  role,
  actions,
  publicSiteUrl,
}: {
  name: string | null;
  role: string;
  actions: QuickActionKey[];
  publicSiteUrl: string;
}) {
  const t = await getTranslations("adminDashboard.header");
  const locale = await getLocale();

  const hour = parseInt(
    new Date().toLocaleString("en-US", { timeZone: APP_TZ, hour: "numeric", hour12: false }),
    10,
  );
  const greetingKey = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const todayLabel = new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-US", {
    timeZone: APP_TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const firstName = name?.trim().split(/\s+/)[0] ?? "Admin";
  const can = (k: QuickActionKey) => actions.includes(k);

  const createItems: HeaderMenuItem[] = [
    can("addThesis") && { key: "addThesis", label: t("actions.addThesis"), href: "/admin/theses/create", iconKey: "addThesis" },
    can("addPublication") && { key: "addPublication", label: t("actions.addPublication"), href: "/admin/publications/new", iconKey: "addPublication" },
    can("createPost") && { key: "createPost", label: t("actions.createPost"), href: "/admin/posts/new", iconKey: "createPost" },
  ].filter(Boolean) as HeaderMenuItem[];

  const utilityItems: HeaderMenuItem[] = [
    can("manageUsers") && { key: "manageUsers", label: t("actions.manageUsers"), href: "/admin/users", iconKey: "manageUsers" },
    can("reviewRequests") && { key: "reviewRequests", label: t("actions.reviewRequests"), href: "/admin/book-requests", iconKey: "reviewRequests" },
  ].filter(Boolean) as HeaderMenuItem[];

  return (
    <header className="dash-header relative z-30 flex min-h-[72px] flex-wrap items-center justify-between gap-x-5 gap-y-2 px-5 py-3 sm:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-[17px] font-bold leading-tight text-[var(--dash-ink)] sm:text-[19px]">
          {t(greetingKey, { name: firstName })}
        </h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-text-muted">
          {todayLabel}
          <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[var(--dash-gold)]" />
          {t(`role.${role}`)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {can("addBook") && (
          <Link
            href="/admin/upload"
            className="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
          className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-text-muted transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{t("actions.viewSite")}</span>
          <span className="sr-only sm:hidden">{t("actions.viewSite")}</span>
        </a>
      </div>
    </header>
  );
}
