"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import CitePublication from "@/components/ui/publications/CitePublication";
import { onCiteDialogOpen } from "@/lib/publications/cite-bus";
import type { Publication } from "@/lib/publications";

/**
 * "Cite this article", as a dialog.
 *
 * A native <dialog> opened with showModal(), for the same reasons the figure
 * lightbox uses one: the browser supplies the focus trap, the inert page
 * behind it and Escape-to-close, instead of each being re-implemented and one
 * of them being wrong. Focus goes back to whichever control opened it — the
 * header's Cite button or the phone dock's — because the opener is recorded
 * when the open event arrives.
 *
 * On a phone it is a bottom sheet (full width, flush to the bottom edge, the
 * safe area respected); from `sm` it is a centred panel.
 */
export default function CiteArticleDialog({
  publication,
  labels,
}: {
  publication: Publication;
  labels: { title: string; close: string };
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(
    () =>
      onCiteDialogOpen(() => {
        openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setOpen(true);
      }),
    [],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    // Restore focus explicitly: not every browser returns it to an opener
    // that lives outside the dialog's own subtree.
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={handleClose}
      // A click that lands on the dialog element itself is the backdrop; the
      // panel inside never lets a click reach it.
      onClick={(event) => {
        if (event.target === dialogRef.current) setOpen(false);
      }}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-divider bg-bg-surface p-0 text-text-body shadow-2xl backdrop:bg-black/50 sm:m-auto sm:w-[min(560px,92vw)] sm:rounded-2xl"
    >
      {open && (
        <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id={titleId} className="font-khmer-serif text-[20px] font-bold leading-snug text-text-heading">
              {labels.title}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={labels.close}
              className="-mr-2 -mt-1 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-paper hover:text-text-heading"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <CitePublication publication={publication} />
        </div>
      )}
    </dialog>
  );
}
