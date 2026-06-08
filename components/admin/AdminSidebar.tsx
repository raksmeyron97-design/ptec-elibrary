"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { useState } from "react";
import Image from "next/image";
import ManageCategoriesModal from "./ManageCategoriesModal";
import ManageDepartmentsModal from "./ManageDepartmentsModal";

const navLinks = [
  { name: "Dashboard",         href: "/admin",                  icon: LayoutDashboard },
  { name: "Upload Book",       href: "/admin/upload",           icon: Upload },
  { name: "Manage Books",      href: "/admin/manage",           icon: BookOpen },
  { name: "Catalog",           href: "/admin/catalogs",         icon: Library },
  { name: "Posts",             href: "/admin/posts",            icon: FileText },
  { name: "Research Reports",  href: "/admin/research-reports", icon: GraduationCap },
  { name: "Users",             href: "/admin/users",            icon: Users },
];

export default function AdminSidebar({
  children,
  email,
}: {
  children: React.ReactNode;
  email: string | undefined;
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const handleNavClick = () => setIsOpen(false);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const SidebarContent = () => (
    <>
      {/* ── Logo header ── */}
      <div className="px-5 py-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 p-1"
            style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}>
            <Image src="/logo_footer.png" alt="PTEC Logo" width={32} height={32} className="object-contain" />
          </div>
          <div>
            <div className="font-bold text-base tracking-tight text-white leading-tight">PTEC Library</div>
            <div className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>Admin Panel</div>
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {navLinks.map((link) => {
          const active = isActive(link.href);
          const Icon = link.icon;
          return (
            <Link
              key={link.name}
              href={link.href}
              onClick={handleNavClick}
              className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                active
                  ? "text-white"
                  : "hover:text-white"
              }`}
              style={
                active
                  ? { background: "rgba(255,255,255,0.14)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }
                  : undefined
              }
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "";
              }}
            >
              {/* Gold active-indicator bar */}
              {active && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
                  style={{ background: "#DDB022" }}
                />
              )}
              <Icon
                className="w-[18px] h-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110"
                style={{ color: active ? "#DDB022" : "rgba(255,255,255,0.60)" }}
              />
              <span style={{ color: active ? "#FFFFFF" : "rgba(255,255,255,0.65)" }}>
                {link.name}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* ── Footer ── */}
      <div className="px-3 pb-4 pt-3 border-t border-white/10 space-y-0.5">
        {email && (
          <div className="px-3 py-1.5 text-[11px] font-mono truncate" style={{ color: "rgba(255,255,255,0.35)" }}>
            {email}
          </div>
        )}
        <a
          href={
            process.env.NEXT_PUBLIC_ROOT_DOMAIN
              ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
              : "http://localhost:3000"
          }
          className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-xl transition-all duration-200"
          style={{ color: "rgba(255,255,255,0.60)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
            (e.currentTarget as HTMLElement).style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.60)";
          }}
        >
          <ExternalLink className="w-4 h-4 shrink-0" />
          View public site
        </a>

        <form action="/admin/auth/signout" method="POST">
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-sm rounded-xl transition-all duration-200"
            style={{ color: "rgba(255,255,255,0.60)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.12)";
              (e.currentTarget as HTMLElement).style.color = "#FCA5A5";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "";
              (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.60)";
            }}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Log out
          </button>
        </form>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-bg-app text-text-heading font-body">
      {/* Mobile Topbar */}
      <div
        className="lg:hidden fixed top-0 left-0 right-0 h-16 flex items-center px-4 justify-between z-20"
        style={{ background: "linear-gradient(160deg, #1E3A8A 0%, #0F2160 100%)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center p-0.5"
            style={{ background: "rgba(255,255,255,0.15)" }}>
            <Image src="/logo_footer.png" alt="PTEC" width={24} height={24} className="object-contain" />
          </div>
          <span className="font-bold text-white text-sm">Library Admin</span>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-lg transition-colors"
          style={{ color: "rgba(255,255,255,0.80)" }}
        >
          {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-64 admin-sidebar flex flex-col transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:shrink-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-0 pt-16 lg:pt-0">
        {/* Desktop topbar */}
        <div className="hidden lg:flex h-16 bg-bg-surface border-b border-divider items-center justify-between px-8 shrink-0 shadow-sm">
          <h1 className="text-lg font-semibold text-text-heading capitalize">
            {pathname === "/admin" ? "Dashboard" : pathname.split("/").pop()?.replace(/-/g, " ")}
          </h1>
          <div className="flex items-center gap-3">
            {pathname === "/admin/upload" && (
              <>
                <ManageCategoriesModal />
                <ManageDepartmentsModal />
              </>
            )}
          </div>
        </div>

        <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
