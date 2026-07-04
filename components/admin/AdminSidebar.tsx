"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Upload,
  BookOpen,
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
  Shield,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  UserCircle,
  Search,
  ChevronDown,
  Settings,
  BookPlus,
} from "lucide-react";
import type { AppRole, PermLevel } from "@/lib/types/roles";
import { ADMIN_ROLES } from "@/lib/types/roles";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Avatar from "@/components/ui/Avatar";
import NotificationBell from "@/components/admin/NotificationBell";

type NavLink = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
};

function perm(perms: Record<string, PermLevel>, resource: string, minLevel: "read" | "write"): boolean {
  const level = perms[resource] ?? "none";
  return minLevel === "write" ? level === "write" : level !== "none";
}

function getNavGroups(
  role: AppRole,
  isSuperAdmin: boolean,
  userPermissions: Record<string, PermLevel>,
): { label: string; links: NavLink[] }[] {
  const isSA    = isSuperAdmin || role === "super_admin";
  const isAdmin = ADMIN_ROLES.includes(role) || isSA;
  const p = userPermissions;

  // Content — driven entirely by the DB permission matrix
  const contentLinks: NavLink[] = [];
  if (perm(p, "books",         "write")) contentLinks.push({ name: "Upload Book",      href: "/admin/upload",           icon: Upload        });
  if (perm(p, "books",         "read"))  contentLinks.push({ name: "Manage Books",     href: "/admin/manage",           icon: BookOpen      });
  if (perm(p, "catalog",       "read"))  contentLinks.push({ name: "Catalog",          href: "/admin/catalogs",         icon: Library       });
  if (perm(p, "posts",         "read"))  contentLinks.push({ name: "Posts",            href: "/admin/posts",            icon: FileText      });
  if (perm(p, "research",      "read"))  contentLinks.push({ name: "Theses",           href: "/admin/theses",            icon: GraduationCap });
  if (perm(p, "publications",  "read"))  contentLinks.push({ name: "Publications",     href: "/admin/publications",     icon: ScrollText    });
  if (perm(p, "announcements", "read"))  contentLinks.push({ name: "Announcements",    href: "/admin/announcements",    icon: Megaphone     });
  if (perm(p, "books",         "read"))  contentLinks.push({ name: "Book Requests",    href: "/admin/book-requests",    icon: BookPlus      });
  if (perm(p, "users",         "write")) contentLinks.push({ name: "Library Team",     href: "/admin/team",             icon: UserCircle    });

  // System — role-gated (security-sensitive, not overridable via permission matrix)
  const systemLinks: NavLink[] = [];
  if (isAdmin) systemLinks.push({ name: "Security Logs", href: "/admin/logs",  icon: Shield      });
  if (perm(p, "users", "write")) systemLinks.push({ name: "Users", href: "/admin/users", icon: Users });
  if (perm(p, "roles", "write") || isSA) systemLinks.push({ name: "Roles", href: "/admin/roles", icon: ShieldCheck });

  const groups: { label: string; links: NavLink[] }[] = [
    { label: "Overview", links: [{ name: "Dashboard", href: "/admin", icon: LayoutDashboard }] },
    { label: "Content", links: contentLinks },
  ];
  if (systemLinks.length > 0) {
    groups.push({ label: "System", links: systemLinks });
  }
  return groups;
}

function NavItem({
  link,
  active,
  collapsed,
  onClick,
}: {
  link: NavLink;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = link.icon;

  return (
    <div className="relative group/nav-item">
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
        {!collapsed && (
          <span className="truncate">{link.name}</span>
        )}
      </Link>

      {/* Tooltip — shown only in collapsed mode */}
      {collapsed && (
        <div
          className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 opacity-0 scale-95
                     group-hover/nav-item:opacity-100 group-hover/nav-item:scale-100
                     transition-all duration-150"
        >
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

function getRoleLabel(role: AppRole, isSuperAdmin: boolean): string {
  if (isSuperAdmin || role === "super_admin") return "Super Admin";
  if (role === "admin") return "Admin";
  if (role === "librarian") return "Librarian";
  if (role === "staff") return "Staff";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

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

  const navGroups = getNavGroups(role, isSuperAdmin, userPermissions);
  const roleLabel = getRoleLabel(role, isSuperAdmin);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("admin-sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

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

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const pageLabel = (() => {
    for (const g of navGroups) {
      for (const l of g.links) {
        if (isActive(l.href)) return l.name;
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

        {/* ── Navigation ── */}
        <nav
          className="flex-1 overflow-y-auto space-y-1"
          style={{ padding: collapsed ? "12px 8px" : "12px 10px" }}
        >
          {navGroups.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? "pt-3" : ""}>
              {/* Section label */}
              {!collapsed ? (
                <div
                  className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-widest select-none"
                  style={{ color: "rgba(255,255,255,0.25)" }}
                >
                  {group.label}
                </div>
              ) : gi > 0 ? (
                <div
                  className="mb-2 mx-2 h-px"
                  style={{ background: "rgba(255,255,255,0.10)" }}
                />
              ) : null}

              <div className="space-y-0.5">
                {group.links.map(link => (
                  <NavItem
                    key={link.name}
                    link={link}
                    active={isActive(link.href)}
                    collapsed={collapsed}
                    onClick={() => setMobileOpen(false)}
                  />
                ))}
              </div>
            </div>
          ))}
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
