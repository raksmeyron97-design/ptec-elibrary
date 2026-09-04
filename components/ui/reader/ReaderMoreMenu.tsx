"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import ReaderMenu, { MenuRow, MenuSeparator } from "./ReaderMenu";

export type MoreMenuItem =
  | "separator"
  | {
      id: string;
      label: string;
      icon?: ReactNode;
      onSelect?: () => void;
      href?: string;
      disabled?: boolean;
      checked?: boolean;
      role?: "menuitem" | "menuitemradio" | "menuitemcheckbox";
      trailing?: ReactNode;
    };

/* The ⋯ overflow menu: secondary actions, declared by the viewer as data so
   the same list serves every layout. */
export default function ReaderMoreMenu({
  items,
  open,
  onOpenChange,
}: {
  items: MoreMenuItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("reader");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [, force] = useState(0);
  const close = useCallback(
    (restoreFocus?: boolean) => {
      onOpenChange(false);
      if (restoreFocus) triggerRef.current?.focus();
      force((n) => n + 1);
    },
    [onOpenChange],
  );
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("moreOptions")}
        className="reader-btn"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden />
      </button>
      <ReaderMenu open={open} onClose={close} label={t("moreOptions")} triggerRef={triggerRef} align="right" className="w-64">
        {items.map((item, i) =>
          item === "separator" ? (
            <MenuSeparator key={`sep-${i}`} />
          ) : (
            <MenuRow
              key={item.id}
              icon={item.icon}
              role={item.role}
              checked={item.checked}
              disabled={item.disabled}
              href={item.href}
              trailing={item.trailing}
              onSelect={() => {
                item.onSelect?.();
                close(false);
              }}
            >
              {item.label}
            </MenuRow>
          ),
        )}
      </ReaderMenu>
    </div>
  );
}
