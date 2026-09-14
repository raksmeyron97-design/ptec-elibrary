"use client";

// components/layout/MobileBottomNav.tsx
// The phone tab bar: Home · Search · Library · Paths · Profile, on a floating
// glass pill (docs/MOBILE-GLASS-UI.md).
//
// WHY THESE FIVE. The previous bar spent a slot on News and none on Learning
// Paths — the one thing PTEC's library has that a shelf does not — while
// theses and publications sat three taps deep in the ☰ drawer. Now every
// collection is two taps from anywhere (Library → collection), paths are one,
// and News stays reachable from the Profile sheet, the drawer, the footer and
// the homepage.
//
// WHY LIBRARY IS A SHEET. There is no single "library" page to send a reader
// to; there are six collections. The sheet reads DIGITAL_LIBRARY_ITEMS — the
// list the desktop mega-menu and the homepage collection grid render — so the
// three surfaces cannot disagree about what the library contains.
//
// Sheets are siblings of the bar and portalled (GlassSheet): the bar is a
// backdrop-filter surface, which would otherwise become the containing block
// of anything `position: fixed` inside it.

import { Link, usePathname } from "@/i18n/navigation";
import NextLink from "next/link";
import { useCallback, useState, type ComponentType, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Bookmark,
  ChevronRight,
  CircleUserRound,
  ExternalLink,
  HardDriveDownload,
  House,
  Info,
  Landmark,
  LayoutDashboard,
  LibraryBig,
  LogIn,
  LogOut,
  Newspaper,
  PenLine,
  Search,
  Settings,
  Tags,
  Waypoints,
  type LucideProps,
} from "lucide-react";
import { ADMIN_PANEL_ROLES, ROLE_META } from "@/lib/types/roles";
import { useSession } from "@/components/providers/SessionProvider";
import { clearPrivateBrowserState } from "@/lib/sw-client";
import GlassSheet from "@/components/ui/glass/GlassSheet";
import { activeTab, tabBarVisible, type ShellTab } from "@/lib/nav/shell-routes";
import { resolveLibraryStatus } from "@/lib/about/status";
import type { HoursClosure } from "@/lib/system-settings/types";
import { DIGITAL_LIBRARY_ITEMS } from "./digital-library-nav";
import { useLibraryOpenStatus } from "./useLibraryOpenStatus";

type Icon = ComponentType<LucideProps>;
type Sheet = "library" | "profile" | null;

export type MobileBottomNavProps = {
  /** Published opening hours, so the Library sheet can say whether the
   *  physical library is open right now. Optional: the bar works without. */
  hours?: { spec: string[]; closures: HoursClosure[] };
};

function getInitials(name: string | null, email: string) {
  if (name) return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return email.slice(0, 2).toUpperCase();
}

// ── One tab ─────────────────────────────────────────────────────────────────
// Links and sheet buttons share one anatomy: an indicator pill behind the
// icon, the label under it. Labels use --ptec-text-body, never muted: muted
// is below 4.5:1 on glass over a dark backdrop (lib/glass-tokens.test.ts).
const TAB_CLASS =
  "group flex h-full w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-[18px] px-0.5 [--focus-ring-offset:-2px] [-webkit-tap-highlight-color:transparent]";

function TabFace({ Icon, label, active, icon }: { Icon: Icon; label: string; active: boolean; icon?: ReactNode }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`flex h-8 w-14 max-w-full items-center justify-center rounded-full transition-colors duration-200 ease-out motion-reduce:transition-none ${
          active ? "bg-glass-selected text-brand" : "text-text-body group-active:bg-glass-selected"
        }`}
      >
        {icon ?? <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.3 : 1.9} />}
      </span>
      <span
        className={`max-w-full truncate text-[11px] leading-[1.35] ${
          active ? "font-bold text-brand" : "font-medium text-text-body"
        }`}
      >
        {label}
      </span>
    </>
  );
}

// ── A row inside a sheet ────────────────────────────────────────────────────
function SheetRow({
  href,
  Icon,
  label,
  description,
  onNavigate,
  current,
  external,
  externalLabel,
  trailing,
}: {
  href: string;
  Icon: Icon;
  label: string;
  description?: ReactNode;
  onNavigate: () => void;
  current?: boolean;
  external?: boolean;
  externalLabel?: string;
  trailing?: ReactNode;
}) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          current ? "bg-brand text-brand-contrast" : "bg-glass-selected text-brand"
        }`}
      >
        <Icon className="h-5 w-5" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug text-text-heading">{label}</span>
        {description && <span className="mt-0.5 block text-[12.5px] leading-snug text-text-muted">{description}</span>}
      </span>
      {trailing}
      {external ? (
        <>
          <ExternalLink className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          <span className="sr-only">({externalLabel})</span>
        </>
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
      )}
    </>
  );
  const className = `flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 transition-colors hover:bg-glass-selected ${
    current ? "bg-glass-selected" : ""
  }`;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onNavigate} className={className}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} onClick={onNavigate} aria-current={current ? "page" : undefined} className={className}>
      {body}
    </Link>
  );
}

// ── The physical library's live status line ────────────────────────────────
// Mounted only while the Library sheet is open, so it ticks only then.
function PhysicalLibraryStatus({ hours }: { hours: NonNullable<MobileBottomNavProps["hours"]> }) {
  const rawLocale = useLocale();
  const locale = rawLocale === "km" ? "km" : "en";
  const [initialStatus] = useState(() => resolveLibraryStatus(new Date(), hours.spec, hours.closures));
  const { tone, text } = useLibraryOpenStatus({ initialStatus, spec: hours.spec, closures: hours.closures, locale });
  return (
    <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] leading-snug text-text-muted">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${
          tone === "open"
            ? "bg-[var(--ptec-success)]"
            : tone === "notice"
              ? "bg-[var(--ptec-warning)]"
              : "bg-[var(--ptec-border-strong)]"
        }`}
      />
      {text}
    </span>
  );
}

// ── Component ───────────────────────────────────────────────────────────────
export default function MobileBottomNav({ hours }: MobileBottomNavProps) {
  const { user } = useSession();
  const t = useTranslations("nav");
  const tOffline = useTranslations("offline");
  const pathname = usePathname() ?? "/";
  // A sheet belongs to the page it was opened on: navigating away closes it
  // by construction (the same derivation MobileMenu uses), rather than by an
  // effect that re-renders after every route change.
  const [opened, setOpened] = useState<{ sheet: Exclude<Sheet, null>; path: string } | null>(null);
  const sheet: Sheet = opened && opened.path === pathname ? opened.sheet : null;
  const openSheet = (next: Exclude<Sheet, null>) => setOpened({ sheet: next, path: pathname });
  const [avatarFailed, setAvatarFailed] = useState(false);
  const showAvatar = !!user?.avatar_url && !avatarFailed;
  const current = activeTab(pathname);

  const closeSheet = useCallback(() => setOpened(null), []);

  // The dedicated reading route has its own bars and a Back button; a third
  // bar there is chrome a reader mid-page is not using (lib/nav/shell-routes).
  if (!tabBarVisible(pathname)) return null;

  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const tabs: Array<
    | { id: ShellTab; kind: "link"; href: string; label: string; Icon: Icon }
    | { id: ShellTab; kind: "sheet"; sheet: Exclude<Sheet, null>; label: string; Icon: Icon }
  > = [
    { id: "home", kind: "link", href: "/", label: t("home"), Icon: House },
    { id: "search", kind: "link", href: "/search", label: t("searchShort"), Icon: Search },
    { id: "library", kind: "sheet", sheet: "library", label: t("libraryShort"), Icon: LibraryBig },
    { id: "paths", kind: "link", href: "/paths", label: t("pathsShort"), Icon: Waypoints },
    { id: "profile", kind: "sheet", sheet: "profile", label: t("profile"), Icon: CircleUserRound },
  ];

  // The digital collections come from the nav config; Learning Paths has its
  // own tab, and the external SVA catalogue is listed last and labelled as
  // external, exactly as in the drawer.
  const digital = DIGITAL_LIBRARY_ITEMS.filter((item) => item.href !== "/paths");
  const internalDigital = digital.filter((item) => !item.external);
  const external = digital.filter((item) => item.external);

  const avatar = showAvatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={user!.avatar_url!}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setAvatarFailed(true)}
      className="h-[26px] w-[26px] rounded-full object-cover"
    />
  ) : user ? (
    <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-brand text-[10px] font-bold tracking-wide text-brand-contrast">
      {getInitials(user.full_name, user.email)}
    </span>
  ) : undefined;

  return (
    <>
      <nav
        aria-label={t("tabBarLabel")}
        className="glass-surface glass-surface--strong fixed inset-x-2.5 bottom-[calc(var(--ptec-mobile-nav-gap)+env(safe-area-inset-bottom,0px))] z-50 mx-auto h-[var(--ptec-mobile-nav-height)] max-w-md rounded-[24px] p-1 lg:hidden print:hidden"
      >
        <ul className="flex h-full items-stretch">
          {tabs.map((tab) => {
            const active = current === tab.id;
            return (
              <li key={tab.id} className="min-w-0 flex-1">
                {tab.kind === "link" ? (
                  <Link
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    // The active route is the one navigation that cannot happen.
                    prefetch={active ? false : undefined}
                    className={TAB_CLASS}
                  >
                    <TabFace Icon={tab.Icon} label={tab.label} active={active} />
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => openSheet(tab.sheet)}
                    aria-haspopup="dialog"
                    aria-expanded={sheet === tab.sheet}
                    // "You are in this section" for a control that opens a
                    // menu rather than navigating: aria-current="true".
                    aria-current={active ? "true" : undefined}
                    className={TAB_CLASS}
                  >
                    <TabFace
                      Icon={tab.Icon}
                      label={tab.label}
                      active={active || sheet === tab.sheet}
                      icon={tab.id === "profile" ? avatar : undefined}
                    />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Library ────────────────────────────────────────────────── */}
      {/* The sheets' lists keep an explicit role="list": outside a <nav>,
          Safari/VoiceOver drops list semantics from a `list-style: none` list,
          and "list, 7 items" is how a screen-reader user learns the size of
          the menu. The tab bar's own list sits inside <nav> and needs none. */}
      <GlassSheet
        open={sheet === "library"}
        onClose={closeSheet}
        title={t("librarySheetTitle")}
        closeLabel={t("close")}
        className="lg:hidden"
      >
        <ul role="list" className="space-y-0.5">
          {internalDigital.map((item) => (
            <li key={item.href}>
              <SheetRow
                href={item.href}
                Icon={item.icon}
                label={t(item.labelKey)}
                description={t(item.descriptionKey)}
                current={isCurrent(item.href)}
                onNavigate={closeSheet}
              />
            </li>
          ))}
          <li>
            <SheetRow
              href="/catalogs"
              Icon={Landmark}
              label={t("booksInLibrary")}
              description={
                hours ? <PhysicalLibraryStatus hours={hours} /> : t("physicalLibraryDescription")
              }
              current={isCurrent("/catalogs")}
              onNavigate={closeSheet}
            />
          </li>
          <li>
            <SheetRow
              href="/subjects"
              Icon={Tags}
              label={t("subjects")}
              description={t("subjectsDescription")}
              current={isCurrent("/subjects")}
              onNavigate={closeSheet}
            />
          </li>
          <li>
            <SheetRow
              href="/authors"
              Icon={PenLine}
              label={t("authors")}
              description={t("authorsDescription")}
              current={isCurrent("/authors")}
              onNavigate={closeSheet}
            />
          </li>
        </ul>
        {external.length > 0 && (
          <>
            <p className="px-3 pb-1 pt-4 text-[12px] font-semibold text-text-muted">{t("digitalLibraryExternalGroup")}</p>
            <ul role="list">
              {external.map((item) => (
                <li key={item.href}>
                  <SheetRow
                    href={item.href}
                    Icon={item.icon}
                    label={t(item.labelKey)}
                    description={t(item.descriptionKey)}
                    external
                    externalLabel={t("opensNewTab")}
                    onNavigate={closeSheet}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </GlassSheet>

      {/* ── Profile ────────────────────────────────────────────────── */}
      <GlassSheet
        open={sheet === "profile"}
        onClose={closeSheet}
        title={t("profileMenu")}
        hideTitle
        closeLabel={t("close")}
        className="lg:hidden"
        header={
          user ? (
            <div className="flex items-center gap-3 px-5 pb-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full">
                {showAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatar_url!}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-contrast">
                    {getInitials(user.full_name, user.email)}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[16px] font-bold text-text-heading">{user.full_name || user.email}</p>
                {user.full_name && <p className="truncate text-[12.5px] text-text-muted">{user.email}</p>}
                {ADMIN_PANEL_ROLES.includes(user.role) && (
                  <span
                    className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${ROLE_META[user.role].bgColor} ${ROLE_META[user.role].color}`}
                  >
                    {ROLE_META[user.role].label}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="px-5 pb-3 text-[14px] leading-relaxed text-text-body">{t("signInHint")}</p>
          )
        }
        footer={
          user ? (
            <form action="/auth/signout" method="POST" onSubmit={() => { void clearPrivateBrowserState(); }}>
              <button
                type="submit"
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-danger-soft px-4 text-[15px] font-semibold text-danger-text transition-colors hover:brightness-95"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {t("logout")}
              </button>
            </form>
          ) : (
            // Plain next/link: /auth is outside the locale scheme, so the
            // localized Link would send a Khmer reader to /km/auth/login.
            <NextLink
              href="/auth/login"
              onClick={closeSheet}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-[15px] font-semibold text-brand-contrast transition-colors hover:bg-brand-hover"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              {t("login")}
            </NextLink>
          )
        }
      >
        <ul role="list" className="space-y-0.5">
          {user && (
            <>
              <li>
                <SheetRow href="/dashboard" Icon={LayoutDashboard} label={t("myDashboard")} current={pathname === "/dashboard"} onNavigate={closeSheet} />
              </li>
              <li>
                <SheetRow href="/dashboard#saved" Icon={Bookmark} label={t("savedBooks")} onNavigate={closeSheet} />
              </li>
            </>
          )}
          {/* Device storage, not an account: offered signed in or out. */}
          <li>
            <SheetRow
              href="/offline-books"
              Icon={HardDriveDownload}
              label={tOffline("libraryTitle")}
              current={isCurrent("/offline-books")}
              onNavigate={closeSheet}
            />
          </li>
          {user && (
            <li>
              <SheetRow href="/dashboard/settings" Icon={Settings} label={t("settings")} current={isCurrent("/dashboard/settings")} onNavigate={closeSheet} />
            </li>
          )}
        </ul>
        <div className="mx-3 my-2 h-px bg-divider/70" aria-hidden="true" />
        <ul role="list" className="space-y-0.5">
          <li>
            <SheetRow href="/posts" Icon={Newspaper} label={t("posts")} current={isCurrent("/posts")} onNavigate={closeSheet} />
          </li>
          <li>
            <SheetRow href="/about" Icon={Info} label={t("about")} current={isCurrent("/about")} onNavigate={closeSheet} />
          </li>
        </ul>
      </GlassSheet>
    </>
  );
}
