"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Icon from "@/components/ui/core/Icon";
import { useTranslations } from 'next-intl';

type UserInfo = {
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "reader" | "admin";
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

  // Close dropdown when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Not logged in ─────────────────────────────────────────────
  if (!user) {
    return (
      <Link
        href="/auth/login"
        className="rounded-lg bg-brand px-6 py-2.5 text-[14px] font-semibold text-brand-contrast transition-all hover:bg-brand-hover hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
      >
        Login
      </Link>
    );
  }

  // ── Logged in ─────────────────────────────────────────────────
  const initials = getInitials(user.full_name, user.email);
  const displayName = user.full_name || user.email;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Avatar button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative h-9 w-9 shrink-0 rounded-full border border-divider shadow-sm transition-all hover:border-brand/50 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-focus-ring/20"
        aria-label="User menu"
        aria-expanded={open}
      >
        {user.avatar_url ? (
          <Image
            src={user.avatar_url}
            alt={displayName}
            fill
            sizes="36px"
            className="rounded-full object-cover"
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
        className={`absolute right-0 top-[calc(100%+10px)] w-64 origin-top-right rounded-xl border border-divider bg-bg-surface shadow-xl ring-1 ring-black/5 transition-all duration-200 ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100 scale-100"
            : "pointer-events-none -translate-y-2 opacity-0 scale-95"
        }`}
      >
        {/* Profile header */}
        <div className="flex items-center gap-3 border-b border-divider px-4 py-4">
          <div className="relative h-11 w-11 shrink-0">
            {user.avatar_url ? (
              <Image
                src={user.avatar_url}
                alt={displayName}
                fill
                sizes="44px"
                className="rounded-full object-cover"
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
              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                user.role === "admin"
                  ? "bg-gold-50 text-warning"
                  : "bg-brand/5 text-brand"
              }`}
            >
              {user.role}
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
            href="/books"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-body transition-colors hover:bg-paper hover:text-brand"
          >
            <Icon name="bookmark" className="text-[18px] text-text-muted" />
            {t('savedBooks')}
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