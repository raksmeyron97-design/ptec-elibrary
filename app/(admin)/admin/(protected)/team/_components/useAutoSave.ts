import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Auto-save stops asking after this many consecutive failures.
 *
 * A failing save is usually failing for a reason a retry cannot fix — an
 * expired session, a proxy returning HTML, a server action that 500s — and a
 * timer that keeps firing into it produces one error toast every 30 seconds
 * while the author is still typing. Backing off and then stopping turns that
 * into one visible state the footer can report.
 */
const MAX_CONSECUTIVE_FAILURES = 3;

/** Backoff never grows past this, however many failures precede a reset. */
const MAX_BACKOFF_MS = 5 * 60_000;

type UseAutoSaveOptions = {
  /** Whether the form has unsaved changes */
  isDirty: boolean;
  /** Whether this is an edit (auto-save only works on edit, not new) */
  isEdit: boolean;
  /** Whether the form is currently busy (uploading/saving) */
  busy: boolean;
  /** The save function to call. It MUST reject when the save failed. */
  saveFn: () => Promise<void>;
  /** Interval in ms (default: 30000 = 30s) */
  intervalMs?: number;
  /** Callback on successful save */
  onSaved?: () => void;
  /** Callback on save error */
  onError?: (error: string) => void;
  /** Callback fired once, when auto-save gives up after repeated failures */
  onPaused?: () => void;
};

type UseAutoSaveReturn = {
  lastSaved: Date | null;
  /** True once auto-save has given up; a successful save clears it. */
  paused: boolean;
};

export default function useAutoSave({
  isDirty,
  isEdit,
  busy,
  saveFn,
  intervalMs = 30000,
  onSaved,
  onError,
  onPaused,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [failures, setFailures] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const paused = failures >= MAX_CONSECUTIVE_FAILURES;

  const handleSave = useCallback(async () => {
    /*
      `onSaved` and `setLastSaved` are deliberately outside the try. Inside it,
      a throw from the success callback would be caught and reported as a save
      failure — the form would then show "Auto-save failed" over a record the
      server had already written, which is the same class of lie as the one
      this hook exists to avoid in the other direction.
    */
    let saved = false;
    try {
      await saveFn();
      saved = true;
    } catch (error: unknown) {
      setFailures((n) => n + 1);
      onError?.(
        error instanceof Error && error.message
          ? error.message
          : "Auto-save failed",
      );
    }

    if (!saved) return;
    setFailures(0);
    setLastSaved(new Date());
    onSaved?.();
  }, [saveFn, onSaved, onError]);

  /* A save that lands clears the backlog of failures: `isDirty` goes false only
     when a save — auto or manual — has been confirmed and the snapshot reset.
     Adjusted during render rather than in an effect, which is React's own shape
     for deriving state from a changed prop and costs no extra commit. */
  const [wasDirty, setWasDirty] = useState(isDirty);
  if (wasDirty !== isDirty) {
    setWasDirty(isDirty);
    if (!isDirty && failures !== 0) setFailures(0);
  }

  /* Announce the stop once, on the transition into it. */
  const announcedRef = useRef(false);
  useEffect(() => {
    if (!paused) {
      announcedRef.current = false;
      return;
    }
    if (announcedRef.current) return;
    announcedRef.current = true;
    onPaused?.();
  }, [paused, onPaused]);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (isEdit && isDirty && !busy && !paused) {
      const delay = Math.min(intervalMs * 2 ** failures, MAX_BACKOFF_MS);
      timerRef.current = setTimeout(() => {
        /* The timer cannot await, so a throw from one of the consumer's own
           callbacks would escape as an unhandled rejection on the page rather
           than as anything the form could act on. `handleSave` has already
           reported everything it knows by the time this settles. */
        void handleSave().catch(() => {});
      }, delay);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isDirty, isEdit, busy, intervalMs, handleSave, failures, paused]);

  return { lastSaved, paused };
}
