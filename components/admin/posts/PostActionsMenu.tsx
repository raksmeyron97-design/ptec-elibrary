"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  MoreVertical,
  Eye,
  Pencil,
  Copy,
  Link2,
  CheckCircle2,
  XCircle,
  Archive,
  Trash2,
} from "lucide-react";
import type { PostListRow } from "@/lib/admin/posts-shared";

/**
 * Keyboard-accessible row action menu. No generic dropdown primitive exists
 * yet in this codebase, so this is purpose-built here rather than promoted
 * to components/ui/core (avoids scope creep for a single call site).
 */
export default function PostActionsMenu({
  post,
  busy,
  onPublish,
  onUnpublish,
  onArchive,
  onDuplicate,
  onDelete,
}: {
  post: PostListRow;
  busy: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onArchive: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("adminPosts.actions");
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
    const menuWidth = 224; // w-56
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropUp = spaceBelow < 300 && spaceAbove > spaceBelow;

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
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
    }
    const handleScrollOrResize = () => updatePosition();
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [open, updatePosition]);

  function run(fn: () => void) {
    setOpen(false);
    fn();
  }

  const itemClass =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium text-text-body transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50";

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
        aria-label={t("menuFor", { title: post.title })}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-paper hover:text-text-heading disabled:opacity-50"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && mounted && menuPosition && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={menuPosition}
          aria-label={t("menuFor", { title: post.title })}
          className="rounded-xl border border-divider bg-bg-surface p-1.5 shadow-xl"
        >
          <Link
            href={`/posts/${post.slug}`}
            target="_blank"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            <Eye className="h-4 w-4 text-text-muted" /> {t("viewPublic")}
          </Link>
          <Link
            href={`/admin/posts/edit/${post.id}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            <Pencil className="h-4 w-4 text-text-muted" /> {t("edit")}
          </Link>
          <button type="button" role="menuitem" className={itemClass} onClick={() => run(onDuplicate)}>
            <Copy className="h-4 w-4 text-text-muted" /> {t("duplicate")}
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => {
              navigator.clipboard?.writeText(`${window.location.origin}/posts/${post.slug}`);
            })}
          >
            <Link2 className="h-4 w-4 text-text-muted" /> {t("copyLink")}
          </button>

          <div className="my-1 h-px bg-divider" />

          {post.status === "published" ? (
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(onUnpublish)}>
              <XCircle className="h-4 w-4 text-text-muted" /> {t("unpublish")}
            </button>
          ) : (
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(onPublish)}>
              <CheckCircle2 className="h-4 w-4 text-text-muted" /> {t("publish")}
            </button>
          )}
          {post.status !== "archived" && (
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(onArchive)}>
              <Archive className="h-4 w-4 text-text-muted" /> {t("archive")}
            </button>
          )}

          <div className="my-1 h-px bg-divider" />

          <button
            type="button"
            role="menuitem"
            className={`${itemClass} text-red-600 hover:bg-red-50`}
            onClick={() => run(onDelete)}
          >
            <Trash2 className="h-4 w-4" /> {t("delete")}
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
