"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { AppRole } from "@/lib/types/roles";
import { ADMIN_PANEL_ROLES, ROLE_META } from "@/lib/types/roles";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useMountTransition } from "@/lib/hooks/useMountTransition";
import { useSession } from "@/components/providers/SessionProvider";
import { clearPrivateBrowserState } from "@/lib/sw-client";

// ── Icons ──────────────────────────────────────────────────────
const HomeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const BookIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
);

const PostsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);

const PersonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7"/>
    <path d="m21 21-4.35-4.35"/>
  </svg>
);

// ── Nav link (desktop uses separate component; this is mobile-only) ──
function NavLink({ href, Icon, label, pathname }: { href: string; Icon: React.FC; label: string, pathname: string }) {
  const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`relative flex flex-col items-center gap-[3px] min-w-[52px] py-1.5 group ${
        isActive ? "text-brand font-bold" : "text-text-muted font-medium"
      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface rounded-lg`}
    >
      <span
        className="transition-transform duration-200 ease-out"
        style={{ transform: isActive ? "scale(1.15)" : "scale(1)" }}
      >
        <Icon />
      </span>
      <span className="text-[11px] tracking-wide whitespace-nowrap overflow-visible">
        {label}
      </span>
      <span
        aria-hidden
        className="absolute top-[2px] w-1 h-1 rounded-full bg-brand transition-all duration-200 ease-out"
        style={{
          transform: isActive ? "scale(1)" : "scale(0)",
          opacity: isActive ? 1 : 0,
        }}
      />
    </Link>
  );
}

// ── Types ──────────────────────────────────────────────────────

// ── Helpers ────────────────────────────────────────────────────
function getInitials(name: string | null, email: string) {
  if (name) return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return email.slice(0, 2).toUpperCase();
}


// ── Component ──────────────────────────────────────────────────
export default function MobileBottomNav() {
  const { user } = useSession();
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheet = useMountTransition(sheetOpen);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const showAvatar = !!user?.avatar_url && !avatarFailed;

  // Search owns the center slot — it is the #1 task of a library. The profile
  // sheet trigger moves to the right edge.
  const leftNav = [
    { label: t("home"),        href: "/",  Icon: HomeIcon  },
    { label: t("eResources"),  href: "/books", Icon: BookIcon  },
  ];
  const rightNav = [
    { label: t("postsShort"), href: "/posts", Icon: PostsIcon },
  ];

  const sheetLinks = [
    {
      label: t("myDashboard"), href: "/dashboard",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    },
    {
      label: t("savedBooks"), href: "/dashboard#saved",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>,
    },
    {
      label: t("posts"), href: "/posts",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
    },
    {
      label: t("about"), href: "/about",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="8"/><line x1="12" y1="12" x2="12" y2="16"/></svg>,
    },
  ];

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  // Close sheet on route change
  useEffect(() => { closeSheet(); }, [pathname, closeSheet]);

  // Close on Escape while open; trap focus inside the sheet.
  useEffect(() => {
    if (!sheetOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSheetOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen]);
  // Keyed to open && mounted: the trap must (re-)arm only after the sheet
  // element actually exists, or the container ref is still null.
  const sheetTrapRef = useFocusTrap<HTMLDivElement>(sheetOpen && sheet.mounted);

  // Lock body scroll when sheet is open
  useEffect(() => {
    document.body.style.overflow = sheetOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sheetOpen]);

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg-surface/94 backdrop-blur-[20px] saturate-150 border-t border-divider/50 shadow-[0_-6px_24px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-around h-[64px] px-2 relative">

          {leftNav.map((item) => (
            <NavLink key={item.href} href={item.href} Icon={item.Icon} label={item.label} pathname={pathname} />
          ))}

          {/* Center: Search — the primary library task gets the prime slot. */}
          <Link
            href="/search"
            aria-label={t("searchLibrary")}
            aria-current={pathname.startsWith("/search") ? "page" : undefined}
            className="relative z-10 -mt-5 flex flex-col items-center gap-[3px] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
          >
            <span
              className={`flex h-[50px] w-[50px] items-center justify-center rounded-full shadow-[0_2px_10px_rgba(30,58,138,0.35)] transition-transform active:scale-95 ${
                pathname.startsWith("/search") ? "bg-brand-hover" : "bg-brand"
              } text-white`}
            >
              <SearchIcon />
            </span>
            <span className={`text-[11px] tracking-wide whitespace-nowrap ${pathname.startsWith("/search") ? "text-brand font-bold" : "text-text-muted font-medium"}`}>
              {t("searchShort")}
            </span>
          </Link>

          {rightNav.map((item) => (
            <NavLink key={item.href} href={item.href} Icon={item.Icon} label={item.label} pathname={pathname} />
          ))}

          {/* Right edge: profile sheet trigger */}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label={t("profileMenu")}
            aria-expanded={sheetOpen}
            className="relative flex min-w-[52px] flex-col items-center gap-[3px] rounded-lg py-1.5 text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
          >
            <span className="flex h-[22px] w-[22px] items-center justify-center overflow-hidden rounded-full">
              {showAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user!.avatar_url!}
                  alt={user!.full_name || user!.email}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : user ? (
                <span className="flex h-full w-full items-center justify-center rounded-full bg-brand text-[9px] font-bold tracking-wider text-brand-contrast">
                  {getInitials(user.full_name, user.email)}
                </span>
              ) : (
                <PersonIcon />
              )}
            </span>
            <span className="text-[11px] font-medium tracking-wide whitespace-nowrap">
              {t("profile")}
            </span>
          </button>
        </div>

        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>

      {/* ── Backdrop ────────────────────────────────────────────── */}
      {sheet.mounted && (
        <div
          onClick={closeSheet}
          aria-hidden="true"
          className="fixed inset-0 z-[60] bg-slate-950/40 backdrop-blur-[2px] transition-opacity duration-200 ease-out"
          style={{ opacity: sheet.shown ? 1 : 0 }}
        />
      )}

      {/* ── Sheet panel ─────────────────────────────────────────── */}
      {sheet.mounted && (
          <div
            ref={sheetTrapRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("profileMenu")}
            // Mounted-but-closing (exit transition): hide from AT and block focus.
            inert={!sheetOpen}
            aria-hidden={!sheetOpen}
            tabIndex={-1}
            className="fixed bottom-0 left-0 right-0 z-[70] rounded-t-[20px] bg-bg-surface shadow-[0_-6px_32px_rgba(0,0,0,0.12)] outline-none transition-transform duration-[240ms] ease-[cubic-bezier(.3,1.25,.5,1)] motion-reduce:transition-none"
            style={{ transform: sheet.shown ? "translateY(0)" : "translateY(100%)" }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 rounded-full bg-divider" />
            </div>

            {/* Profile header */}
            {user ? (
              <div className="flex items-center gap-3 px-5 py-4 border-b border-divider">
                <div className="w-12 h-12 shrink-0 overflow-hidden rounded-full">
                  {showAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.avatar_url!}
                      alt={user.full_name || user.email}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-brand text-brand-contrast text-sm font-bold">
                      {getInitials(user.full_name, user.email)}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-text-heading">
                    {user.full_name || user.email}
                  </p>
                  {user.full_name && (
                   <p className="truncate text-xs text-text-muted">{user.email}</p>
                  )}
                  {ADMIN_PANEL_ROLES.includes(user.role) && (
                    <span className={`inline-flex items-center mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${ROLE_META[user.role].bgColor} ${ROLE_META[user.role].color}`}>
                      {ROLE_META[user.role].label}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="px-5 py-4 border-b border-divider">
                <p className="text-sm text-text-muted">{t("signInHint")}</p>
              </div>
            )}

            {/* Menu links */}
            <nav className="px-3 py-3 space-y-0.5">
              {sheetLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeSheet}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-medium text-text-body hover:bg-paper active:bg-paper transition-colors"
                >
                  <span className="text-text-muted">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Footer */}
            <div className="px-5 pb-4 pt-2 border-t border-divider">
              {user ? (
                <form action="/auth/signout" method="POST" onSubmit={() => { void clearPrivateBrowserState(); }}>
                  <button
                    type="submit"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-100 active:scale-[0.98] transition-all"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    {t("logout")}
                  </button>
                </form>
              ) : (
                <Link
                  href="/auth/login"
                  onClick={closeSheet}
                  className="flex w-full items-center justify-center rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-brand-contrast hover:bg-brand-hover active:scale-[0.98] transition-all"
                >
                  {t("login")}
                </Link>
              )}
            </div>

            <div className="h-[env(safe-area-inset-bottom)]" />
          </div>
      )}
    </>
  );
}
