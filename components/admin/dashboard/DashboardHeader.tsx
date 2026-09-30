import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { CalendarDays, Upload, ExternalLink } from "lucide-react";
import type { DashboardView } from "@/lib/admin/dashboard-shared";
import { EBOOKS_UPLOAD_PATH } from "@/lib/admin/ebooks-url";
import HeaderMenu, { type HeaderMenuItem } from "./HeaderMenu";
import { dateTimeFormat } from "./formatters";

const APP_TZ = "Asia/Phnom_Penh";

export type QuickActionKey =
  | "addBook"
  | "addThesis"
  | "addPublication"
  | "createPost"
  | "manageUsers"
  | "reviewRequests";

/**
 * The page header: a greeting, today's date and the live status chips on the
 * left; one primary action, a Create menu, a quiet utility menu and the
 * public-site link on the right.
 *
 * The greeting is the page's <h1> on every view — the active tab below names
 * the view. The viewer's name carries the brand ink (the reference design's
 * "Hello, Mohammed!"), split out of the translated sentence rather than
 * concatenated, so the Khmer word order is the translation's, not ours.
 * Global controls (search, language, notifications, profile) stay in the
 * admin shell's top bar and are never duplicated here.
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

  // "Good morning, {name}" → [before, name, after], so the name can be styled
  // without assuming where the translation puts it.
  const NAME_MARK = "\u0000";
  const [before, after = ""] = t(greetingKey, { name: NAME_MARK }).split(NAME_MARK);
  const today = dateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

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
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      {/* Grows and SHRINKS: the status chips wrap inside this block before
          the action cluster is pushed onto its own row. */}
      <div className="min-w-0 flex-[1_1_26rem]">
        <h1
          className="text-[28px] font-extrabold leading-9 tracking-tight text-[var(--dash-ink)]"
          // Khmer greetings run long; wrapping is expected, truncation is not.
          lang={locale}
        >
          {before}
          <span className="text-brand">{firstName}</span>
          {after}
          {/* The heading also names the view for anyone who lands on it by
              heading navigation; sighted readers get it from the active tab. */}
          <span className="sr-only"> · {tTabs(view)}</span>
        </h1>
        <div
          className="mt-2 flex min-h-7 flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-text-muted"
          lang={locale}
        >
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-[var(--dash-ink-3)]" aria-hidden="true" />
            {today}
          </span>
          {status}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
        {can("addBook") && (
          <Link
            href={EBOOKS_UPLOAD_PATH}
            className="flex h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-bold text-white shadow-[0_6px_14px_-6px_rgba(30,58,138,0.55)] transition-colors hover:bg-brand-hover"
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
          className="flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-text-muted transition-colors hover:bg-bg-surface hover:text-text-heading"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{t("actions.viewSite")}</span>
          <span className="sr-only sm:hidden">{t("actions.viewSite")}</span>
        </a>
      </div>
    </header>
  );
}
