"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

// ── Icons ─────────────────────────────────────────────────────
const HomeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const BookIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
);

const PostsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
);

const AboutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="8"/>
    <line x1="12" y1="12" x2="12" y2="16"/>
  </svg>
);

const PersonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

// ── Types ─────────────────────────────────────────────────────
type UserInfo = {
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "reader" | "admin";
};

type MobileBottomNavProps = {
  user: UserInfo | null;
};

// ── Helpers ───────────────────────────────────────────────────
function getInitials(name: string | null, email: string) {
  if (name) {
    return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  }
  return email.slice(0, 2).toUpperCase();
}

// ── Nav items (left 2 + right 2, profile in center) ───────────
const leftNav = [
  { label: "Home",        href: "/home",  Icon: HomeIcon  },
  { label: "E-Resources", href: "/books", Icon: BookIcon  },
];
const rightNav = [
  { label: "Posts", href: "/posts", Icon: PostsIcon },
  { label: "About", href: "/about", Icon: AboutIcon },
];

// ── Sheet menu items ──────────────────────────────────────────
const sheetLinks = [
  {
    label: "E-Resources",
    href: "/books",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
      </svg>
    ),
  },
  {
    label: "Posts",
    href: "/posts",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
  {
    label: "About",
    href: "/about",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="8"/>
        <line x1="12" y1="12" x2="12" y2="16"/>
      </svg>
    ),
  },
];

// ── Component ─────────────────────────────────────────────────
export default function MobileBottomNav({ user }: MobileBottomNavProps) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Close sheet on route change
  useEffect(() => { setSheetOpen(false); }, [pathname]);

  // Lock body scroll when sheet is open
  useEffect(() => {
    document.body.style.overflow = sheetOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sheetOpen]);

  function NavLink({ href, Icon, label }: { href: string; Icon: React.FC; label: string }) {
    const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
    return (
      <Link
        href={href}
        className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors group ${
          isActive ? "text-[#007c91]" : "text-slate-400 hover:text-[#007c91]"
        }`}
      >
        {isActive && <span className="absolute inset-0 bg-[#007c91]/8 rounded-xl" />}
        {isActive && (
          <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[3px] bg-[#007c91] rounded-b-full" />
        )}
        <span className={`relative transition-transform ${isActive ? "scale-110" : "group-hover:scale-110"}`}>
          <Icon />
        </span>
        <span className={`relative text-[10px] tracking-wide ${isActive ? "font-bold" : "font-medium"}`}>
          {label}
        </span>
      </Link>
    );
  }

  return (
    <>
      {/* ── Bottom nav bar ─────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-around h-16 px-2">

          {/* Left items */}
          {leftNav.map((item) => (
            <NavLink key={item.href} href={item.href} Icon={item.Icon} label={item.label} />
          ))}

          {/* Center profile button */}
          <button
            onClick={() => setSheetOpen(true)}
            aria-label="Open profile menu"
            className="relative flex flex-col items-center -mt-5"
          >
            {/* Lifted circle platform */}
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-white shadow-[0_4px_20px_rgba(0,124,145,0.25)] border-[3px] border-white ring-2 ring-[#007c91]/20 transition-transform active:scale-95">
              {user?.avatar_url ? (
                <Image
                  src={user.avatar_url}
                  alt={user.full_name || user.email}
                  width={52}
                  height={52}
                  className="rounded-full object-cover w-full h-full"
                />
              ) : user ? (
                <div className="flex items-center justify-center w-full h-full rounded-full bg-[#007c91] text-white text-sm font-bold">
                  {getInitials(user.full_name, user.email)}
                </div>
              ) : (
                <div className="flex items-center justify-center w-full h-full rounded-full bg-slate-100 text-slate-400">
                  <PersonIcon />
                </div>
              )}
            </div>
            <span className="text-[10px] font-medium text-slate-400 mt-1 tracking-wide">
              {user ? "Profile" : "Login"}
            </span>
          </button>

          {/* Right items */}
          {rightNav.map((item) => (
            <NavLink key={item.href} href={item.href} Icon={item.Icon} label={item.label} />
          ))}
        </div>

        {/* iOS safe area */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>

      {/* ── Profile bottom sheet ───────────────────────────── */}

      {/* Backdrop */}
      <div
        onClick={() => setSheetOpen(false)}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 60,
          backgroundColor: "rgba(15, 23, 42, 0.45)",
          backdropFilter: "blur(2px)",
          opacity: sheetOpen ? 1 : 0,
          pointerEvents: sheetOpen ? "auto" : "none",
          transition: "opacity 280ms ease",
        }}
      />

      {/* Sheet panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Profile menu"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 70,
          backgroundColor: "#ffffff",
          borderRadius: "20px 20px 0 0",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.15)",
          transform: sheetOpen ? "translateY(0)" : "translateY(100%)",
          transition: "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-slate-300" />
        </div>

        {/* Profile header */}
        {user ? (
          <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
            <div className="relative w-12 h-12 shrink-0">
              {user.avatar_url ? (
                <Image
                  src={user.avatar_url}
                  alt={user.full_name || user.email}
                  fill
                  sizes="48px"
                  className="rounded-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#007c91] text-white text-sm font-bold">
                  {getInitials(user.full_name, user.email)}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-slate-900">
                {user.full_name || user.email}
              </p>
              <p className="truncate text-xs text-slate-400">{user.email}</p>
              {user.role === "admin" && (
                <span className="inline-flex items-center mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#007c91]/10 text-[#007c91]">
                  Admin
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-sm text-slate-500">Sign in to access your library account.</p>
          </div>
        )}

        {/* Menu links */}
        <nav className="px-3 py-3 space-y-0.5">
          {sheetLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSheetOpen(false)}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <span className="text-slate-400">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Footer: login or sign out */}
        <div className="px-5 pb-4 pt-2 border-t border-slate-100">
          {user ? (
            <form action="/auth/signout" method="POST">
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-100 active:scale-[0.98] transition-all"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Logout
              </button>
            </form>
          ) : (
            <Link
              href="/auth/login"
              onClick={() => setSheetOpen(false)}
              className="flex w-full items-center justify-center rounded-xl bg-[#0a1629] px-4 py-3 text-sm font-semibold text-white hover:bg-[#007c91] active:scale-[0.98] transition-all"
            >
              Login
            </Link>
          )}
        </div>

        {/* iOS safe area */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </>
  );
}