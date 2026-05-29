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
  X
} from "lucide-react";
import { useState } from "react";
import Image from "next/image";

const navLinks = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Upload Book", href: "/admin", icon: Upload }, // Update if split later
  { name: "Manage Books", href: "/admin/manage", icon: BookOpen },
  { name: "Catalog", href: "/admin/catalogs", icon: Library },
  { name: "Posts", href: "/admin/posts", icon: FileText },
  { name: "Users", href: "/admin/users", icon: Users },
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

  // Close sidebar on navigation on mobile
  const handleNavClick = () => setIsOpen(false);

  const SidebarContent = () => (
    <>
      <div className="p-6">
        <div className="flex items-center gap-3">
          {/* Logo placeholder, user provides public/logo-ptec.png */}
          <div className="w-10 h-10 bg-white rounded flex items-center justify-center shrink-0">
            <span className="text-[#1E3A8A] font-bold text-xs">PTEC</span>
          </div>
          <span className="font-bold text-xl tracking-tight">Library Admin</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
        {navLinks.map((link) => {
          // simple active matching
          const isActive =
            link.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(link.href);
          const Icon = link.icon;
          return (
            <Link
              key={link.name}
              href={link.href}
              onClick={handleNavClick}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? "bg-[#DDB022] text-[#1E3A8A] font-medium"
                  : "text-white hover:bg-white/10"
              }`}
            >
              <Icon className="w-5 h-5" />
              {link.name}
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-white/10 space-y-4">
        {email && (
          <div className="px-3 text-sm text-white/70 truncate">
            {email}
          </div>
        )}
        <div className="space-y-1">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2 text-sm text-white/80 hover:text-white transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            View public site &rarr;
          </Link>

          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="flex w-full items-center gap-3 px-3 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </button>
          </form>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-[#F3F4F6] text-slate-900 font-body">
      {/* Mobile Topbar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-[#1E3A8A] text-white flex items-center px-4 justify-between z-20">
        <div className="flex items-center gap-2">
          <span className="font-bold">Library Admin</span>
        </div>
        <button onClick={() => setIsOpen(!isOpen)} className="p-2">
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Mobile Overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Desktop + Mobile Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#1E3A8A] text-white flex flex-col transform transition-transform duration-300 lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:shrink-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen pt-16 lg:pt-0">
        {/* Topbar Desktop Breadcrumb / Title Area */}
        <div className="hidden lg:flex h-16 bg-white border-b border-gray-200 items-center px-8 shrink-0">
          <h1 className="text-xl font-semibold capitalize">
            {pathname === "/admin" ? "Dashboard" : pathname.split("/").pop()}
          </h1>
        </div>

        <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
