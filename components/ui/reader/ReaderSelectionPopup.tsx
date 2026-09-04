"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Highlighter, Loader2, StickyNote } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SelectionPopup } from "./hooks/useSelectionPopup";
import { ANNOTATION_COLORS, type AnnotationColor } from "./hooks/useReaderAnnotations";

const POPUP_W = 288;

/* Selected text → [colours] Highlight · Note · Copy. "Highlight" saves at
   once with the chosen colour; "Note" opens a one-line field first. */
export default function ReaderSelectionPopup({
  popup,
  hostWidth,
  color,
  onColor,
  saving,
  onHighlight,
  onNote,
  onDismiss,
}: {
  popup: NonNullable<SelectionPopup>;
  hostWidth: number;
  color: AnnotationColor;
  onColor: (c: AnnotationColor) => void;
  saving: boolean;
  onHighlight: () => void;
  onNote: (note: string) => void;
  onDismiss: () => void;
}) {
  const t = useTranslations("reader");
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const noteRef = useRef<HTMLInputElement>(null);

  // A new selection resets the popup (the documented "adjust state on prop
  // change during render" pattern — no effect, no cascading render).
  const [prevPopup, setPrevPopup] = useState(popup);
  if (popup !== prevPopup) {
    setPrevPopup(popup);
    setNoteOpen(false);
    setNote("");
    setCopied(false);
  }
  useEffect(() => {
    if (noteOpen) noteRef.current?.focus();
  }, [noteOpen]);

  const left = Math.max(8, Math.min(popup.x - POPUP_W / 2, Math.max(8, hostWidth - POPUP_W - 8)));
  const above = popup.y > 120;
  const style = above
    ? { left, top: Math.max(8, popup.y - (noteOpen ? 104 : 56)) }
    : { left, top: popup.bottom + 8 };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(popup.text);
      setCopied(true);
      window.setTimeout(onDismiss, 700);
    } catch {
      /* clipboard blocked */
    }
  };
  const colorLabel = (c: AnnotationColor) =>
    c === "yellow" ? t("colorYellow") : c === "green" ? t("colorGreen") : c === "blue" ? t("colorBlue") : t("colorPink");

  return (
    <div
      data-reader-overlay
      role="toolbar"
      aria-label={t("selectionPopupLabel")}
      className="reader-surface absolute z-50 rounded-xl border p-1.5 shadow-2xl"
      style={{ ...style, width: POPUP_W }}
    >
      <div className="flex items-center gap-1">
        <div role="radiogroup" aria-label={t("annotationColor")} className="flex items-center gap-1 px-1">
          {ANNOTATION_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={colorLabel(c)}
              onClick={() => onColor(c)}
              className={`h-6 w-6 rounded-full transition-transform reader-swatch--${c} ${color === c ? "scale-110 ring-2 ring-white" : "opacity-80 hover:opacity-100"}`}
            />
          ))}
        </div>
        <span className="reader-divider" />
        <button type="button" onClick={onHighlight} disabled={saving} className="reader-btn flex-1 px-2 text-[12px]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <Highlighter className="h-4 w-4" aria-hidden />}
          {t("highlight")}
        </button>
        <button type="button" onClick={() => setNoteOpen((v) => !v)} aria-pressed={noteOpen} className="reader-btn px-2 text-[12px]">
          <StickyNote className="h-4 w-4" aria-hidden />
          {t("note")}
        </button>
        <button type="button" onClick={copy} className="reader-btn px-2 text-[12px]" aria-label={t("copy")}>
          {copied ? <Check className="reader-success h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {noteOpen && (
        <form
          className="mt-1.5 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            onNote(note);
          }}
        >
          <input
            ref={noteRef}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("notePlaceholder")}
            aria-label={t("note")}
            maxLength={500}
            className="reader-input min-h-[2.5rem] flex-1 text-[13px]"
          />
          <button type="submit" disabled={saving} className="reader-btn reader-btn--primary px-3 text-[12px]">
            {t("saveNote")}
          </button>
        </form>
      )}
    </div>
  );
}
