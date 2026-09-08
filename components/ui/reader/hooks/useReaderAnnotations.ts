"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addAnnotation,
  deleteAnnotation,
  getBookAnnotations,
  updateAnnotationNote,
  type Annotation,
} from "@/app/actions/book-annotations";

export type AnnotationColor = Annotation["highlight_color"];
export const ANNOTATION_COLORS: readonly AnnotationColor[] = ["yellow", "green", "blue", "pink"];

/**
 * Highlights and notes for the signed-in reader. Every server call is
 * fire-and-report: reading is never blocked on one, a failure surfaces as a
 * message the panel shows, and an in-flight add, edit or delete cannot be
 * submitted twice.
 *
 * `edit` exists because `updateAnnotationNote` had shipped in the action layer
 * with nothing calling it: a reader could highlight a passage and attach a
 * note at the moment of selection, and then never change a word of it. A note
 * you cannot revise is a worse note — the first thing anyone writes about a
 * passage is rarely what they end up thinking about it.
 *
 * State is replaced with the row the SERVER returns, not with the text that
 * was submitted. The two differ (the note is trimmed, and `updated_at` moves),
 * and rendering the optimistic version is how a panel comes to disagree with
 * the database.
 */
export function useReaderAnnotations({ bookId, isLoggedIn }: { bookId: string; isLoggedIn: boolean }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<"save" | "edit" | "delete" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Set<string>>(() => new Set());
  const [pendingEdit, setPendingEdit] = useState<Set<string>>(() => new Set());
  const savingRef = useRef(false);

  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    getBookAnnotations(bookId)
      .then((rows) => {
        if (!cancelled) setAnnotations(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, isLoggedIn]);

  const add = useCallback(
    async (page: number, text: string, note: string, color: AnnotationColor): Promise<boolean> => {
      if (!isLoggedIn || savingRef.current) return false;
      savingRef.current = true;
      setSaving(true);
      setError(null);
      try {
        const result = await addAnnotation(bookId, page, text, note, color);
        if (result.success && result.annotation) {
          const created = result.annotation;
          setAnnotations((prev) => [...prev, created]);
          return true;
        }
        setError("save");
        return false;
      } catch {
        setError("save");
        return false;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [bookId, isLoggedIn],
  );

  const edit = useCallback(
    async (id: string, note: string): Promise<boolean> => {
      if (!isLoggedIn || pendingEdit.has(id)) return false;
      setPendingEdit((s) => new Set(s).add(id));
      setError(null);
      try {
        const result = await updateAnnotationNote(id, note);
        if (result.success && result.annotation) {
          const saved = result.annotation;
          setAnnotations((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
          return true;
        }
        setError("edit");
        return false;
      } catch {
        setError("edit");
        return false;
      } finally {
        setPendingEdit((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }
    },
    [isLoggedIn, pendingEdit],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!isLoggedIn || pendingDelete.has(id)) return;
      setPendingDelete((s) => new Set(s).add(id));
      setError(null);
      try {
        const result = await deleteAnnotation(id);
        // A refusal now includes "no such row for you" — the action reports a
        // zero-row delete rather than calling it a success — so the panel
        // keeps showing an annotation that is still in the database.
        if (result.success) setAnnotations((prev) => prev.filter((a) => a.id !== id));
        else setError("delete");
      } catch {
        setError("delete");
      } finally {
        setPendingDelete((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }
    },
    [isLoggedIn, pendingDelete],
  );

  /** Pages that carry at least one annotation — the text renderer only needs
      the custom path on those. */
  const annotatedPages = useMemo(
    () => new Set(annotations.map((a) => a.page_number)),
    [annotations],
  );

  return {
    annotations,
    annotatedPages,
    loading,
    saving,
    error,
    pendingDelete,
    pendingEdit,
    add,
    edit,
    remove,
    clearError: () => setError(null),
  };
}
