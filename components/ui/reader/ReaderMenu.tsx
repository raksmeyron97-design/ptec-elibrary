"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Check } from "lucide-react";

/* Popover menu primitive for the reader: `role="menu"`, arrow-key roving,
   Home/End, Escape (consumed, focus restored to the trigger), tap-outside
   dismissal. One implementation for the ⋯ menu and the zoom menu, so a
   keyboard user gets the same contract from both. */

export type ReaderMenuProps = {
  open: boolean;
  onClose: (restoreFocus?: boolean) => void;
  label: string;
  triggerRef: RefObject<HTMLElement | null>;
  align?: "left" | "right";
  /** "up" opens above the trigger (bottom bar on phones). */
  direction?: "down" | "up";
  className?: string;
  children: ReactNode;
};

export default function ReaderMenu({
  open,
  onClose,
  label,
  triggerRef,
  align = "right",
  direction = "down",
  className = "",
  children,
}: ReaderMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const items = () =>
      Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? []);
    const onPointerDown = (e: PointerEvent) => {
      const root = menuRef.current;
      const trigger = triggerRef.current;
      if (!(e.target instanceof Node)) return;
      if (root?.contains(e.target) || trigger?.contains(e.target)) return;
      onClose(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onClose(true);
        return;
      }
      if (e.key === "Tab") {
        onClose(false);
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const list = items();
      if (!list.length) return;
      e.preventDefault();
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "Home" ? list[0]
        : e.key === "End" ? list[list.length - 1]
        : e.key === "ArrowDown" ? list[(at + 1) % list.length]
        : list[(at - 1 + list.length) % list.length];
      next.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey, true);
    const raf = requestAnimationFrame(() => items()[0]?.focus());
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;
  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      data-reader-overlay
      className={`reader-menu ${align === "right" ? "right-0" : "left-0"} ${
        direction === "up" ? "bottom-full mb-1.5" : "top-full mt-1.5"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function MenuRow({
  icon,
  children,
  trailing,
  checked,
  role = "menuitem",
  onSelect,
  disabled,
  href,
}: {
  icon?: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  checked?: boolean;
  role?: "menuitem" | "menuitemradio" | "menuitemcheckbox";
  onSelect?: () => void;
  disabled?: boolean;
  /** Renders a link row (report-a-problem mailto). */
  href?: string;
}) {
  const inner = (
    <>
      <span className="reader-menu-icon" aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing !== undefined ? <span className="ml-auto shrink-0 text-[11px] reader-faint">{trailing}</span> : null}
      {checked ? <Check className="ml-auto h-4 w-4 shrink-0 reader-accent" aria-hidden /> : null}
    </>
  );
  if (href) {
    return (
      <a role="menuitem" href={href} onClick={onSelect} className="reader-menu-row" tabIndex={-1}>
        {inner}
      </a>
    );
  }
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === "menuitem" ? undefined : !!checked}
      onClick={onSelect}
      disabled={disabled}
      className="reader-menu-row"
      tabIndex={-1}
    >
      {inner}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="reader-menu-sep" />;
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return <div className="reader-menu-heading" role="presentation">{children}</div>;
}
