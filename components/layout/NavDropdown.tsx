"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type SubLink = { label: string; href: string };

type NavDropdownProps = {
  label: string;
  href: string;
  icon: React.ReactNode;
  subLinks: SubLink[];
};

export default function NavDropdown({ label, href, icon, subLinks }: NavDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  const isActive =
    pathname === href || (href !== "/" && pathname.startsWith(href)) ||
    subLinks.some((s) => pathname === s.href || pathname.startsWith(s.href));

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`relative flex items-center gap-2 text-[15px] font-medium py-6 transition-colors select-none ${
          isActive ? "text-[#007c91]" : "text-slate-600 hover:text-[#0a1629]"
        }`}
      >
        <span className={`text-[18px] ${isActive ? "text-[#007c91]" : "text-slate-400"}`}>
          {icon}
        </span>
        {label}
        <svg
          className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>

        {/* Active underline */}
        {isActive && (
          <span className="absolute bottom-0 left-0 w-full h-[3px] bg-[#007c91] rounded-t-md" />
        )}
      </button>

      {/* Dropdown panel */}
      <div
        className={`absolute left-0 top-[calc(100%-2px)] w-52 origin-top-left rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-black/5 transition-all duration-200 z-50 ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100 scale-100"
            : "pointer-events-none -translate-y-2 opacity-0 scale-95"
        }`}
      >
        {/* Top accent bar */}
        <div className="h-[3px] w-full bg-[#007c91] rounded-t-xl" />

        <div className="py-2">
          {subLinks.map((sub) => {
            const subActive = pathname === sub.href || pathname.startsWith(sub.href);
            return (
              <Link
                key={sub.href}
                href={sub.href}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between px-4 py-2.5 text-[14px] font-medium transition-colors ${
                  subActive
                    ? "text-[#007c91] bg-[#007c91]/6"
                    : "text-slate-700 hover:bg-slate-50 hover:text-[#007c91]"
                }`}
              >
                {sub.label}
                {subActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#007c91]" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}