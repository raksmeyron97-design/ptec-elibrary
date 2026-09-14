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
// The two sheets live in MobileNavSheets, loaded at browser idle: the bar is
// on every page's critical path, the sheets only matter after a tap.

import { Link, usePathname } from "@/i18n/navigation";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CircleUserRound, House, LibraryBig, Search, Waypoints, type LucideProps } from "lucide-react";
import { useSession } from "@/components/providers/SessionProvider";
import { activeTab, tabBarVisible, type ShellTab } from "@/lib/nav/shell-routes";
import type { HoursClosure } from "@/lib/system-settings/types";
import { getInitials } from "./user-initials";

const MobileNavSheets = dynamic(() => import("./MobileNavSheets"), { ssr: false });

type Icon = ComponentType<LucideProps>;
type Sheet = "library" | "profile" | null;

export type MobileBottomNavProps = {
  /** Published opening hours, so the Library sheet can say whether the
   *  physical library is open right now. Optional: the bar works without. */
  hours?: { spec: string[]; closures: HoursClosure[] };
};

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

// ── Component ───────────────────────────────────────────────────────────────
export default function MobileBottomNav({ hours }: MobileBottomNavProps) {
  const { user } = useSession();
  const t = useTranslations("nav");
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

  // Mount the sheets at idle, CLOSED, so the first tap animates them in
  // rather than waiting for their code. A tap before idle mounts them then.
  const [sheetsReady, setSheetsReady] = useState(false);
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setSheetsReady(true), { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setSheetsReady(true), 2000);
    return () => window.clearTimeout(id);
  }, []);

  // The dedicated reading route has its own bars and a Back button; a third
  // bar there is chrome a reader mid-page is not using (lib/nav/shell-routes).
  if (!tabBarVisible(pathname)) return null;

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

      {(sheetsReady || sheet !== null) && (
        <MobileNavSheets sheet={sheet} onClose={closeSheet} hours={hours} showAvatar={showAvatar} />
      )}
    </>
  );
}
