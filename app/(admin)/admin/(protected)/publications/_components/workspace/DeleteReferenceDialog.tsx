"use client";

// Deletion safety for references. Deleting a cited reference is a bigger
// decision than deleting an uncited one, so the dialog spells out exactly
// which citations disappear with it. Orphaned citation tokens are impossible:
// confirmation removes the reference AND all its tokens in one operation.

import { useEffect } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import type { PublicationReference } from "@/lib/publications";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import { referenceCardDisplay } from "./shared";

export interface DeleteReferenceDialogProps {
  reference: PublicationReference | null;
  position: number;
  citedEn: number;
  citedKm: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteReferenceDialog({
  reference,
  position,
  citedEn,
  citedKm,
  onCancel,
  onConfirm,
}: DeleteReferenceDialogProps) {
  const open = reference !== null;
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!reference) return null;

  const display = referenceCardDisplay(reference);
  const cited = citedEn + citedKm > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={trapRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-ref-title"
        aria-describedby="delete-ref-body"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-xl"
      >
        <div className="p-5">
          <h2 id="delete-ref-title" className="flex items-center gap-2 text-sm font-bold text-text-heading">
            <AlertTriangle className={`h-4 w-4 ${cited ? "text-danger" : "text-warning"}`} aria-hidden="true" />
            Delete reference [{position}]?
          </h2>

          <div id="delete-ref-body" className="mt-3 space-y-3">
            <p className="rounded-lg bg-paper/60 px-3 py-2 text-[13px] leading-5 text-text-body">
              <span className="font-semibold">{display.shortCitation}</span>
              {display.title && display.title !== display.shortCitation ? (
                <>
                  <br />
                  <span className="text-text-muted">{display.title}</span>
                </>
              ) : null}
            </p>

            {cited ? (
              <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-[12.5px] leading-5 text-text-body">
                <p className="font-semibold text-danger">This reference is cited in the abstracts:</p>
                <ul className="mt-1 list-inside list-disc">
                  {citedEn > 0 ? (
                    <li>
                      English abstract — {citedEn} citation{citedEn === 1 ? "" : "s"}
                    </li>
                  ) : null}
                  {citedKm > 0 ? (
                    <li>
                      Khmer abstract — {citedKm} citation{citedKm === 1 ? "" : "s"}
                    </li>
                  ) : null}
                </ul>
                <p className="mt-1">
                  Deleting it also removes those inline citations, and later references renumber
                  automatically.
                </p>
              </div>
            ) : (
              <p className="text-[12.5px] leading-5 text-text-muted">
                This reference is not cited anywhere, so no abstract text changes.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-divider bg-paper/40 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-10 cursor-pointer rounded-lg border border-divider px-4 text-[13px] font-semibold text-text-body transition-colors hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          >
            Keep reference
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-danger px-4 text-[13px] font-semibold text-white transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {cited ? "Delete reference and its citations" : "Delete reference"}
          </button>
        </div>
      </div>
    </div>
  );
}
