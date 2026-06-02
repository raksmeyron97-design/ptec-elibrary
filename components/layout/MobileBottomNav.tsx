"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useTranslations } from 'next-intl';

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
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none"
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

// Removed arrays from here

// ── Component ─────────────────────────────────────────────────
export default function MobileBottomNav({ user }: MobileBottomNavProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  // ── Nav items (left 2 + right 2, profile in center) ───────────
  const leftNav = [
    { label: t("home"),        href: "/home",  Icon: HomeIcon  },
    { label: t("eResources"), href: "/books", Icon: BookIcon  },
  ];
  const rightNav = [
    { label: t("posts"), href: "/posts", Icon: PostsIcon },
    { label: t("about"), href: "/about", Icon: AboutIcon },
  ];

  // ── Sheet menu items ──────────────────────────────────────────
  const sheetLinks = [
    {
      label: t("myDashboard"),
      href: "/dashboard",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      ),
    },
    {
      label: t("savedBooks"),
      href: "/books",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
      ),
    },
    {
      label: t("posts"),
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
      label: t("about"),
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
          isActive ? "text-brand" : "text-text-muted hover:text-brand"
        }`}
      >
        {isActive && <span className="absolute inset-0 bg-brand/10 rounded-xl" />}
        {isActive && (
          <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[3px] bg-brand rounded-b-full" />
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
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg-surface/95 backdrop-blur-md border-t border-divider/80 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-around h-16 px-2">

          {/* Left items */}
          {leftNav.map((item) => (
            <NavLink key={item.href} href={item.href} Icon={item.Icon} label={item.label} />
          ))}

          {/* Center profile button */}
          <button
            onClick={() => setSheetOpen(true)}
            aria-label="Open profile menu"
            className="relative flex items-center justify-center px-3 py-2 transition-transform active:scale-95 group"
          >
            <div className="relative flex items-center justify-center w-10 h-10 overflow-hidden rounded-full ring-[1.5px] ring-divider transition-all group-hover:ring-focus-ring/50">
              {user?.avatar_url ? (
                <Image
                  src={user.avatar_url}
                  alt={user.full_name || user.email}
                  fill
                  className="object-cover"
                />
              ) : user ? (
                <div className="flex items-center justify-center w-full h-full bg-brand text-brand-contrast text-[13px] font-bold">
                  {getInitials(user.full_name, user.email)}
                </div>
              ) : (
                <div className="flex items-center justify-center w-full h-full bg-paper text-text-muted">
                  <PersonIcon />
                </div>
              )}
            </div>
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
        className="fixed inset-0 z-[60] bg-slate-950/45 backdrop-blur-[2px] transition-opacity duration-300 motion-reduce:transition-none"
        style={{
          opacity: sheetOpen ? 1 : 0,
          pointerEvents: sheetOpen ? "auto" : "none",
        }}
      />

      {/* Sheet panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Profile menu"
        className="fixed bottom-0 left-0 right-0 z-[70] rounded-t-[20px] bg-bg-surface shadow-[0_-8px_40px_rgba(0,0,0,0.15)] transition-transform duration-300 motion-reduce:transition-none"
        style={{
          transform: sheetOpen ? "translateY(0)" : "translateY(100%)",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-paper" />
        </div>

        {/* Profile header */}
        {user ? (
          <div className="flex items-center gap-3 px-5 py-4 border-b border-divider">
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
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-brand text-brand-contrast text-sm font-bold">
                  {getInitials(user.full_name, user.email)}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-text-heading">
                {user.full_name || "Welcome User"}
              </p>
              <p className="truncate text-xs text-text-muted">{user.email}</p>
              {user.role === "admin" && (
                <span className="inline-flex items-center mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand/10 text-brand">
                  Admin
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="px-5 py-4 border-b border-divider">
            <p className="text-sm text-text-muted">Sign in to access your library account.</p>
          </div>
        )}

        {/* Menu links */}
        <nav className="px-3 py-3 space-y-0.5">
          {sheetLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSheetOpen(false)}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-medium text-text-body hover:bg-paper active:bg-paper transition-colors"
            >
              <span className="text-text-muted">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Footer: login or sign out */}
        <div className="px-5 pb-4 pt-2 border-t border-divider">
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
                {t('logout')}
              </button>
            </form>
          ) : (
            <Link
              href="/auth/login"
              onClick={() => setSheetOpen(false)}
              className="flex w-full items-center justify-center rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-contrast hover:bg-brand-hover active:scale-[0.98] transition-all"
            >
              {t('login')}
            </Link>
          )}
        </div>

        {/* iOS safe area */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </>
  );
}
