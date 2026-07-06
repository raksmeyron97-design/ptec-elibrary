"use client"
 
;
/* eslint-disable @typescript-eslint/no-unused-vars */


import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import Icon from "@/components/ui/core/Icon";
import ThemeToggle from "@/components/ui/core/ThemeToggle";
import { useTranslations } from 'next-intl';
import LanguageSwitcher from '@/components/ui/core/LanguageSwitcher';
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { useMountTransition } from "@/lib/hooks/useMountTransition";

type NavItem = { label: string; href: string };

type UserInfo = {
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "reader" | "admin";
};

type MobileMenuProps = {
  navLinks: NavItem[];
  user: UserInfo | null;
  locale: 'en' | 'km';
};

function getInitials(name: string | null, email: string) {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return email.slice(0, 2).toUpperCase();
}

export default function MobileMenu({ navLinks, user, locale }: MobileMenuProps) {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);
  const drawer = useMountTransition(open);
  const pathname = usePathname();

  // Close the drawer whenever the route changes (link tapped).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close on Escape — listener only while the drawer is open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Keep keyboard focus inside the drawer while it is open; restore on close.
  // Keyed to open && mounted: the trap must (re-)arm only after the drawer
  // element actually exists, or the container ref is still null.
  const trapRef = useFocusTrap<HTMLDivElement>(open && drawer.mounted);

  return (
    <div className="lg:hidden">
      {/* Hamburger button (hidden on lg+) */}
      <button type="button" onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-text-body transition-colors hover:bg-paper hover:text-brand"
      >
        <svg
          className="h-6 w-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>

      {/* Backdrop — Using 100vw and 100dvh to escape the parent container */}
      {drawer.mounted && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden="true"
          className="fixed left-0 top-0 z-[60] h-[100dvh] w-screen bg-slate-950/45 backdrop-blur-[2px] transition-opacity duration-200 ease-out"
          style={{ opacity: drawer.shown ? 1 : 0 }}
        />
      )}

      {/* Drawer panel — Using 100dvh so it fills the screen properly on mobile Safari/Chrome */}
      {drawer.mounted && (
          <div
            ref={trapRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            // Mounted-but-closing (exit transition): hide from AT and block focus.
            inert={!open}
            aria-hidden={!open}
            tabIndex={-1}
            className="fixed right-0 top-0 z-[70] flex h-[100dvh] w-[300px] max-w-[85vw] flex-col bg-bg-surface shadow-[-8px_0_30px_rgba(0,0,0,0.18)] outline-none transition-transform duration-[240ms] ease-[cubic-bezier(.3,1.25,.5,1)] motion-reduce:transition-none"
            style={{ transform: drawer.shown ? "translateX(0)" : "translateX(100%)" }}
          >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-divider px-5 py-4 shrink-0">
          <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2">
            <Image
              src="/logo_top.png"
              alt="PTEC Logo"
              width={120}
              height={38}
              className="h-9 w-auto object-contain"
            />
          </Link>
          <button type="button" onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-paper hover:text-text-heading"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Nav Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Nav links */}
          <nav className="flex flex-col gap-1 px-3 py-4">
            {user && (
              <>
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between rounded-lg px-4 py-3 text-[15px] font-medium transition-colors ${
                    pathname === "/dashboard"
                      ? "bg-brand/10 text-brand"
                      : "text-text-body hover:bg-paper hover:text-brand-hover"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon name="account" className="text-[18px] text-text-muted" />
                    {t('myDashboard')}
                  </div>
                  {pathname === "/dashboard" && <span className="h-2 w-2 rounded-full bg-brand" />}
                </Link>
                <Link
                  href="/dashboard#saved"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-lg px-4 py-3 text-[15px] font-medium text-text-body transition-colors hover:bg-paper hover:text-brand-hover"
                >
                  <div className="flex items-center gap-3">
                    <Icon name="bookmark" className="text-[18px] text-text-muted" />
                    {t('savedBooks')}
                  </div>
                </Link>
                <div className="my-2 h-px w-full bg-divider" />
              </>
            )}

            {navLinks.map((link) => {
              const isActive =
                pathname === link.href ||
                (link.href !== "/" && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between rounded-lg px-4 py-3 text-[15px] font-medium transition-colors ${
                    isActive
                      ? "bg-brand/10 text-brand"
                      : "text-text-body hover:bg-paper hover:text-brand-hover"
                  }`}
                >
                  {link.label}
                  {isActive && <span className="h-2 w-2 rounded-full bg-brand" />}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer action: login or sign out */}
        <div className="mt-auto border-t border-divider px-5 py-4 shrink-0">
          <div className="mb-4 flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-lg border border-divider px-4 py-2">
              <span className="text-sm font-medium text-text-muted">{t('appearance')}</span>
              <ThemeToggle />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-divider px-4 py-2">
              <span className="text-sm font-medium text-text-muted">Language</span>
              <LanguageSwitcher locale={locale} className="flex items-center gap-2 text-sm font-medium text-text-body hover:text-brand transition-colors cursor-pointer" />
            </div>
          </div>
          {user ? (
            <form action="/auth/signout" method="POST">
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-divider px-4 py-2.5 text-sm font-medium text-text-body transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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
              onClick={() => setOpen(false)}
              className="flex w-full items-center justify-center rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover"
            >
              {t('login')}
            </Link>
          )}
        </div>
          </div>
      )}
    </div>
  );
}