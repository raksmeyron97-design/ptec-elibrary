"use client"
 
;
/* eslint-disable @typescript-eslint/no-unused-vars */


import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type SubLink = { label: string; href: string; icon?: React.ReactNode; target?: string };

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
    <div className="relative group" ref={ref}>
      {/* Trigger link */}
      <Link
        href={href}
        className={`relative flex items-center gap-2 text-[15px] font-khmer-serif py-6 transition-colors select-none whitespace-nowrap ${
          isActive ? "text-brand font-semibold" : "text-text-body font-medium hover:text-text-heading"
        }`}
      >
        <span className={`text-[18px] ${isActive ? "text-brand" : "text-text-muted"}`}>
          {icon}
        </span>
        {label}
        <svg
          className="h-3.5 w-3.5 text-text-muted transition-transform duration-200 group-hover:rotate-180"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
          strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>

        {/* Active underline */}
        {isActive && (
          <span className="absolute bottom-0 left-0 w-full h-[3px] bg-accent rounded-t-md" />
        )}
      </Link>

      {/* Dropdown panel */}
      <div
        className="absolute left-0 top-[calc(100%-2px)] w-52 origin-top-left rounded-xl border border-divider bg-bg-surface shadow-md ring-1 ring-black/5 transition-all duration-200 z-50 pointer-events-none -translate-y-2 opacity-0 scale-95 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-hover:scale-100"
      >
        {/* Top accent bar */}
        <div className="h-[3px] w-full bg-accent rounded-t-xl" />

        <div className="py-2">
          {subLinks.map((sub) => {
            const subActive = pathname === sub.href || pathname.startsWith(sub.href);
            return (
              <Link
                key={sub.href}
                href={sub.href}
                target={sub.target}
                rel={sub.target === "_blank" ? "noopener noreferrer" : undefined}
                className={`flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium transition-colors ${
                  subActive
                    ? "text-brand bg-brand/5"
                    : "text-text-body hover:bg-paper hover:text-brand"
                }`}
              >
                {sub.icon && <span className="text-[16px] text-text-muted">{sub.icon}</span>}
                <span className="flex-1">{sub.label}</span>
                {subActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}