"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MoreVertical,
  Eye,
  Pencil,
  Copy,
  Link2,
  Download,
  CheckCircle2,
  XCircle,
  Archive,
  ArchiveRestore,
  Trash2,
} from "lucide-react";
import { thesisHref } from "@/lib/theses";
import type { ThesisListRow } from "@/lib/admin/theses-shared";

/**
 * Keyboard-accessible row action menu — same pattern as
 * components/admin/posts/PostActionsMenu.tsx (no generic dropdown primitive
 * exists yet in this codebase).
 */
export default function ThesisActionsMenu({
  thesis,
  busy,
  onPublish,
  onUnpublish,
  onArchive,
  onUnarchive,
  onDuplicate,
  onDelete,
}: {
  thesis: ThesisListRow;
  busy: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("adminTheses.actions");
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

  const publicPath = thesisHref(thesis);
  const isPublished = thesis.status === "published";
  const isArchived = thesis.status === "archived";

  return (
    <div className="relative inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("menuFor", { title: thesis.title })}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-paper hover:text-text-heading disabled:opacity-50"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t("menuFor", { title: thesis.title })}
          className="absolute right-0 z-30 mt-1 w-60 rounded-xl border border-divider bg-bg-surface p-1.5 shadow-xl"
        >
          {isPublished ? (
            <Link href={publicPath} target="_blank" role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
              <Eye className="h-4 w-4 text-text-muted" /> {t("viewPublic")}
            </Link>
          ) : (
            <span className={`${itemClass} cursor-not-allowed opacity-50`} aria-disabled="true">
              <Eye className="h-4 w-4 text-text-muted" /> {t("notPublished")}
            </span>
          )}
          <Link href={`/admin/theses/edit/${thesis.id}`} role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
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
              navigator.clipboard?.writeText(`${window.location.origin}${publicPath}`);
            })}
          >
            <Link2 className="h-4 w-4 text-text-muted" /> {t("copyLink")}
          </button>
          {/* The public file route only serves published rows (drafts must never be
              publicly downloadable) — so this link only appears once published. */}
          {isPublished && thesis.fileUrl && (
            <a
              href={`/api/theses/${thesis.id}/file?download=1`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              <Download className="h-4 w-4 text-text-muted" /> {t("downloadPdf")}
            </a>
          )}

          <div className="my-1 h-px bg-divider" />

          {isPublished ? (
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(onUnpublish)}>
              <XCircle className="h-4 w-4 text-text-muted" /> {t("unpublish")}
            </button>
          ) : (
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(onPublish)}>
              <CheckCircle2 className="h-4 w-4 text-text-muted" /> {t("publish")}
            </button>
          )}
          {isArchived ? (
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(onUnarchive)}>
              <ArchiveRestore className="h-4 w-4 text-text-muted" /> {t("restore")}
            </button>
          ) : (
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
        </div>
      )}
    </div>
  );
}
