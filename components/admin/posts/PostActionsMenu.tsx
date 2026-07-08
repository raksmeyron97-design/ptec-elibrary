"use client";

import { useEffect, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node) || buttonRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus(); }
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

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
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${post.title}`}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-paper hover:text-text-heading disabled:opacity-50"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${post.title}`}
          className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-divider bg-bg-surface p-1.5 shadow-xl"
        >
          <Link
            href={`/posts/${post.slug}`}
            target="_blank"
            role="menuitem"
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            <Eye className="h-4 w-4 text-text-muted" /> View public post
          </Link>
          <Link
            href={`/admin/posts/edit/${post.id}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            <Pencil className="h-4 w-4 text-text-muted" /> Edit
          </Link>
          <button type="button" role="menuitem" className={itemClass} onClick={() => run(onDuplicate)}>
            <Copy className="h-4 w-4 text-text-muted" /> Duplicate
          </button>
          <button
            type="button"
            role="menuitem"
            className={itemClass}
            onClick={() => run(() => {
              navigator.clipboard?.writeText(`${window.location.origin}/posts/${post.slug}`);
            })}
          >
            <Link2 className="h-4 w-4 text-text-muted" /> Copy link
          </button>

          <div className="my-1 h-px bg-divider" />

          {post.status === "published" ? (
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(onUnpublish)}>
              <XCircle className="h-4 w-4 text-text-muted" /> Unpublish
            </button>
          ) : (
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(onPublish)}>
              <CheckCircle2 className="h-4 w-4 text-text-muted" /> Publish
            </button>
          )}
          {post.status !== "archived" && (
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(onArchive)}>
              <Archive className="h-4 w-4 text-text-muted" /> Archive
            </button>
          )}

          <div className="my-1 h-px bg-divider" />

          <button
            type="button"
            role="menuitem"
            className={`${itemClass} text-red-600 hover:bg-red-50`}
            onClick={() => run(onDelete)}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
