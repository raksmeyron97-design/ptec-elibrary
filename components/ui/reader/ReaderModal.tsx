"use client";

import { useEffect, useId, type ReactNode } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

/* Accessible dialog primitive for the reader — rendered INSIDE the reader
   surface (not a portal) so focus-reading mode's Tab trap and the fullscreen
   stacking context both contain it. Focus moves in on open, Tab cycles,
   Escape and the scrim close it, and focus returns to the opener. */

export default function ReaderModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "sm",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md";
}) {
  const t = useTranslations("reader");
  const titleId = useId();
  const descId = useId();
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div data-reader-overlay className="absolute inset-0 z-[60] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div className="reader-scrim absolute inset-0" onClick={onClose} aria-hidden />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`reader-surface relative flex max-h-full w-full flex-col overflow-hidden rounded-2xl border shadow-2xl outline-none ${
          size === "md" ? "max-w-lg" : "max-w-sm"
        }`}
      >
        <div className="reader-line-b flex items-start gap-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[15px] font-bold leading-6">{title}</h2>
            {description && (
              <p id={descId} className="reader-muted mt-0.5 text-[12.5px] leading-5">{description}</p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label={t("close")} className="reader-btn -mr-2 -mt-1">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <div className="reader-line-t flex flex-wrap items-center justify-end gap-2 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
