"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
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
  ShieldCheck,
  ShieldOff,
  ClipboardCheck,
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
  onSubmitForReview,
  onVerify,
  onUnverify,
  onDeleteRequest,
}: {
  book: EbookListRow;
  busy: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onSubmitForReview: () => void;
  onVerify: () => void;
  onUnverify: () => void;
  onDeleteRequest: (id: string, title: string) => void;
}) {
  const t = useTranslations("adminEbooks.actions");
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
    const menuWidth = 256;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropUp = spaceBelow < 340 && spaceAbove > spaceBelow;

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

  const publicPath = `/books/${book.slug}`;
  const isPublished = book.status === "published";
  const isArchived = book.status === "archived";
  const hasPdf = Boolean(book.fileUrl);
  const isVerified = Boolean(book.verifiedAt);
  const inReviewQueue = book.status === "pending_review";

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
        aria-label={t("menuFor", { title: book.title })}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-paper hover:text-text-heading disabled:opacity-50"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && mounted && menuPosition && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={menuPosition}
          aria-label={t("menuFor", { title: book.title })}
          className="rounded-xl border border-divider bg-bg-surface p-1.5 shadow-xl"
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

          {/* Verification is a separate axis from publication: a book can be
              live-but-unverified (everything predating the review workflow) or
              verified-but-still-draft. Both actions therefore sit alongside
              publish/unpublish rather than replacing it. */}
          {isVerified ? (
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(onUnverify)}>
              <ShieldOff className="h-4 w-4 text-text-muted" /> {t("unverifyMetadata")}
            </button>
          ) : (
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(onVerify)}>
              <ShieldCheck className="h-4 w-4 text-text-muted" /> {t("verifyMetadata")}
            </button>
          )}
          {!isVerified && !inReviewQueue && (
            <button type="button" role="menuitem" className={itemClass} onClick={() => run(onSubmitForReview)}>
              <ClipboardCheck className="h-4 w-4 text-text-muted" /> {t("submitForReview")}
            </button>
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
        </div>,
        document.body
      )}
    </div>
  );
}
