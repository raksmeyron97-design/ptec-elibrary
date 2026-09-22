"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { ConfirmDialog } from "@/components/admin/kit";

const MAX_NOTE = 500;

/**
 * "These are not duplicates."
 *
 * Split out of DuplicateGroupCard so the card stays about the RECORDS. It is
 * `tone="brand"`, not danger, and the body says so in words: this archives
 * nothing, redirects nothing and is undone from the Dismissed tab. Reading like
 * the retire dialog is exactly what it must not do — the two are opposite
 * verdicts and only one of them changes a book.
 *
 * The note is optional and trimmed by the caller: a reviewer who types nothing
 * should not store a blank string that the restore list then renders as an
 * empty quote.
 */
export default function DismissGroupDialog({
  open,
  recordCount,
  note,
  onNoteChange,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  recordCount: number;
  note: string;
  onNoteChange: (value: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("adminDuplicates");

  return (
    <ConfirmDialog
      open={open}
      tone="brand"
      title={t("dismissDialog.title")}
      description={
        <>
          <span className="block">{t("dismissDialog.lead", { count: recordCount })}</span>
          <span className="mt-3 block space-y-1.5 text-[12px] leading-4">
            {[
              t("dismissDialog.effectHide"),
              t("dismissDialog.effectKeep"),
              t("dismissDialog.effectUndo"),
            ].map((line) => (
              <span key={line} className="flex items-start gap-1.5 text-text-body">
                <Check className="mt-px h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                <span>{line}</span>
              </span>
            ))}
          </span>
          <label className="mt-3 block">
            <span className="mb-1.5 block text-sm font-semibold text-text-body">
              {t("dismissDialog.noteLabel")}
            </span>
            <textarea
              value={note}
              onChange={(event) => onNoteChange(event.target.value.slice(0, MAX_NOTE))}
              rows={2}
              maxLength={MAX_NOTE}
              disabled={busy}
              placeholder={t("dismissDialog.notePlaceholder")}
              className="focus-field w-full rounded-lg border border-divider bg-bg-surface px-3 py-2 text-sm text-text-body placeholder:text-text-muted"
            />
            <span className="mt-1.5 block text-xs text-text-muted">{t("dismissDialog.noteHint")}</span>
          </label>
        </>
      }
      confirmLabel={t("dismissDialog.confirm")}
      busyLabel={t("dismissDialog.busy")}
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
