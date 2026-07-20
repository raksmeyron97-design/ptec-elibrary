"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Upload,
  BookOpen,
  BookCopy,
  Copy,
  Library,
  FileText,
  Users,
  LogOut,
  ExternalLink,
  Menu,
  X,
  GraduationCap,
  ScrollText,
  Megaphone,
  Newspaper,
  BarChart3,
  Shield,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  UserCircle,
  Search,
  ChevronDown,
  ChevronRight,
  Settings,
  BookPlus,
  ClipboardCheck,
  Route,
  SearchX,
  Gauge,
  Inbox,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { AppRole, PermLevel } from "@/lib/types/roles";
import { ADMIN_ROLES } from "@/lib/types/roles";
// Client-safe half only — lib/admin/sidebar-badges.ts is `server-only`.
import { EMPTY_SIDEBAR_BADGES, type SidebarBadges } from "@/lib/admin/sidebar-badges-shared";
import { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import Avatar from "@/components/ui/Avatar";
import NotificationBell from "@/components/admin/NotificationBell";
import AdminLanguageSwitcher from "@/components/admin/AdminLanguageSwitcher";
import AdminCommandPalette, {
  type AdminCommand,
  type AdminCommandPaletteHandle,
} from "@/components/admin/AdminCommandPalette";

type NavIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

/** An actionable count attached to a nav destination.
 *  "critical" → something is broken; "attention" → work is waiting. */
type BadgeInfo = { count: number; severity: "critical" | "attention" };

type NavChild = {
  name: string;
  href: string;
  icon: NavIcon;
  badge?: BadgeInfo;
};

type NavNode =
  | { type: "link"; name: string; href: string; icon: NavIcon; badge?: BadgeInfo }
  /** `key` is the stable, locale-independent id (open-state storage etc.);
   *  `name` is the translated label. */
  | { type: "group"; key: string; name: string; icon: NavIcon; children: NavChild[] };

/** Translator narrowed to what the nav needs (adminShell.nav namespace). */
type NavT = (key: string, values?: Record<string, string | number>) => string;

function perm(perms: Record<string, PermLevel>, resource: string, minLevel: "read" | "write"): boolean {
  const level = perms[resource] ?? "none";
  return minLevel === "write" ? level === "write" : level !== "none";
}

/** Sum of a group's child badges, so a collapsed / closed group still signals
 *  that something inside it needs attention. */
function groupBadgeOf(children: NavChild[]): BadgeInfo | undefined {
  const badges = children.map((c) => c.badge).filter((b): b is BadgeInfo => !!b);
  if (badges.length === 0) return undefined;
  return {
    count: badges.reduce((sum, b) => sum + b.count, 0),
    severity: badges.some((b) => b.severity === "critical") ? "critical" : "attention",
  };
}

/** Visible count pill. Gold = work waiting, rose = something broken; the number
 *  itself carries the meaning, so status is never conveyed by colour alone. */
function CountPill({ badge, className = "" }: { badge: BadgeInfo; className?: string }) {
  const t = useTranslations("adminShell.nav");
  const critical = badge.severity === "critical";
  return (
    <span
      className={`inline-flex min-w-[18px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-[17px] tabular-nums ${className}`}
      style={{ background: critical ? "var(--ptec-rose)" : "var(--ptec-accent)", color: critical ? "#FFFFFF" : "var(--color-blue-950)" }}
    >
      <span aria-hidden="true">{badge.count > 99 ? "99+" : badge.count}</span>
      <span className="sr-only">
        {t(critical ? "badgeCritical" : "badgeAttention", { count: badge.count })}
      </span>
    </span>
  );
}

/** Small dot on a collapsed-mode icon (the count itself lives in the flyout). */
function CountDot({ severity }: { severity: BadgeInfo["severity"] }) {
  return (
    <span
      className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full"
      style={{
        background: severity === "critical" ? "#F43F5E" : "var(--ptec-accent)",
        boxShadow: "0 0 0 2px rgba(13,24,54,0.95)",
      }}
      aria-hidden="true"
    />
  );
}

/**
 * Parent → children navigation tree. A parent only renders when the user
 * can see at least one of its children (same permission gates as before).
 */
function getNavTree(
  role: AppRole,
  isSuperAdmin: boolean,
  userPermissions: Record<string, PermLevel>,
  badges: SidebarBadges = EMPTY_SIDEBAR_BADGES,
  t: NavT,
): NavNode[] {
  const isSA    = isSuperAdmin || role === "super_admin";
  const isAdmin = ADMIN_ROLES.includes(role) || isSA;
  const p = userPermissions;

  // Only surface a badge when there is genuinely something to act on.
  const attn = (n: number): BadgeInfo | undefined => (n > 0 ? { count: n, severity: "attention" } : undefined);
  const crit = (n: number): BadgeInfo | undefined => (n > 0 ? { count: n, severity: "critical" } : undefined);

  const books: NavChild[] = [];
  if (perm(p, "books",   "write")) books.push({ name: t("uploadBook"),   href: "/admin/upload",        icon: Upload         });
  if (perm(p, "books",   "write")) books.push({ name: t("reviewQueue"),  href: "/admin/review",        icon: ClipboardCheck, badge: attn(badges.review) });
  if (perm(p, "books",   "read"))  books.push({ name: t("manageEbooks"), href: "/admin/manage",        icon: BookCopy       });
  if (perm(p, "books",   "write")) books.push({ name: t("duplicates"),   href: "/admin/manage/duplicates", icon: Copy       });
  if (perm(p, "catalog", "read"))  books.push({ name: t("catalog"),      href: "/admin/catalogs",      icon: Library        });
  if (perm(p, "books",   "read"))  books.push({ name: t("bookRequests"), href: "/admin/book-requests", icon: BookPlus, badge: attn(badges.bookRequests) });

  const content: NavChild[] = [];
  if (perm(p, "posts",          "read")) content.push({ name: t("posts"),         href: "/admin/posts",         icon: FileText      });
  if (perm(p, "research",       "read")) content.push({ name: t("theses"),        href: "/admin/theses",        icon: GraduationCap });
  if (perm(p, "publications",   "read")) content.push({ name: t("publications"),  href: "/admin/publications",  icon: ScrollText    });
  if (perm(p, "learning_paths", "read")) content.push({ name: t("learningPaths"), href: "/admin/paths",         icon: Route         });
  if (perm(p, "announcements",  "read")) content.push({ name: t("announcements"), href: "/admin/announcements", icon: Megaphone     });

  const insights: NavChild[] = [];
  if (perm(p, "books", "read")) insights.push({ name: t("searchInsights"), href: "/admin/search-insights", icon: SearchX });
  if (perm(p, "books", "read")) insights.push({ name: t("dataQuality"),    href: "/admin/data-quality",    icon: Gauge, badge: crit(badges.dataQuality) });

  // Administration — role-gated items (security-sensitive) live here too
  const administration: NavChild[] = [];
  if (perm(p, "users", "write"))         administration.push({ name: t("libraryTeam"),  href: "/admin/team",  icon: UserCircle  });
  if (perm(p, "users", "write"))         administration.push({ name: t("users"),        href: "/admin/users", icon: Users       });
  if (perm(p, "roles", "write") || isSA) administration.push({ name: t("roles"),        href: "/admin/roles", icon: ShieldCheck });
  if (perm(p, "settings", "read") || isSA) administration.push({ name: t("systemSettings"), href: "/admin/system-settings", icon: SlidersHorizontal });
  if (isAdmin)                           administration.push({ name: t("securityLogs"), href: "/admin/logs",  icon: Shield      });

  const tree: NavNode[] = [
    { type: "link", name: t("dashboard"), href: "/admin", icon: LayoutDashboard },
  ];
  if (perm(p, "contact", "read")) tree.push({ type: "link", name: t("inbox"), href: "/admin/inbox", icon: Inbox, badge: attn(badges.inbox) });
  if (books.length)          tree.push({ type: "group", key: "books",          name: t("groupBooks"),          icon: BookOpen,  children: books          });
  if (content.length)        tree.push({ type: "group", key: "content",        name: t("groupContent"),        icon: Newspaper, children: content        });
  if (insights.length)       tree.push({ type: "group", key: "insights",       name: t("groupInsights"),       icon: BarChart3, children: insights       });
  if (administration.length) tree.push({ type: "group", key: "administration", name: t("groupAdministration"), icon: Settings,  children: administration });
  return tree;
}

/**
 * The nav is a scroll container (overflow-y-auto), which also clips
 * horizontal overflow — so collapsed-mode tooltips/flyouts must be
 * position:fixed (the aside's transform makes it their containing block,
 * escaping the nav's clip) with a measured top coordinate.
 */
function useFlyout(estimatedHeight: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);

  const show = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setTop(Math.max(8, Math.min(rect.top, window.innerHeight - estimatedHeight - 8)));
  };
  const hide = () => setTop(null);

  return [ref, top, show, hide] as const;
}

/** Top-level standalone link (Dashboard) — tooltip when collapsed. */
function TopLevelLink({
  link,
  active,
  collapsed,
  onClick,
}: {
  link: { name: string; href: string; icon: NavIcon; badge?: BadgeInfo };
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = link.icon;
  const [flyRef, flyTop, showFly, hideFly] = useFlyout(40);

  return (
    <div
      ref={flyRef}
      className="relative group/nav-item"
      onMouseEnter={collapsed ? showFly : undefined}
      onMouseLeave={collapsed ? hideFly : undefined}
    >
      <Link
        href={link.href}
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? link.name : undefined}
        title={collapsed ? undefined : link.name}
        className="relative flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
        style={{
          padding: collapsed ? "10px" : "10px 12px",
          justifyContent: collapsed ? "center" : undefined,
          color: active ? "#FFFFFF" : "rgba(255,255,255,0.65)",
          background: active ? "rgba(255,255,255,0.14)" : undefined,
          boxShadow: active ? "inset 0 0 0 1px rgba(255,255,255,0.08)" : undefined,
        }}
        onMouseEnter={e => {
          if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
          if (!active) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.90)";
        }}
        onMouseLeave={e => {
          if (!active) (e.currentTarget as HTMLElement).style.background = "";
          if (!active) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.65)";
        }}
      >
        {/* Gold active indicator bar */}
        {active && (
          <span
            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
            style={{ background: "var(--ptec-accent)" }}
          />
        )}
        <Icon
          className="shrink-0 transition-transform duration-200 group-hover/nav-item:scale-110"
          style={{
            width: "18px",
            height: "18px",
            color: active ? "var(--ptec-accent)" : "rgba(255,255,255,0.55)",
          }}
        />
        {!collapsed && <span className="flex-1 truncate">{link.name}</span>}
        {!collapsed && link.badge && <CountPill badge={link.badge} />}
        {collapsed && link.badge && <CountDot severity={link.badge.severity} />}
      </Link>

      {/* Tooltip — shown only in collapsed mode */}
      {collapsed && flyTop !== null && (
        <div className="pointer-events-none fixed z-50 pl-2" style={{ left: "64px", top: flyTop }}>
          <div
            className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-xl"
            style={{ background: "rgba(11,21,48,0.95)", backdropFilter: "blur(8px)" }}
          >
            {link.name}
          </div>
        </div>
      )}
    </div>
  );
}

/** Child link inside an expanded parent group. */
function ChildLink({
  link,
  active,
  onClick,
}: {
  link: NavChild;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = link.icon;

  return (
    <Link
      href={link.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={link.name}
      className="relative flex items-center gap-2.5 rounded-lg text-[13px] font-medium leading-5 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
      style={{
        padding: "7px 10px",
        color: active ? "#FFFFFF" : "rgba(255,255,255,0.60)",
        background: active ? "rgba(255,255,255,0.12)" : undefined,
      }}
      onMouseEnter={e => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)";
        if (!active) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.88)";
      }}
      onMouseLeave={e => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "";
        if (!active) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.60)";
      }}
    >
      {/* Gold tick on the guide line for the active child */}
      <span
        className="absolute -left-[13px] top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full transition-all duration-150"
        style={{ background: active ? "var(--ptec-accent)" : "transparent" }}
      />
      <Icon
        className="shrink-0"
        style={{
          width: "15px",
          height: "15px",
          color: active ? "var(--ptec-accent)" : "rgba(255,255,255,0.42)",
        }}
      />
      <span className="flex-1 truncate">{link.name}</span>
      {link.badge && <CountPill badge={link.badge} />}
    </Link>
  );
}

/** Parent group: accordion when expanded, hover flyout menu when collapsed. */
function NavGroup({
  group,
  collapsed,
  open,
  onToggle,
  isActive,
  onNavigate,
}: {
  group: { name: string; icon: NavIcon; children: NavChild[] };
  collapsed: boolean;
  open: boolean;
  onToggle: () => void;
  isActive: (href: string) => boolean;
  onNavigate: () => void;
}) {
  const Icon = group.icon;
  const childActive = group.children.some(c => isActive(c.href));
  const groupBadge = groupBadgeOf(group.children);
  // header (~34px) + rows (~36px each) + padding
  const [flyRef, flyTop, showFly, hideFly] = useFlyout(50 + group.children.length * 36);

  // ── Collapsed sidebar: icon + hover/focus flyout submenu ──
  if (collapsed) {
    const flyoutOpen = flyTop !== null;
    return (
      <div
        ref={flyRef}
        className="relative group/nav-item"
        onMouseEnter={showFly}
        onMouseLeave={hideFly}
        onFocus={showFly}
        onKeyDown={e => { if (e.key === "Escape") hideFly(); }}
      >
        <button
          type="button"
          aria-label={group.name}
          aria-haspopup="menu"
          aria-expanded={flyoutOpen}
          onClick={flyoutOpen ? hideFly : showFly}
          className="relative flex w-full items-center justify-center rounded-xl transition-all duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
          style={{
            padding: "10px",
            background: childActive ? "rgba(255,255,255,0.14)" : undefined,
            boxShadow: childActive ? "inset 0 0 0 1px rgba(255,255,255,0.08)" : undefined,
          }}
        >
          {childActive && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
              style={{ background: "var(--ptec-accent)" }}
            />
          )}
          <Icon
            className="shrink-0"
            style={{
              width: "18px",
              height: "18px",
              color: childActive ? "var(--ptec-accent)" : "rgba(255,255,255,0.55)",
            }}
          />
          {groupBadge && <CountDot severity={groupBadge.severity} />}
        </button>

        {/* Flyout submenu — hover or keyboard focus to open, links are clickable */}
        {flyoutOpen && (
        <div
          role="menu"
          aria-label={group.name}
          className="fixed z-50 pl-2"
          style={{ left: "64px", top: flyTop }}
        >
          <div
            className="w-56 rounded-xl py-2 shadow-2xl border border-white/10"
            style={{ background: "rgba(13,24,54,0.97)", backdropFilter: "blur(10px)" }}
          >
            <div
              className="px-3.5 pb-1.5 text-[10px] font-bold uppercase tracking-widest select-none"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              {group.name}
            </div>
            <div className="px-2 space-y-0.5">
              {group.children.map(child => {
                const ChildIcon = child.icon;
                const active = isActive(child.href);
                return (
                  <Link
                    key={child.href}
                    href={child.href}
                    role="menuitem"
                    aria-current={active ? "page" : undefined}
                    title={child.name}
                    onClick={() => { hideFly(); onNavigate(); }}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium leading-5 transition-all duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                    style={{
                      color: active ? "#FFFFFF" : "rgba(255,255,255,0.65)",
                      background: active ? "rgba(255,255,255,0.12)" : undefined,
                    }}
                    onMouseEnter={e => {
                      if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
                    }}
                    onMouseLeave={e => {
                      if (!active) (e.currentTarget as HTMLElement).style.background = "";
                    }}
                  >
                    <ChildIcon
                      className="shrink-0"
                      style={{
                        width: "15px",
                        height: "15px",
                        color: active ? "var(--ptec-accent)" : "rgba(255,255,255,0.45)",
                      }}
                    />
                    <span className="flex-1 truncate">{child.name}</span>
                    {child.badge && <CountPill badge={child.badge} />}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
        )}
      </div>
    );
  }

  // ── Expanded sidebar: accordion parent row + indented children ──
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-3 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
        style={{
          padding: "10px 12px",
          color: childActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.70)",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = "";
        }}
      >
        <Icon
          className="shrink-0"
          style={{
            width: "18px",
            height: "18px",
            color: childActive ? "var(--ptec-accent)" : "rgba(255,255,255,0.55)",
          }}
        />
        <span className="flex-1 text-left truncate leading-5" title={group.name}>{group.name}</span>
        {/* When closed, a count pill surfaces waiting work inside; fall back to
            a plain active dot only when the current page lives in the group. */}
        {!open && groupBadge ? (
          <CountPill badge={groupBadge} />
        ) : childActive && !open ? (
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--ptec-accent)" }} />
        ) : null}
        <ChevronRight
          className={`shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          style={{ width: "14px", height: "14px", color: "rgba(255,255,255,0.40)" }}
        />
      </button>

      {/* Animated expand/collapse via grid-rows */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-in-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden min-h-0">
          <div
            className="ml-[21px] pl-3 py-1 space-y-0.5 border-l"
            style={{ borderColor: "rgba(255,255,255,0.12)" }}
          >
            {group.children.map(child => (
              <ChildLink
                key={child.href}
                link={child}
                active={isActive(child.href)}
                onClick={onNavigate}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function getRoleLabel(role: AppRole, isSuperAdmin: boolean, t: NavT): string {
  if (isSuperAdmin || role === "super_admin") return t("superAdmin");
  if (role === "admin") return t("admin");
  if (role === "librarian") return t("librarian");
  if (role === "staff") return t("staff");
  return role.charAt(0).toUpperCase() + role.slice(1);
}

const GROUPS_STORAGE_KEY = "admin-sidebar-groups";

export default function AdminSidebar({
  children,
  email,
  fullName = null,
  avatarUrl = null,
  role = "admin",
  isSuperAdmin = false,
  userPermissions = {},
  badges = EMPTY_SIDEBAR_BADGES,
}: {
  children: React.ReactNode;
  email: string | undefined;
  fullName?: string | null;
  avatarUrl?: string | null;
  role?: AppRole;
  isSuperAdmin?: boolean;
  userPermissions?: Record<string, PermLevel>;
  badges?: SidebarBadges;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const tNav = useTranslations("adminShell.nav");
  const tBrand = useTranslations("adminShell.brand");
  const tTopbar = useTranslations("adminShell.topbar");
  const tPalette = useTranslations("adminShell.palette");
  const tRoles = useTranslations("adminShell.roles");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<AdminCommandPaletteHandle>(null);

  const navTree = getNavTree(role, isSuperAdmin, userPermissions, badges, tNav);
  const roleLabel = getRoleLabel(role, isSuperAdmin, tRoles);

  const publicSiteUrl = process.env.NEXT_PUBLIC_ROOT_DOMAIN
    ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
    : "https://library.ptec.edu.kh";

  // Command palette (⌘K) menu — built from the same permission-gated tree as
  // the sidebar plus the write-scoped create flows, so it can only ever offer
  // destinations this administrator is authorised to open.
  const commands = useMemo<AdminCommand[]>(() => {
    const canWrite = (resource: string) => (userPermissions[resource] ?? "none") === "write";
    const list: AdminCommand[] = [];

    const actions = tPalette("actions");
    const goTo = tPalette("goTo");

    if (canWrite("books")) list.push({ id: "act-upload", label: tPalette("addEbook"), group: actions, href: "/admin/upload", icon: Upload, keywords: "new create book pdf" });
    if (canWrite("research")) list.push({ id: "act-thesis", label: tPalette("addThesis"), group: actions, href: "/admin/theses/create", icon: GraduationCap, keywords: "new create research report" });
    if (canWrite("publications")) list.push({ id: "act-pub", label: tPalette("addPublication"), group: actions, href: "/admin/publications/new", icon: ScrollText, keywords: "new create paper" });
    if (canWrite("posts")) list.push({ id: "act-post", label: tPalette("createPost"), group: actions, href: "/admin/posts/new", icon: FileText, keywords: "new news article announcement" });
    if (canWrite("users")) list.push({ id: "act-users", label: tPalette("manageUsers"), group: actions, href: "/admin/users", icon: Users, keywords: "invite people accounts staff" });

    for (const node of navTree) {
      if (node.type === "link") {
        list.push({ id: `nav-${node.href}`, label: node.name, group: goTo, href: node.href, icon: node.icon });
      } else {
        for (const child of node.children) {
          list.push({ id: `nav-${child.href}`, label: child.name, group: goTo, href: child.href, icon: child.icon, keywords: node.name });
        }
      }
    }

    list.push({ id: "ext-site", label: tPalette("viewPublicSite"), group: goTo, href: publicSiteUrl, icon: ExternalLink, external: true, keywords: "open website live" });
    return list;
    // navTree is derived from these inputs; rebuild the list when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, isSuperAdmin, userPermissions, badges, publicSiteUrl, tPalette]);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  // Stable, locale-independent group key — the persisted open-state must not
  // change when the UI language does.
  const activeGroupKey = (() => {
    for (const node of navTree) {
      if (node.type === "group" && node.children.some(c => isActive(c.href))) return node.key;
    }
    return null;
  })();

  // Open the group holding the current page by default (deterministic for SSR).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    activeGroupKey ? { [activeGroupKey]: true } : {},
  );

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("admin-sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
    try {
      const savedGroups = JSON.parse(localStorage.getItem(GROUPS_STORAGE_KEY) ?? "{}") as Record<string, boolean>;
      setOpenGroups(prev => ({ ...savedGroups, ...prev }));
    } catch {
      /* corrupted state — keep defaults */
    }
  }, []);

  // Navigating into a section always reveals it, even if previously closed
  // (state adjustment during render — avoids an extra effect pass).
  const [revealedGroup, setRevealedGroup] = useState(activeGroupKey);
  if (activeGroupKey !== revealedGroup) {
    setRevealedGroup(activeGroupKey);
    if (activeGroupKey && !openGroups[activeGroupKey]) {
      setOpenGroups(prev => ({ ...prev, [activeGroupKey]: true }));
    }
  }

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close the mobile drawer on Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem("admin-sidebar-collapsed", String(next));
      return next;
    });
  };

  const pageLabel = (() => {
    for (const node of navTree) {
      if (node.type === "link") {
        if (isActive(node.href)) return node.name;
      } else {
        for (const child of node.children) {
          if (isActive(child.href)) return child.name;
        }
      }
    }
    return pathname.split("/").pop()?.replace(/-/g, " ") ?? "Admin";
  })();

  const sidebarWidth = mounted && collapsed ? "72px" : "256px";

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-bg-app text-text-heading font-body">

      {/* ── Command palette (⌘K) — permission-scoped actions + navigation ── */}
      <AdminCommandPalette ref={paletteRef} commands={commands} />

      {/* ── Mobile topbar ── */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 h-14 flex items-center px-4 justify-between z-20 shadow-lg"
        style={{ background: "linear-gradient(160deg, #1E3A8A 0%, #0F2160 100%)" }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center p-0.5"
            style={{ background: "rgba(255,255,255,0.15)" }}
          >
            <Image src="/logo_footer.webp" alt="PTEC" width={24} height={24} className="object-contain" />
          </div>
          <span className="font-bold text-white text-sm tracking-tight">{tBrand("mobileTitle")}</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-lg cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          style={{ color: "rgba(255,255,255,0.80)" }}
          aria-label={mobileOpen ? tNav("closeMenu") : tNav("openMenu")}
          aria-expanded={mobileOpen}
          aria-controls="admin-mobile-nav"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-30"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        id="admin-mobile-nav"
        aria-label={tNav("ariaNavigation")}
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen ? true : undefined}
        className={`
          fixed inset-y-0 left-0 z-40 flex flex-col admin-sidebar
          transform transition-all duration-300 ease-in-out
          lg:relative lg:h-full lg:translate-x-0 lg:shrink-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
        style={{ width: sidebarWidth }}
      >
        {/* ── Logo header ── */}
        <div
          className="flex items-center border-b border-white/10 shrink-0 overflow-hidden"
          style={{
            padding: collapsed ? "18px 16px" : "18px 20px",
            minHeight: "68px",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: collapsed ? 0 : "12px",
          }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 p-1 transition-all duration-200"
            style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}
          >
            <Image src="/logo_footer.webp" alt="PTEC Logo" width={32} height={32} className="object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-bold text-base tracking-tight text-white leading-tight">{tBrand("library")}</div>
              <div
                className="text-[11px] font-medium tracking-wide"
                style={{ color: "rgba(255,255,255,0.40)" }}
              >
                {tBrand("panel")}
              </div>
            </div>
          )}
        </div>

        {/* ── Navigation: parent groups with expandable children ── */}
        <nav
          aria-label={tNav("ariaSections")}
          className="flex-1 overflow-y-auto space-y-1"
          style={{ padding: collapsed ? "12px 8px" : "12px 10px" }}
        >
          {!collapsed && (
            <div
              className="px-3 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-widest select-none"
              style={{ color: "rgba(255,255,255,0.32)" }}
            >
              {tNav("menu")}
            </div>
          )}
          {navTree.map((node, i) => {
            const prev = navTree[i - 1];
            // Divider between the run of standalone links and the first group.
            const showDivider = node.type === "group" && prev?.type === "link";
            return (
              <div key={node.type === "link" ? node.href : node.key}>
                {showDivider && (
                  <div
                    className="my-2"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginInline: collapsed ? 4 : 6 }}
                    aria-hidden="true"
                  />
                )}
                {node.type === "link" ? (
                  <TopLevelLink
                    link={node}
                    active={isActive(node.href)}
                    collapsed={collapsed}
                    onClick={() => setMobileOpen(false)}
                  />
                ) : (
                  <NavGroup
                    group={node}
                    collapsed={collapsed}
                    open={!!openGroups[node.key]}
                    onToggle={() => toggleGroup(node.key)}
                    isActive={isActive}
                    onNavigate={() => setMobileOpen(false)}
                  />
                )}
              </div>
            );
          })}
        </nav>

        {/* ── Footer ── */}
        <div
          className="border-t border-white/10 shrink-0 space-y-0.5"
          style={{ padding: collapsed ? "10px 8px" : "10px 10px" }}
        >
          {/* Collapse toggle — desktop only */}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hidden lg:flex w-full items-center gap-2.5 rounded-xl transition-all duration-200 cursor-pointer"
            style={{
              color: "rgba(255,255,255,0.50)",
              padding: collapsed ? "9px" : "9px 12px",
              justifyContent: collapsed ? "center" : undefined,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
              (e.currentTarget as HTMLElement).style.color = "#fff";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.50)";
            }}
            aria-label={collapsed ? tNav("expandSidebar") : tNav("collapseSidebar")}
          >
            {collapsed
              ? <PanelLeftOpen className="w-4 h-4 shrink-0" />
              : (
                <>
                  <PanelLeftClose className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-medium">{tNav("collapse")}</span>
                </>
              )
            }
          </button>

          {/* Email */}
          {!collapsed && email && (
            <div
              className="px-3 py-1.5 text-[10px] font-mono truncate"
              style={{ color: "rgba(255,255,255,0.30)" }}
            >
              {email}
            </div>
          )}

          {/* View public site */}
          <a
            href={
              process.env.NEXT_PUBLIC_ROOT_DOMAIN
                ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
                : "https://library.ptec.edu.kh"
            }
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-xl transition-all duration-200 cursor-pointer"
            style={{
              color: "rgba(255,255,255,0.55)",
              padding: collapsed ? "9px" : "9px 12px",
              justifyContent: collapsed ? "center" : undefined,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
              (e.currentTarget as HTMLElement).style.color = "#fff";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)";
            }}
          >
            <ExternalLink className="w-4 h-4 shrink-0" />
            {!collapsed && <span className="text-xs font-medium">{tNav("viewPublicSite")}</span>}
          </a>

          {/* Sign out */}
          <form action="/admin/auth/signout" method="POST">
            <button
              type="submit"
              className="flex w-full items-center gap-2.5 rounded-xl transition-all duration-200 cursor-pointer"
              style={{
                color: "rgba(255,255,255,0.55)",
                padding: collapsed ? "9px" : "9px 12px",
                justifyContent: collapsed ? "center" : undefined,
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.14)";
                (e.currentTarget as HTMLElement).style.color = "#FCA5A5";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "";
                (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)";
              }}
            >
              <LogOut className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="text-xs font-medium">{tNav("signOut")}</span>}
            </button>
          </form>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-h-0 pt-14 lg:pt-0 overflow-hidden">

        {/* Desktop topbar */}
        <header
          className="hidden lg:flex h-16 bg-bg-surface border-b border-divider items-center shrink-0 gap-4"
          style={{ padding: "0 28px" }}
        >
          {/* Left: page title */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div
              className="w-1.5 h-5 rounded-full shrink-0"
              style={{ background: "linear-gradient(to bottom, var(--ptec-accent), var(--ptec-indigo))" }}
            />
            {/* Contextual label only — each page owns its real <h1>. */}
            <span className="text-sm font-semibold text-text-heading capitalize truncate">{pageLabel}</span>

          </div>

          {/* Center: one search surface — opens the ⌘K command palette (actions,
              pages and an e-book search) instead of a second, separate box. */}
          <button
            type="button"
            onClick={() => paletteRef.current?.open()}
            aria-haspopup="dialog"
            aria-keyshortcuts="Meta+K Control+K"
            className="hidden xl:flex flex-1 max-w-sm items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors hover:border-brand/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            style={{
              background: "var(--color-bg-app, #F8FAFC)",
              borderColor: "var(--color-divider, #E2E8F0)",
            }}
          >
            <Search className="w-4 h-4 shrink-0" style={{ color: "#64748B" }} />
            {/* slate-600 — this is a real label (not a placeholder), so it must
                clear WCAG AA 4.5:1 against the near-white field. */}
            <span className="flex-1 text-sm" style={{ color: "#475569" }}>
              {tTopbar("searchLabel")}
            </span>
            <kbd className="hidden sm:inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 select-none">
              ⌘K
            </kbd>
          </button>

          {/* Right: actions + avatar */}
          <div className="flex items-center gap-2 shrink-0">

            {/* EN/ខ្មែរ locale toggle (cookie-driven) */}
            <AdminLanguageSwitcher />

            {/* Notification bell — self-contained with polling + slide panel */}
            <NotificationBell />

            {/* Profile settings shortcut */}
            <button
              type="button"
              className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-200 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              style={{ color: "#64748B" }}
              aria-label={tTopbar("openProfileSettings")}
              onClick={() => router.push("/admin/profile")}
            >
              <Settings style={{ width: "18px", height: "18px" }} />
            </button>

            {/* Divider */}
            <div className="w-px h-6 bg-divider mx-1" />

            {/* Avatar profile dropdown */}
            <div ref={profileRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen(prev => !prev)}
                className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 cursor-pointer transition-all duration-200 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                aria-label={tTopbar("openProfileMenu")}
                aria-expanded={profileOpen}
              >
                <Avatar url={avatarUrl} name={fullName} email={email ?? "admin"} size={32} />
                {/* Name + role */}
                <div className="hidden xl:flex flex-col items-start min-w-0 max-w-[140px]">
                  <span className="text-xs font-semibold text-text-heading truncate leading-tight max-w-full">
                    {fullName ?? email?.split("@")[0] ?? "Admin"}
                  </span>
                  {/* slate-500: #94A3B8 on white was 2.8:1 — below WCAG AA for
                      this 10px label; #64748B clears 4.5:1. */}
                  <span className="text-[10px] leading-tight truncate max-w-full" style={{ color: "#64748B" }}>
                    {roleLabel}
                  </span>
                </div>
                <ChevronDown
                  style={{ width: "14px", height: "14px", color: "#94A3B8" }}
                  className={`transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`}
                />
              </button>

              {/* Dropdown panel */}
              {profileOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-64 rounded-2xl border shadow-xl z-50 overflow-hidden"
                  style={{
                    background: "var(--color-bg-surface, #fff)",
                    borderColor: "var(--color-divider, #E2E8F0)",
                    boxShadow: "0 10px 40px rgba(0,0,0,0.12)",
                  }}
                >
                  {/* User info header */}
                  <div className="flex items-center gap-3 p-4 border-b border-divider">
                    <Avatar url={avatarUrl} name={fullName} email={email ?? "admin"} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-text-heading truncate">
                        {fullName ?? email?.split("@")[0] ?? "Admin"}
                      </div>
                      <div className="text-xs text-slate-500 truncate mt-0.5">{email}</div>
                      <div className="mt-1.5">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{
                            background: isSuperAdmin || role === "super_admin"
                              ? "rgba(147,51,234,0.1)"
                              : role === "admin"
                              ? "rgba(245,158,11,0.1)"
                              : "rgba(16,185,129,0.1)",
                            color: isSuperAdmin || role === "super_admin"
                              ? "#7C3AED"
                              : role === "admin"
                              ? "#D97706"
                              : "#059669",
                          }}
                        >
                          {roleLabel}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="p-2">
                    <Link
                      href="/admin/profile"
                      className="flex items-center gap-2.5 w-full rounded-xl px-3 py-2.5 text-sm cursor-pointer transition-all duration-200 hover:bg-slate-50"
                      style={{ color: "#475569" }}
                      onClick={() => setProfileOpen(false)}
                    >
                      <UserCircle style={{ width: "15px", height: "15px" }} />
                      <span>{tTopbar("myProfile")}</span>
                    </Link>

                    <a
                      href={
                        process.env.NEXT_PUBLIC_ROOT_DOMAIN
                          ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
                          : "https://library.ptec.edu.kh"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 w-full rounded-xl px-3 py-2.5 text-sm cursor-pointer transition-all duration-200 hover:bg-slate-50"
                      style={{ color: "#475569" }}
                      onClick={() => setProfileOpen(false)}
                    >
                      <ExternalLink style={{ width: "15px", height: "15px" }} />
                      <span>{tNav("viewPublicSite")}</span>
                    </a>

                    <div className="my-1 mx-2 h-px bg-divider" />

                    <form action="/admin/auth/signout" method="POST">
                      <button
                        type="submit"
                        className="flex items-center gap-2.5 w-full rounded-xl px-3 py-2.5 text-sm cursor-pointer transition-all duration-200"
                        style={{ color: "#EF4444" }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.06)";
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.background = "";
                        }}
                      >
                        <LogOut style={{ width: "15px", height: "15px" }} />
                        <span>{tNav("signOut")}</span>
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto" style={{ padding: "24px 28px" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
