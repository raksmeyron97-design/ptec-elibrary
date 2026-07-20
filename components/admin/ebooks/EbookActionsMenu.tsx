"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MoreVertical,
  Eye,
  Pencil,
  UploadCloud,
  ImageUp,
  Link2,
  Download,
  Star,
  CheckCircle2,
  XCircle,
  Archive,
  ArchiveRestore,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { EbookListRow } from "@/lib/admin/ebooks-shared";

/**
 * Keyboard-accessible row action menu — same pattern as
 * components/admin/theses/ThesisActionsMenu.tsx (no generic dropdown
 * primitive exists yet in this codebase).
 */
export default function EbookActionsMenu({
  book,
  busy,
  onPublish,
  onUnpublish,
  onArchive,
  onRestore,
  onDeleteRequest,
}: {
  book: EbookListRow;
  busy: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDeleteRequest: (id: string, title: string) => void;
}) {
  const t = useTranslations("adminEbooks.actions");
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

  const publicPath = `/books/${book.slug}`;
  const isPublished = book.status === "published";
  const isArchived = book.status === "archived";
  const hasPdf = Boolean(book.fileUrl);

  return (
    <div className="relative inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("menuFor", { title: book.title })}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-paper hover:text-text-heading disabled:opacity-50"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t("menuFor", { title: book.title })}
          className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-divider bg-bg-surface p-1.5 shadow-xl"
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
          <Link href={`/admin/edit/${book.id}`} role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
            <Pencil className="h-4 w-4 text-text-muted" /> {t("editMetadata")}
          </Link>
          <Link href={`/admin/edit/${book.id}#replace-pdf`} role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
            <UploadCloud className="h-4 w-4 text-text-muted" /> {t("replacePdf")}
          </Link>
          <Link href={`/admin/edit/${book.id}#cover`} role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
            <ImageUp className="h-4 w-4 text-text-muted" /> {book.coverUrl ? t("replaceCover") : t("uploadCover")}
          </Link>
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
          {hasPdf && (
            <a
              href={`/api/books/${book.slug}/download`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              <Download className="h-4 w-4 text-text-muted" /> {t("downloadPdf")}
            </a>
          )}

          <div className="my-1 h-px bg-divider" />

          <span className={`${itemClass} cursor-not-allowed opacity-50`} aria-disabled="true" title={t("comingSoon")}>
            <Star className="h-4 w-4 text-text-muted" /> {t("featureBook")}
          </span>

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
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(onRestore)}>
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
            onClick={() => run(() => onDeleteRequest(book.id, book.title))}
          >
            <Trash2 className="h-4 w-4" /> {t("delete")}
          </button>
        </div>
      )}
    </div>
  );
}
