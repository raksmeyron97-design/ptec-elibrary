"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Icon from "@/components/ui/core/Icon";
import ThemeToggle from "@/components/ui/core/ThemeToggle";
import { useTranslations } from 'next-intl';

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

export default function MobileMenu({ navLinks, user }: MobileMenuProps) {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);
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

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="lg:hidden">
      {/* Hamburger button (hidden on lg+) */}
      <button
        onClick={() => setOpen(true)}
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
      <AnimatePresence>
        {open && (
          <motion.div
            onClick={() => setOpen(false)}
            aria-hidden="true"
            className="fixed left-0 top-0 z-[60] h-[100dvh] w-screen bg-slate-950/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      {/* Drawer panel — Using 100dvh so it fills the screen properly on mobile Safari/Chrome */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-modal="true"
            className="fixed right-0 top-0 z-[70] flex h-[100dvh] w-[300px] max-w-[85vw] flex-col bg-bg-surface shadow-[-8px_0_30px_rgba(0,0,0,0.18)]"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 450, damping: 32, mass: 0.6 }}
          >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-divider px-5 py-4">
          <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2">
            <Image
              src="/logo_top.png"
              alt="PTEC Logo"
              width={120}
              height={38}
              className="h-9 w-auto object-contain"
            />
          </Link>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-paper hover:text-text-heading"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Profile block (logged in) */}
        {user && (
          <div className="flex items-center gap-3 border-b border-divider px-5 py-4">
            <div className="relative h-10 w-10 shrink-0">
              {user.avatar_url ? (
                <Image
                  src={user.avatar_url}
                  alt={user.full_name || user.email}
                  fill
                  sizes="40px"
                  className="rounded-full object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-contrast">
                  {getInitials(user.full_name, user.email)}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-text-heading">
                {user.full_name || user.email}
              </p>
              {user.full_name && (
                <p className="truncate text-xs text-text-muted">{user.email}</p>
              )}
            </div>
          </div>
        )}

        {/* Profile links (logged in) */}
        {user && (
          <div className="flex flex-col gap-1 border-b border-divider px-3 py-2">
            <Link href="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-[15px] font-medium text-text-body hover:bg-paper hover:text-brand">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              {t("myDashboard")}
            </Link>
            <Link href="/books" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-[15px] font-medium text-text-body hover:bg-paper hover:text-brand">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
              {t("savedBooks")}
            </Link>
          </div>
        )}

        {/* Search shortcut */}
        <div className="px-5 pt-4">
          <Link
            href="/books"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-lg border border-divider bg-paper px-4 py-3 text-sm font-medium text-text-muted transition-colors hover:bg-paper"
          >
            <Icon name="search" className="text-[18px] text-text-muted" />
            {t('searchPlaceholder')}
          </Link>
        </div>

        {/* Nav links */}
        <nav className="flex flex-col gap-1 px-3 py-4">
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

        {/* Footer action: login or sign out */}
        <div className="mt-auto border-t border-divider px-5 py-4">
          <div className="mb-4 flex items-center justify-between rounded-lg border border-divider px-4 py-2">
            <span className="text-sm font-medium text-text-muted">{t('appearance')}</span>
            <ThemeToggle />
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}