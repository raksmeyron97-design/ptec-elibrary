import { useEffect, useRef, useState, useCallback } from "react";

type UseAutoSaveOptions = {
  /** Whether the form has unsaved changes */
  isDirty: boolean;
  /** Whether this is an edit (auto-save only works on edit, not new) */
  isEdit: boolean;
  /** Whether the form is currently busy (uploading/saving) */
  busy: boolean;
  /** The save function to call */
  saveFn: () => Promise<void>;
  /** Interval in ms (default: 30000 = 30s) */
  intervalMs?: number;
  /** Callback on successful save */
  onSaved?: () => void;
  /** Callback on save error */
  onError?: (error: string) => void;
};

type UseAutoSaveReturn = {
  lastSaved: Date | null;
};

export default function useAutoSave({
  isDirty,
  isEdit,
  busy,
  saveFn,
  intervalMs = 30000,
  onSaved,
  onError,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleSave = useCallback(async () => {
    try {
      await saveFn();
      setLastSaved(new Date());
      onSaved?.();
    } catch (error: any) {
      onError?.(error.message || "Auto-save failed");
    }
  }, [saveFn, onSaved, onError]);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (isEdit && isDirty && !busy) {
      timerRef.current = setTimeout(() => {
        handleSave();
      }, intervalMs);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isDirty, isEdit, busy, intervalMs, handleSave]);

  return { lastSaved };
}
