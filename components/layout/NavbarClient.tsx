"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Icon from "@/components/ui/Icon";

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
        className="rounded-lg bg-[#0a1629] px-6 py-2.5 text-[14px] font-semibold text-white transition-all hover:bg-[#007c91] hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
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
        className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white py-1.5 pl-1.5 pr-3 shadow-sm transition-all hover:border-[#007c91]/40 hover:shadow-md"
        aria-label="User menu"
        aria-expanded={open}
      >
        {/* Avatar */}
        <div className="relative h-8 w-8 shrink-0">
          {user.avatar_url ? (
            <Image
              src={user.avatar_url}
              alt={displayName}
              fill
              sizes="32px"
              className="rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#007c91] text-xs font-bold text-white">
              {initials}
            </div>
          )}
          {/* Online dot */}
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
        </div>

        {/* Name — hidden on small screens */}
        <span className="hidden max-w-[100px] truncate text-[13px] font-semibold text-slate-700 sm:block">
          {user.full_name?.split(" ")[0] ?? user.email.split("@")[0]}
        </span>

        {/* Chevron */}
        <svg
          className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* ── Dropdown ── */}
      <div
        className={`absolute right-0 top-[calc(100%+10px)] w-64 origin-top-right rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 transition-all duration-200 ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100 scale-100"
            : "pointer-events-none -translate-y-2 opacity-0 scale-95"
        }`}
      >
        {/* Profile header */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
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
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#007c91] text-sm font-bold text-white">
                {initials}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">
              {displayName}
            </p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
            <span
              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                user.role === "admin"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-cyan-50 text-cyan-700"
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
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-[#007c91]"
          >
            <Icon name="account" className="text-[18px] text-slate-400" />
            My Dashboard
          </Link>
          <Link
            href="/books"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-[#007c91]"
          >
            <Icon name="bookmark" className="text-[18px] text-slate-400" />
            Saved Books
          </Link>
         

        </div>

        {/* Sign out */}
        <div className="border-t border-slate-100 px-3 py-3">
          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}