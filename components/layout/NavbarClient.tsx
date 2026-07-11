"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import NextLink from "next/link";
import Icon from "@/components/ui/core/Icon";
import { useTranslations } from 'next-intl';
import type { AppRole } from "@/lib/types/roles";
import { ROLE_META } from "@/lib/types/roles";

type UserInfo = {
  id?: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: AppRole;
};

type NavbarClientProps = {
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

export default function NavbarClient({ user }: NavbarClientProps) {
  const t = useTranslations('nav');
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    function handler(e: PointerEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  // Escape closes and returns focus to the avatar trigger
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const [avatarFailed, setAvatarFailed] = useState(false);
  const initials = user ? getInitials(user.full_name, user.email) : "";
  const displayName = user ? (user.full_name || user.email) : "";
  const showAvatar = user ? (!!user.avatar_url && !avatarFailed) : false;

  // ── Not logged in ─────────────────────────────────────────────
  if (!user) {
    // Plain next/link: /auth/login is outside the locale-prefixed tree.
    // lg+ only — below lg the drawer and bottom nav carry the login action.
    return (
      <NextLink
        href="/auth/login"
        className="hidden lg:inline-flex min-h-11 items-center whitespace-nowrap rounded-lg bg-brand px-6 py-2.5 text-[14px] font-semibold text-brand-contrast transition-all hover:bg-brand-hover hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
      >
        {t('login')}
      </NextLink>
    );
  }

  // ── Logged in ─────────────────────────────────────────────────

  return (
    <div className="relative hidden shrink-0 lg:block" ref={dropdownRef}>
      {/* Avatar button — desktop only (lg+): the actions zone is shrink-0 so
          it can never be pushed off-screen; below lg the bottom nav's
          Profile tab takes over and the header stays minimal. */}
      <button type="button" ref={triggerRef} onClick={() => setOpen((v) => !v)}
        className="relative h-10 w-10 shrink-0 rounded-full border border-divider shadow-sm transition-all hover:border-brand/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-focus-ring/20"
        aria-label={t('profile')}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
      >
        {showAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatar_url!}
            alt={displayName}
            referrerPolicy="no-referrer"
            onError={() => setAvatarFailed(true)}
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-contrast">
            {initials}
          </div>
        )}
        {/* Online dot */}
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-success" />
      </button>

      {/* ── Dropdown ── */}
      <div
        id={menuId}
        inert={!open}
        aria-hidden={!open}
        className={`absolute right-0 top-[calc(100%+10px)] w-64 max-w-[calc(100vw-1rem)] origin-top-right rounded-xl border border-divider bg-bg-surface shadow-xl ring-1 ring-black/5 transition-all duration-200 z-[100] ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100 scale-100"
            : "pointer-events-none -translate-y-2 opacity-0 scale-95"
        }`}
      >
        {/* Profile header */}
        <div className="flex items-center gap-3 border-b border-divider px-4 py-4">
          <div className="h-11 w-11 shrink-0">
            {showAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatar_url!}
                alt={displayName}
                referrerPolicy="no-referrer"
                className="h-11 w-11 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand text-sm font-bold text-brand-contrast">
                {initials}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-text-heading">
              {displayName}
            </p>
            <p className="truncate text-xs text-text-muted">{user.email}</p>
            <span
              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ROLE_META[user.role].bgColor} ${ROLE_META[user.role].color}`}
            >
              {ROLE_META[user.role].label}
            </span>
          </div>
        </div>

        {/* Menu items */}
        <div className="py-2">
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-body transition-colors hover:bg-paper hover:text-brand"
          >
            <Icon name="account" className="text-[18px] text-text-muted" />
            {t('myDashboard')}
          </Link>
          <Link
            href="/dashboard#saved"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-body transition-colors hover:bg-paper hover:text-brand"
          >
            <Icon name="bookmark" className="text-[18px] text-text-muted" />
            {t('savedBooks')}
          </Link>
         

          <Link
            href="/dashboard/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-body transition-colors hover:bg-paper hover:text-brand"
          >
            <Icon name="settings" className="text-[18px] text-text-muted" />
            {t('settings')}
          </Link>

        </div>

        {/* Sign out */}
        <div className="border-t border-divider px-3 py-3">
          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-text-body transition-colors hover:bg-red-50 hover:text-danger"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {t('logout')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
