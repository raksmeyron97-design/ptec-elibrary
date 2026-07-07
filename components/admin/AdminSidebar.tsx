"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Upload,
  BookOpen,
  BookCopy,
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
} from "lucide-react";
import type { AppRole, PermLevel } from "@/lib/types/roles";
import { ADMIN_ROLES } from "@/lib/types/roles";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Avatar from "@/components/ui/Avatar";
import NotificationBell from "@/components/admin/NotificationBell";

type NavIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

type NavChild = {
  name: string;
  href: string;
  icon: NavIcon;
};

type NavNode =
  | { type: "link"; name: string; href: string; icon: NavIcon }
  | { type: "group"; name: string; icon: NavIcon; children: NavChild[] };

function perm(perms: Record<string, PermLevel>, resource: string, minLevel: "read" | "write"): boolean {
  const level = perms[resource] ?? "none";
  return minLevel === "write" ? level === "write" : level !== "none";
}

/**
 * Parent → children navigation tree. A parent only renders when the user
 * can see at least one of its children (same permission gates as before).
 */
function getNavTree(
  role: AppRole,
  isSuperAdmin: boolean,
  userPermissions: Record<string, PermLevel>,
): NavNode[] {
  const isSA    = isSuperAdmin || role === "super_admin";
  const isAdmin = ADMIN_ROLES.includes(role) || isSA;
  const p = userPermissions;

  const books: NavChild[] = [];
  if (perm(p, "books",   "write")) books.push({ name: "Upload Book",   href: "/admin/upload",        icon: Upload         });
  if (perm(p, "books",   "write")) books.push({ name: "Review Queue",  href: "/admin/review",        icon: ClipboardCheck });
  if (perm(p, "books",   "read"))  books.push({ name: "Manage Books",  href: "/admin/manage",        icon: BookCopy       });
  if (perm(p, "catalog", "read"))  books.push({ name: "Catalog",       href: "/admin/catalogs",      icon: Library        });
  if (perm(p, "books",   "read"))  books.push({ name: "Book Requests", href: "/admin/book-requests", icon: BookPlus       });

  const content: NavChild[] = [];
  if (perm(p, "posts",          "read")) content.push({ name: "Posts",          href: "/admin/posts",         icon: FileText      });
  if (perm(p, "research",       "read")) content.push({ name: "Theses",         href: "/admin/theses",        icon: GraduationCap });
  if (perm(p, "publications",   "read")) content.push({ name: "Publications",   href: "/admin/publications",  icon: ScrollText    });
  if (perm(p, "learning_paths", "read")) content.push({ name: "Learning Paths", href: "/admin/paths",         icon: Route         });
  if (perm(p, "announcements",  "read")) content.push({ name: "Announcements",  href: "/admin/announcements", icon: Megaphone     });

  const insights: NavChild[] = [];
  if (perm(p, "books", "read")) insights.push({ name: "Search Insights", href: "/admin/search-insights", icon: SearchX });
  if (perm(p, "books", "read")) insights.push({ name: "Data Quality",    href: "/admin/data-quality",    icon: Gauge   });

  // Administration — role-gated items (security-sensitive) live here too
  const administration: NavChild[] = [];
  if (perm(p, "users", "write"))         administration.push({ name: "Library Team",  href: "/admin/team",  icon: UserCircle  });
  if (perm(p, "users", "write"))         administration.push({ name: "Users",         href: "/admin/users", icon: Users       });
  if (perm(p, "roles", "write") || isSA) administration.push({ name: "Roles",         href: "/admin/roles", icon: ShieldCheck });
  if (isAdmin)                           administration.push({ name: "Security Logs", href: "/admin/logs",  icon: Shield      });

  const tree: NavNode[] = [
    { type: "link", name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  ];
  if (books.length)          tree.push({ type: "group", name: "Books",          icon: BookOpen,  children: books          });
  if (content.length)        tree.push({ type: "group", name: "Content",        icon: Newspaper, children: content        });
  if (insights.length)       tree.push({ type: "group", name: "Insights",       icon: BarChart3, children: insights       });
  if (administration.length) tree.push({ type: "group", name: "Administration", icon: Settings,  children: administration });
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
  link: { name: string; href: string; icon: NavIcon };
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
        className="relative flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer"
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
            style={{ background: "#DDB022" }}
          />
        )}
        <Icon
          className="shrink-0 transition-transform duration-200 group-hover/nav-item:scale-110"
          style={{
            width: "18px",
            height: "18px",
            color: active ? "#DDB022" : "rgba(255,255,255,0.55)",
          }}
        />
        {!collapsed && <span className="truncate">{link.name}</span>}
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
      className="relative flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 cursor-pointer"
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
        style={{ background: active ? "#DDB022" : "transparent" }}
      />
      <Icon
        className="shrink-0"
        style={{
          width: "15px",
          height: "15px",
          color: active ? "#DDB022" : "rgba(255,255,255,0.42)",
        }}
      />
      <span className="truncate">{link.name}</span>
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
  // header (~34px) + rows (~36px each) + padding
  const [flyRef, flyTop, showFly, hideFly] = useFlyout(50 + group.children.length * 36);

  // ── Collapsed sidebar: icon + hover flyout submenu ──
  if (collapsed) {
    return (
      <div
        ref={flyRef}
        className="relative group/nav-item"
        onMouseEnter={showFly}
        onMouseLeave={hideFly}
      >
        <div
          className="flex items-center justify-center rounded-xl transition-all duration-200 cursor-pointer"
          style={{
            padding: "10px",
            background: childActive ? "rgba(255,255,255,0.14)" : undefined,
            boxShadow: childActive ? "inset 0 0 0 1px rgba(255,255,255,0.08)" : undefined,
          }}
        >
          {childActive && (
            <span
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
              style={{ background: "#DDB022" }}
            />
          )}
          <Icon
            className="shrink-0"
            style={{
              width: "18px",
              height: "18px",
              color: childActive ? "#DDB022" : "rgba(255,255,255,0.55)",
            }}
          />
        </div>

        {/* Flyout submenu — hover to open, links are clickable */}
        {flyTop !== null && (
        <div
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
                    onClick={() => { hideFly(); onNavigate(); }}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-150 cursor-pointer"
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
                        color: active ? "#DDB022" : "rgba(255,255,255,0.45)",
                      }}
                    />
                    <span className="truncate">{child.name}</span>
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
        className="w-full flex items-center gap-3 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer"
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
            color: childActive ? "#DDB022" : "rgba(255,255,255,0.55)",
          }}
        />
        <span className="flex-1 text-left truncate">{group.name}</span>
        {/* Active dot when the group is closed but holds the current page */}
        {childActive && !open && (
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#DDB022" }} />
        )}
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

function getRoleLabel(role: AppRole, isSuperAdmin: boolean): string {
  if (isSuperAdmin || role === "super_admin") return "Super Admin";
  if (role === "admin") return "Admin";
  if (role === "librarian") return "Librarian";
  if (role === "staff") return "Staff";
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
}: {
  children: React.ReactNode;
  email: string | undefined;
  fullName?: string | null;
  avatarUrl?: string | null;
  role?: AppRole;
  isSuperAdmin?: boolean;
  userPermissions?: Record<string, PermLevel>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const profileRef = useRef<HTMLDivElement>(null);

  const navTree = getNavTree(role, isSuperAdmin, userPermissions);
  const roleLabel = getRoleLabel(role, isSuperAdmin);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const activeGroupName = (() => {
    for (const node of navTree) {
      if (node.type === "group" && node.children.some(c => isActive(c.href))) return node.name;
    }
    return null;
  })();

  // Open the group holding the current page by default (deterministic for SSR).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    activeGroupName ? { [activeGroupName]: true } : {},
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
  const [revealedGroup, setRevealedGroup] = useState(activeGroupName);
  if (activeGroupName !== revealedGroup) {
    setRevealedGroup(activeGroupName);
    if (activeGroupName && !openGroups[activeGroupName]) {
      setOpenGroups(prev => ({ ...prev, [activeGroupName]: true }));
    }
  }

  const toggleGroup = (name: string) => {
    setOpenGroups(prev => {
      const next = { ...prev, [name]: !prev[name] };
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

  function handleSearch(e: React.SyntheticEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/admin/manage?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  }

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
    <div className="flex h-screen overflow-hidden bg-bg-app text-text-heading font-body">

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
          <span className="font-bold text-white text-sm tracking-tight">PTEC Admin</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-lg cursor-pointer transition-colors"
          style={{ color: "rgba(255,255,255,0.80)" }}
          aria-label="Toggle navigation menu"
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
        className={`
          fixed inset-y-0 left-0 z-40 flex flex-col admin-sidebar
          transform transition-all duration-300 ease-in-out
          lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shrink-0
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
              <div className="font-bold text-base tracking-tight text-white leading-tight">PTEC Library</div>
              <div
                className="text-[11px] font-medium tracking-wide"
                style={{ color: "rgba(255,255,255,0.40)" }}
              >
                Admin Panel
              </div>
            </div>
          )}
        </div>

        {/* ── Navigation: parent groups with expandable children ── */}
        <nav
          className="flex-1 overflow-y-auto space-y-1"
          style={{ padding: collapsed ? "12px 8px" : "12px 10px" }}
        >
          {navTree.map(node =>
            node.type === "link" ? (
              <TopLevelLink
                key={node.href}
                link={node}
                active={isActive(node.href)}
                collapsed={collapsed}
                onClick={() => setMobileOpen(false)}
              />
            ) : (
              <NavGroup
                key={node.name}
                group={node}
                collapsed={collapsed}
                open={!!openGroups[node.name]}
                onToggle={() => toggleGroup(node.name)}
                isActive={isActive}
                onNavigate={() => setMobileOpen(false)}
              />
            ),
          )}
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
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed
              ? <PanelLeftOpen className="w-4 h-4 shrink-0" />
              : (
                <>
                  <PanelLeftClose className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-medium">Collapse</span>
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
            {!collapsed && <span className="text-xs font-medium">View public site</span>}
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
              {!collapsed && <span className="text-xs font-medium">Sign out</span>}
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
              style={{ background: "linear-gradient(to bottom, #DDB022, #4f46e5)" }}
            />
            <h1 className="text-sm font-semibold text-text-heading capitalize truncate">{pageLabel}</h1>

          </div>

          {/* Center: search bar */}
          <form onSubmit={handleSearch} className="hidden xl:flex flex-1 max-w-sm">
            <div
              className="flex items-center gap-2 w-full rounded-xl border px-3 py-2 transition-all duration-200 focus-within:ring-2"
              style={{
                background: "var(--color-bg-app, #F8FAFC)",
                borderColor: "var(--color-divider, #E2E8F0)",
                // @ts-expect-error: custom property
                "--tw-ring-color": "rgba(79,70,229,0.25)",
              }}
            >
              <Search className="w-4 h-4 shrink-0" style={{ color: "#94A3B8" }} />
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search books, reports…"
                className="flex-1 bg-transparent text-sm outline-none text-text-heading placeholder:text-slate-400"
                aria-label="Search admin"
              />
              {searchQuery && (
                <kbd className="hidden sm:inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 select-none">
                  ↵
                </kbd>
              )}
            </div>
          </form>

          {/* Right: actions + avatar */}
          <div className="flex items-center gap-2 shrink-0">

            {/* Notification bell — self-contained with polling + slide panel */}
            <NotificationBell />

            {/* Profile settings shortcut */}
            <button
              type="button"
              className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-200 hover:bg-slate-100"
              style={{ color: "#64748B" }}
              aria-label="My profile"
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
                className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 cursor-pointer transition-all duration-200 hover:bg-slate-100"
                aria-label="Open profile menu"
                aria-expanded={profileOpen}
              >
                <Avatar url={avatarUrl} name={fullName} email={email ?? "admin"} size={32} />
                {/* Name + role */}
                <div className="hidden xl:flex flex-col items-start min-w-0 max-w-[140px]">
                  <span className="text-xs font-semibold text-text-heading truncate leading-tight max-w-full">
                    {fullName ?? email?.split("@")[0] ?? "Admin"}
                  </span>
                  <span className="text-[10px] leading-tight truncate max-w-full" style={{ color: "#94A3B8" }}>
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
                      <span>View public site</span>
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
                        <span>Sign out</span>
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
