"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  MoreVertical,
  Copy,
  Link2,
  Download,
  CheckCircle2,
  XCircle,
  Archive,
  ArchiveRestore,
  ShieldCheck,
  ShieldOff,
  ClipboardCheck,
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
  onSubmitForReview,
  onVerify,
  onUnverify,
  onDelete,
}: {
  thesis: ThesisListRow;
  busy: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDuplicate: () => void;
  onSubmitForReview: () => void;
  onVerify: () => void;
  onUnverify: () => void;
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
  const isVerified = Boolean(thesis.verifiedAt);
  const inReviewQueue = thesis.status === "pending_review";

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
        className="focus-field flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-paper hover:text-text-heading disabled:opacity-50"
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
          {/* Edit and View are inline icon buttons in the row (ThesesTable) —
              duplicating them here gave the same action two homes. */}
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

          {/* Verification is a separate axis from publication: a thesis can be
              live-but-unverified (everything predating the review workflow) or
              verified-but-still-draft. */}
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
            className={`${itemClass} text-danger hover:bg-danger-soft`}
            onClick={() => run(onDelete)}
          >
            <Trash2 className="h-4 w-4" /> {t("delete")}
          </button>
        </div>
      )}
    </div>
  );
}
