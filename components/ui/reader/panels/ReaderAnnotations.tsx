"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Check, Highlighter, Loader2, Pencil, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Annotation } from "@/app/actions/book-annotations";

/* Highlights and notes: colour dot, page, the highlighted passage and the
   note; tap to go there, pencil to write or revise the note, ✕ to delete
   (each disabled while its own request is in flight).

   The note editor lives here rather than in a dialog because a note is read
   in the context of the passage it is about — moving it behind a modal hides
   the sentence you are annotating. A failed save keeps the text on screen so
   it can be retried instead of retyped. */
const ReaderAnnotations = memo(function ReaderAnnotations({
  annotations,
  loading,
  error,
  pendingDelete,
  pendingEdit,
  canEdit,
  onSelect,
  onRemove,
  onEdit,
  fmt,
}: {
  annotations: Annotation[];
  loading: boolean;
  error: "save" | "edit" | "delete" | null;
  pendingDelete: Set<string>;
  pendingEdit: Set<string>;
  canEdit: boolean;
  onSelect: (page: number) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string, note: string) => Promise<boolean>;
  fmt: (n: number | string) => string;
}) {
  const t = useTranslations("reader");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  // An annotation deleted while its note was open leaves the editor orphaned.
  useEffect(() => {
    if (editing && !annotations.some((a) => a.id === editing)) setEditing(null);
  }, [annotations, editing]);

  const commit = async (id: string) => {
    const ok = await onEdit(id, draft);
    if (ok) setEditing(null);
  };
  if (loading && annotations.length === 0) {
    return (
      <p className="reader-muted flex items-center gap-2 p-3 text-[13px]" role="status">
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
        {t("loading")}
      </p>
    );
  }
  const highlights = annotations.filter((a) => !a.note_content);
  const notes = annotations.filter((a) => !!a.note_content);
  const group = (heading: string, rows: Annotation[]) =>
    rows.length ? (
      <section className="mb-2">
        <h3 className="reader-menu-heading">{heading}</h3>
        <ul className="space-y-1">
          {rows.map((ann) => (
            <li key={ann.id} className="flex items-stretch gap-1">
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => onSelect(ann.page_number)} className="reader-row w-full min-w-0 flex-col items-stretch gap-1">
                  <span className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full reader-swatch--${ann.highlight_color}`} aria-hidden />
                    <span className="reader-accent text-[11px] font-bold">{t("page")} {fmt(ann.page_number)}</span>
                  </span>
                  <span className="reader-muted line-clamp-3 text-[12px] italic leading-5">&ldquo;{ann.selected_text}&rdquo;</span>
                  {ann.note_content && editing !== ann.id && (
                    <span className="line-clamp-4 text-[12.5px] leading-5">{ann.note_content}</span>
                  )}
                </button>

                {editing === ann.id && (
                  <div className="mt-1 px-1">
                    <textarea
                      ref={textareaRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { e.preventDefault(); setEditing(null); }
                        // Enter inserts a newline: a note is prose. Saving is
                        // the explicit control, or ⌘/Ctrl+Enter.
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          void commit(ann.id);
                        }
                      }}
                      rows={3}
                      maxLength={5000}
                      aria-label={t("annotationNoteLabel")}
                      placeholder={t("annotationNotePlaceholder")}
                      className="reader-input w-full resize-y text-[12.5px] leading-5"
                    />
                    <div className="mt-1 flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="reader-btn px-2 text-[12px]"
                      >
                        {t("annotationNoteCancel")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void commit(ann.id)}
                        disabled={pendingEdit.has(ann.id)}
                        className="reader-btn px-2 text-[12px] font-semibold"
                      >
                        {pendingEdit.has(ann.id) ? (
                          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                        ) : (
                          <Check className="h-4 w-4" aria-hidden />
                        )}
                        <span className="ml-1">{t("annotationNoteSave")}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex shrink-0 flex-col gap-1 self-start">
                {canEdit && editing !== ann.id && (
                  <button
                    type="button"
                    onClick={() => { setDraft(ann.note_content ?? ""); setEditing(ann.id); }}
                    aria-label={`${t("annotationNoteEdit")} — ${t("page")} ${fmt(ann.page_number)}`}
                    className="reader-btn"
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                )}
                {editing === ann.id && (
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    aria-label={t("annotationNoteCancel")}
                    className="reader-btn"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(ann.id)}
                  disabled={pendingDelete.has(ann.id)}
                  aria-label={t("deleteAnnotation")}
                  className="reader-btn"
                >
                  {pendingDelete.has(ann.id) ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div>
      {error && (
        <p role="alert" className="reader-danger mb-2 px-2 text-[12px] leading-5">
          {error === "save"
            ? t("annotationSaveError")
            : error === "edit"
              ? t("annotationEditError")
              : t("annotationDeleteError")}
        </p>
      )}
      {annotations.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-4 text-center">
          <Highlighter className="reader-faint h-8 w-8" aria-hidden />
          <p className="reader-muted text-[13px] leading-6">{t("noAnnotations")}</p>
        </div>
      ) : (
        <>
          {group(t("highlightsHeading"), highlights)}
          {group(t("notesHeading"), notes)}
        </>
      )}
    </div>
  );
});

export default ReaderAnnotations;
