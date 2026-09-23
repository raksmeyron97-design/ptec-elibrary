"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy, Highlighter, Loader2, StickyNote } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SelectionPopup } from "./hooks/useSelectionPopup";
import { ANNOTATION_COLORS, type AnnotationColor } from "./hooks/useReaderAnnotations";

/* The toolbar is TWO rows — swatches, then actions — and that is what makes
   it fit. On one row the four swatches, the divider and three labelled
   buttons overran the popup in BOTH languages, and a flex row over budget
   shrinks its children: measured, the `Highlighter` icon was 0px wide at
   every width in English and Khmer, so the primary action rendered as a bare
   word. Widening the popup enough for the longer locale would put a ~380px
   slab over the line being read, and a phone host would clamp it back
   anyway. Two rows hold both with room to spare, so every icon keeps
   `shrink-0` and no label competes with a swatch for space. */
const POPUP_W = 312;
/* Only until the real element is measured — the first paint is one frame. */
const FALLBACK_H = 92;

/* Selected text → [colours] / Highlight · Note · Copy. "Highlight" saves at
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

  // Placed above the selection from the toolbar's MEASURED height, not from a
  // constant per state: the note field, a longer locale and a wrapped row all
  // change it, and each hardcoded offset that misses drops the toolbar onto
  // the words it was opened over.
  const hostRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(FALLBACK_H);
  // Opening the note field is a known height change, so it is measured before
  // the paint that shows it — a ResizeObserver fires after, which would drop
  // the taller toolbar onto the selection for a frame.
  useLayoutEffect(() => {
    if (hostRef.current) setHeight(hostRef.current.offsetHeight);
  }, [noteOpen, popup]);
  // Everything else that moves it — a font finishing loading, a locale with
  // longer labels, a zoom change — arrives here.
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const width = Math.min(POPUP_W, Math.max(240, hostWidth - 16));
  const left = Math.max(8, Math.min(popup.x - width / 2, Math.max(8, hostWidth - width - 8)));
  const above = popup.y > height + 24;
  const style = above ? { left, top: Math.max(8, popup.y - height - 8) } : { left, top: popup.bottom + 8 };

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
      ref={hostRef}
      data-reader-overlay
      role="toolbar"
      aria-label={t("selectionPopupLabel")}
      aria-orientation="horizontal"
      className="reader-surface absolute z-50 rounded-xl border p-1.5 shadow-2xl"
      style={{ ...style, width }}
    >
      <div role="radiogroup" aria-label={t("annotationColor")} className="flex items-center justify-center gap-2 pb-1.5">
        {ANNOTATION_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c}
            aria-label={colorLabel(c)}
            title={colorLabel(c)}
            onClick={() => onColor(c)}
            className={`h-6 w-6 shrink-0 rounded-full transition-transform reader-swatch--${c} ${color === c ? "scale-110 ring-2 ring-white" : "opacity-80 hover:opacity-100"}`}
          />
        ))}
      </div>
      <div className="reader-line-t flex items-center gap-1 pt-1.5">
        <button
          type="button"
          onClick={onHighlight}
          disabled={saving}
          className="reader-btn min-w-0 flex-1 px-2 text-[12px] whitespace-nowrap"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Highlighter className="h-4 w-4 shrink-0" aria-hidden />
          )}
          {t("highlight")}
        </button>
        <button
          type="button"
          onClick={() => setNoteOpen((v) => !v)}
          aria-pressed={noteOpen}
          className="reader-btn shrink-0 px-2 text-[12px] whitespace-nowrap"
        >
          <StickyNote className="h-4 w-4 shrink-0" aria-hidden />
          {t("note")}
        </button>
        <button type="button" onClick={copy} className="reader-btn shrink-0 px-2 text-[12px]" aria-label={t("copy")} title={t("copy")}>
          {copied ? <Check className="reader-success h-4 w-4 shrink-0" aria-hidden /> : <Copy className="h-4 w-4 shrink-0" aria-hidden />}
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
            className="reader-input min-h-[2.5rem] min-w-0 flex-1 text-[13px]"
          />
          <button type="submit" disabled={saving} className="reader-btn reader-btn--primary shrink-0 px-3 text-[12px]">
            {t("saveNote")}
          </button>
        </form>
      )}
    </div>
  );
}
