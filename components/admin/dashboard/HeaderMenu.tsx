"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown, GraduationCap, BookMarked, FileText, Users, Inbox, Plus, MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

/** Icon keys keep this client boundary serializable — Server Components pass
 *  strings, not Lucide function components. */
export type HeaderIconKey =
  | "addThesis" | "addPublication" | "createPost" | "manageUsers" | "reviewRequests"
  | "create" | "more";

const ICONS: Record<HeaderIconKey, LucideIcon> = {
  addThesis: GraduationCap,
  addPublication: BookMarked,
  createPost: FileText,
  manageUsers: Users,
  reviewRequests: Inbox,
  create: Plus,
  more: MoreHorizontal,
};

export type HeaderMenuItem = {
  key: string;
  label: string;
  href: string;
  iconKey?: HeaderIconKey;
};

/**
 * Small accessible dropdown for header actions (Create / utilities).
 * Button + menu with Escape/outside-click close, arrow-key movement and
 * focus return — enough ARIA menu behaviour without a dependency.
 */
export default function HeaderMenu({
  label,
  items,
  iconKey,
  variant = "secondary",
}: {
  label: string;
  items: HeaderMenuItem[];
  iconKey?: HeaderIconKey;
  variant?: "secondary" | "quiet";
}) {
  const IconCmp = iconKey ? ICONS[iconKey] : undefined;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const links = rootRef.current?.querySelectorAll<HTMLAnchorElement>("[role=menuitem]");
        if (!links || links.length === 0) return;
        e.preventDefault();
        const active = document.activeElement;
        const idx = [...links].indexOf(active as HTMLAnchorElement);
        const next =
          e.key === "ArrowDown"
            ? links[(idx + 1) % links.length]
            : links[(idx - 1 + links.length) % links.length];
        next.focus();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const buttonClass =
    variant === "quiet"
      ? "flex h-9 cursor-pointer items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium text-text-muted transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      : "flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-paper px-3 text-[13px] font-semibold text-text-heading transition-colors hover:bg-brand/10 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={buttonClass}
      >
        {IconCmp && <IconCmp className="h-4 w-4" aria-hidden="true" />}
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute end-0 top-10 z-30 min-w-48 rounded-xl border border-divider bg-bg-surface p-1 shadow-lg"
        >
          {items.map((item) => {
            const ItemIcon = item.iconKey ? ICONS[item.iconKey] : undefined;
            return (
              <Link
                key={item.key}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-text-body transition-colors hover:bg-paper hover:text-brand focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
              >
                {ItemIcon && <ItemIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />}
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
