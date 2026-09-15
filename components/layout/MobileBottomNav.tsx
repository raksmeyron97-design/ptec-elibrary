"use client";

// components/layout/MobileBottomNav.tsx
// The phone tab bar: Home · Explore · Search · Saved · More, on a floating
// glass pill (docs/MOBILE-GLASS-UI.md). Below `lg` only — the desktop header
// is untouched.
//
// WHY THESE FIVE. Search is the centre, raised tab because finding a book is
// what a reader comes here to do, and it must be one tap from any page: the
// tab opens an overlay with the keyboard already up (MobileSearchOverlay,
// lib/search/open.ts) instead of navigating to a page whose field then needs
// a second tap. Explore holds every collection — Learning Paths first, since
// it had its own tab before Search took the centre. Saved holds what the
// reader has kept. More holds the account and everything the old ☰ drawer
// carried, which is what lets the top bar be just the brand and a search
// button.
//
// THE INDICATOR SLIDES. One pill, moved with a transform between equal-width
// slots (SHELL_TABS is the order), so a tap reads as movement from where you
// were to where you are going — and it moves to a sheet's tab while that sheet
// is open. Its slot is computed from the route during the server render, so
// it is in place in the first paint; nothing is measured.
//
// The sheets and the overlay load at browser idle: the bar is on every page's
// critical path, they only matter after a tap.

import { Link, usePathname } from "@/i18n/navigation";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Bookmark, Compass, House, Menu, Search, type LucideProps } from "lucide-react";
import { useSession } from "@/components/providers/SessionProvider";
import { activeTab, SHELL_TABS, shellTabIndex, tabBarVisible, type ShellTab } from "@/lib/nav/shell-routes";
import { openSearchOverlay } from "@/lib/search/open";
import type { HoursClosure } from "@/lib/system-settings/types";
import type { ShellContact, ShellSheet } from "./MobileNavSheets";
import { getInitials } from "./user-initials";

const MobileNavSheets = dynamic(() => import("./MobileNavSheets"), { ssr: false });
const MobileSearchOverlay = dynamic(() => import("./MobileSearchOverlay"), { ssr: false });

type Icon = ComponentType<LucideProps>;

export type MobileBottomNavProps = {
  /** Published opening hours, so the Explore sheet can say whether the
   *  physical library is open right now. Optional: the bar works without. */
  hours?: { spec: string[]; closures: HoursClosure[] };
  /** Published contact details for the More sheet (resolved by Footer). */
  contact?: ShellContact;
};

type TabDef =
  | { kind: "link"; href: string; label: string; Icon: Icon }
  | { kind: "search"; href: string; label: string }
  | { kind: "sheet"; sheet: ShellSheet; label: string; Icon: Icon };

// ── One tab ─────────────────────────────────────────────────────────────────
// Links and sheet buttons share one anatomy: an icon slot (the sliding
// indicator sits behind it), the label under it. Labels use --ptec-text-body,
// never muted: muted is below 4.5:1 on glass over a dark backdrop
// (lib/glass-tokens.test.ts).
const TAB_CLASS =
  "group flex h-full w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-[18px] px-0.5 [--focus-ring-offset:-2px] [-webkit-tap-highlight-color:transparent]";

function labelClass(active: boolean) {
  return `max-w-full truncate text-[11px] leading-[1.35] ${active ? "font-bold text-brand" : "font-medium text-text-body"}`;
}

function TabFace({ Icon, label, active, icon }: { Icon: Icon; label: string; active: boolean; icon?: ReactNode }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`flex h-8 w-14 max-w-full items-center justify-center rounded-full ${
          active ? "text-brand" : "text-text-body group-active:bg-glass-selected"
        }`}
      >
        {icon ?? <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.3 : 1.9} />}
      </span>
      <span className={labelClass(active)}>{label}</span>
    </>
  );
}

// The raised centre tab: a 48 px brand disc lifted out of the bar, ringed in
// the bar's own glass colour so it reads as cut out of it. It presses down on
// tap (transform only). The label stays on the baseline with the others.
function SearchFace({ label, active }: { label: string; active: boolean }) {
  return (
    <>
      <span aria-hidden="true" className="flex h-8 w-14 max-w-full items-center justify-center">
        <span className="flex h-12 w-12 shrink-0 -translate-y-2.5 items-center justify-center rounded-full bg-brand text-brand-contrast shadow-[0_8px_18px_-6px_rgba(30,58,138,0.6)] ring-4 ring-[var(--ptec-glass-bg-strong)] transition-transform duration-150 ease-out group-active:scale-95 motion-reduce:transition-none">
          <Search className="h-[22px] w-[22px]" strokeWidth={2.3} />
        </span>
      </span>
      <span className={labelClass(active)}>{label}</span>
    </>
  );
}

// ── Component ───────────────────────────────────────────────────────────────
export default function MobileBottomNav({ hours, contact }: MobileBottomNavProps) {
  const { user } = useSession();
  const t = useTranslations("nav");
  const pathname = usePathname() ?? "/";
  // A sheet belongs to the page it was opened on: navigating away closes it
  // by construction, rather than by an effect that re-renders after every
  // route change.
  const [opened, setOpened] = useState<{ sheet: ShellSheet; path: string } | null>(null);
  const sheet: ShellSheet | null = opened && opened.path === pathname ? opened.sheet : null;
  const openSheet = (next: ShellSheet) => setOpened({ sheet: next, path: pathname });
  const closeSheet = useCallback(() => setOpened(null), []);
  const [searchOpen, setSearchOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const showAvatar = !!user?.avatar_url && !avatarFailed;
  const current = activeTab(pathname);

  // Mount the sheets and the overlay at idle, CLOSED, so the first tap
  // animates them in rather than waiting for their code. A sheet tapped before
  // idle mounts it then; a Search tap before idle is simply the link.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setReady(true), 2000);
    return () => window.clearTimeout(id);
  }, []);

  // The dedicated reading route has its own bars and a Back button; a third
  // bar there is chrome a reader mid-page is not using (lib/nav/shell-routes).
  if (!tabBarVisible(pathname)) return null;

  const tabs: Record<ShellTab, TabDef> = {
    home: { kind: "link", href: "/", label: t("home"), Icon: House },
    explore: { kind: "sheet", sheet: "explore", label: t("exploreShort"), Icon: Compass },
    search: { kind: "search", href: "/search", label: t("searchShort") },
    saved: { kind: "sheet", sheet: "saved", label: t("savedShort"), Icon: Bookmark },
    more: { kind: "sheet", sheet: "more", label: t("more"), Icon: Menu },
  };

  // Where the indicator stands: an open sheet's tab, else the overlay's, else
  // the route's. Over the raised Search disc the pill would only peek out from
  // behind it — the disc is the emphasis there — so it fades as it arrives.
  const target: ShellTab | null = sheet ?? (searchOpen ? "search" : current);
  const slot = target ? shellTabIndex(target) : 0;
  const indicatorShown = target !== null && target !== "search";

  function onSearchTab(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    // Handled: stay on this page with the overlay open and the keyboard up.
    // Not handled (its code has not loaded yet): the link goes to /search.
    if (openSearchOverlay()) event.preventDefault();
  }

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
        <div className="relative h-full">
          {/* The sliding indicator. It mirrors TabFace's column (icon slot +
              an invisible label line) so the pill lands exactly behind the
              icon at any label height, and it moves by transform only. The
              list is positioned too, so it paints above this. */}
          <span
            aria-hidden="true"
            data-tab-indicator={target ?? "none"}
            className="pointer-events-none absolute inset-y-0 left-0 flex flex-col items-center justify-center gap-0.5 transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none"
            style={{
              width: `${100 / SHELL_TABS.length}%`,
              transform: `translateX(${slot * 100}%)`,
              opacity: indicatorShown ? 1 : 0,
            }}
          >
            <span className="h-8 w-14 max-w-full rounded-full bg-glass-selected" />
            <span className="invisible text-[11px] leading-[1.35]">{" "}</span>
          </span>

          <ul className="relative flex h-full items-stretch">
            {SHELL_TABS.map((id) => {
              const tab = tabs[id];
              const active = current === id;
              return (
                <li key={id} className="min-w-0 flex-1">
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
                  ) : tab.kind === "search" ? (
                    <Link
                      href={tab.href}
                      onClick={onSearchTab}
                      aria-haspopup="dialog"
                      aria-expanded={searchOpen}
                      aria-current={active ? "page" : undefined}
                      prefetch={active ? false : undefined}
                      className={TAB_CLASS}
                    >
                      <SearchFace label={tab.label} active={active || searchOpen} />
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
                        icon={id === "more" ? avatar : undefined}
                      />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {(ready || sheet !== null) && (
        <MobileNavSheets sheet={sheet} onClose={closeSheet} hours={hours} contact={contact} showAvatar={showAvatar} />
      )}
      {ready && <MobileSearchOverlay onOpenChange={setSearchOpen} />}
    </>
  );
}
