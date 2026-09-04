"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addAnnotation,
  deleteAnnotation,
  getBookAnnotations,
  type Annotation,
} from "@/app/actions/book-annotations";

export type AnnotationColor = Annotation["highlight_color"];
export const ANNOTATION_COLORS: readonly AnnotationColor[] = ["yellow", "green", "blue", "pink"];

/**
 * Highlights and notes for the signed-in reader. Every server call is
 * fire-and-report: reading is never blocked on one, a failure surfaces as a
 * message the panel shows, and an in-flight add or delete cannot be
 * submitted twice.
 */
export function useReaderAnnotations({ bookId, isLoggedIn }: { bookId: string; isLoggedIn: boolean }) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<"save" | "delete" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Set<string>>(() => new Set());
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

  const remove = useCallback(
    async (id: string) => {
      if (!isLoggedIn || pendingDelete.has(id)) return;
      setPendingDelete((s) => new Set(s).add(id));
      setError(null);
      try {
        const result = await deleteAnnotation(id);
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

  return { annotations, annotatedPages, loading, saving, error, pendingDelete, add, remove, clearError: () => setError(null) };
}
