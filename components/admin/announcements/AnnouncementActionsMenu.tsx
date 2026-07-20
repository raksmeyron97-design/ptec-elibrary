"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MoreVertical,
  Eye,
  Pencil,
  Copy,
  Send,
  CalendarX,
  PauseCircle,
  Archive,
  Trash2,
  RotateCcw,
  ThumbsUp,
} from "lucide-react";
import { availableActions } from "@/lib/admin/announcements/state-machine";
import type { AnnouncementListRow } from "@/lib/admin/announcements/shared";

export interface AnnouncementRowHandlers {
  onRequestApproval?: (id: string) => void;
  onCancelSchedule?: (id: string) => void;
  onPause?: (id: string) => void;
  onArchive?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onResendFailed?: (id: string) => void;
  onDeleteRequest?: (id: string, name: string) => void;
}

export default function AnnouncementActionsMenu({
  row,
  busy,
  ...handlers
}: AnnouncementRowHandlers & { row: AnnouncementListRow; busy: boolean }) {
  const t = useTranslations("adminAnnouncements.actions");
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

  function run(fn?: (id: string) => void) {
    setOpen(false);
    if (fn) fn(row.id);
  }

  const actions = availableActions(row.status);
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
        aria-label={t("menuFor", { name: row.internalName })}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-paper hover:text-text-heading disabled:opacity-50"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t("menuFor", { name: row.internalName })}
          className="absolute right-0 z-30 mt-1 w-60 rounded-xl border border-divider bg-bg-surface p-1.5 shadow-xl"
        >
          <Link href={`/admin/announcements/${row.id}`} role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
            <Eye className="h-4 w-4 text-text-muted" /> {t("view")}
          </Link>

          {actions.includes("edit") && (
            <Link href={`/admin/announcements/${row.id}/edit`} role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
              <Pencil className="h-4 w-4 text-text-muted" /> {t("edit")}
            </Link>
          )}

          {actions.includes("duplicate") && (
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(handlers.onDuplicate)}>
              <Copy className="h-4 w-4 text-text-muted" /> {t("duplicate")}
            </button>
          )}

          <div className="my-1 h-px bg-divider" />

          {(actions.includes("publish") || actions.includes("schedule")) && (
            <Link
              href={`/admin/announcements/${row.id}/edit?step=review`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              <Send className="h-4 w-4 text-text-muted" /> {t("reviewAndPublish")}
            </Link>
          )}
          {actions.includes("requestApproval") && (
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(handlers.onRequestApproval)}>
              <Send className="h-4 w-4 text-text-muted" /> {t("requestApproval")}
            </button>
          )}
          {(actions.includes("approve") || actions.includes("reject")) && (
            <Link href={`/admin/announcements/${row.id}`} role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
              <ThumbsUp className="h-4 w-4 text-text-muted" /> {t("reviewApproval")}
            </Link>
          )}
          {actions.includes("cancelSchedule") && (
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(handlers.onCancelSchedule)}>
              <CalendarX className="h-4 w-4 text-text-muted" /> {t("cancelSchedule")}
            </button>
          )}
          {actions.includes("pause") && (
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(handlers.onPause)}>
              <PauseCircle className="h-4 w-4 text-text-muted" /> {t("pause")}
            </button>
          )}
          {actions.includes("resendFailed") && (
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(handlers.onResendFailed)}>
              <RotateCcw className="h-4 w-4 text-text-muted" /> {t("resendFailed")}
            </button>
          )}
          {actions.includes("archive") && (
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(handlers.onArchive)}>
              <Archive className="h-4 w-4 text-text-muted" /> {t("archive")}
            </button>
          )}

          {actions.includes("delete") && (
            <>
              <div className="my-1 h-px bg-divider" />
              <button
                type="button"
                role="menuitem"
                className={`${itemClass} text-red-600 hover:bg-red-50`}
                onClick={() => { setOpen(false); handlers.onDeleteRequest?.(row.id, row.internalName); }}
              >
                <Trash2 className="h-4 w-4" /> {t("delete")}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
