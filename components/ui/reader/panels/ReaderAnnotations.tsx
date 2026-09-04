"use client";

import { memo } from "react";
import { Highlighter, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Annotation } from "@/app/actions/book-annotations";

/* Highlights and notes: colour dot, page, the highlighted passage and the
   note; tap to go there, ✕ to delete (disabled while the delete is in flight). */
const ReaderAnnotations = memo(function ReaderAnnotations({
  annotations,
  loading,
  error,
  pendingDelete,
  onSelect,
  onRemove,
  fmt,
}: {
  annotations: Annotation[];
  loading: boolean;
  error: "save" | "delete" | null;
  pendingDelete: Set<string>;
  onSelect: (page: number) => void;
  onRemove: (id: string) => void;
  fmt: (n: number | string) => string;
}) {
  const t = useTranslations("reader");
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
              <button type="button" onClick={() => onSelect(ann.page_number)} className="reader-row min-w-0 flex-1 flex-col items-stretch gap-1">
                <span className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full reader-swatch--${ann.highlight_color}`} aria-hidden />
                  <span className="reader-accent text-[11px] font-bold">{t("page")} {fmt(ann.page_number)}</span>
                </span>
                <span className="reader-muted line-clamp-3 text-[12px] italic leading-5">&ldquo;{ann.selected_text}&rdquo;</span>
                {ann.note_content && <span className="line-clamp-4 text-[12.5px] leading-5">{ann.note_content}</span>}
              </button>
              <button
                type="button"
                onClick={() => onRemove(ann.id)}
                disabled={pendingDelete.has(ann.id)}
                aria-label={t("deleteAnnotation")}
                className="reader-btn shrink-0 self-start"
              >
                {pendingDelete.has(ann.id) ? (
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden />
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div>
      {error && (
        <p role="alert" className="reader-danger mb-2 px-2 text-[12px] leading-5">
          {error === "save" ? t("annotationSaveError") : t("annotationDeleteError")}
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
