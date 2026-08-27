"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { MoreVertical, Eye, Download, Pencil, FolderInput, Copy, Link2, RefreshCw, Trash2 } from "lucide-react";
import type { StorageFile } from "@/lib/types/storage";

export type StorageItemIntent = "preview" | "download" | "rename" | "move" | "copy" | "copyLink" | "replace" | "trash";

export default function StorageItemMenu({
  file,
  canWrite,
  busy,
  onIntent,
}: {
  file: StorageFile;
  canWrite: boolean;
  busy: boolean;
  onIntent: (intent: StorageItemIntent) => void;
}) {
  const t = useTranslations("adminStorage.actions");
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuPosition, setMenuPosition] = useState<React.CSSProperties | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 208; // w-52
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropUp = spaceBelow < 320 && spaceAbove > spaceBelow;

    setMenuPosition({
      position: "fixed",
      zIndex: 60,
      width: `${menuWidth}px`,
      top: dropUp ? undefined : `${rect.bottom + 4}px`,
      bottom: dropUp ? `${window.innerHeight - rect.top + 4}px` : undefined,
      left: `${Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth))}px`,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    function onClick(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node) || buttonRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
    }
    const handleScrollOrResize = () => updatePosition();
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [open, updatePosition]);

  function run(intent: StorageItemIntent) {
    setOpen(false);
    onIntent(intent);
  }

  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium text-text-body transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40";
  const dangerItem = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="relative inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!open) updatePosition();
          setOpen((v) => !v);
        }}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t("moreActions")}: ${file.originalName}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-paper hover:text-text-heading disabled:opacity-40"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && mounted && menuPosition && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={menuPosition}
          className="rounded-xl border border-divider bg-bg-surface p-1.5 shadow-lg"
        >
          <button type="button" role="menuitem" className={item} onClick={() => run("preview")}><Eye className="h-4 w-4" /> {t("preview")}</button>
          <button type="button" role="menuitem" className={item} onClick={() => run("download")}><Download className="h-4 w-4" /> {t("download")}</button>
          <button type="button" role="menuitem" className={item} onClick={() => run("copyLink")}><Link2 className="h-4 w-4" /> {t("copyLink")}</button>
          {canWrite && (
            <>
              <div className="my-1 border-t border-divider" />
              <button type="button" role="menuitem" className={item} onClick={() => run("rename")}><Pencil className="h-4 w-4" /> {t("rename")}</button>
              <button type="button" role="menuitem" className={item} onClick={() => run("move")}><FolderInput className="h-4 w-4" /> {t("move")}</button>
              <button type="button" role="menuitem" className={item} onClick={() => run("copy")}><Copy className="h-4 w-4" /> {t("copy")}</button>
              <button type="button" role="menuitem" className={item} onClick={() => run("replace")}><RefreshCw className="h-4 w-4" /> {t("replace")}</button>
              <div className="my-1 border-t border-divider" />
              <button type="button" role="menuitem" className={dangerItem} onClick={() => run("trash")}><Trash2 className="h-4 w-4" /> {t("trash")}</button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
