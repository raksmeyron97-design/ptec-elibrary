"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkBookDuplicates,
  type DuplicateCheckInput,
  type DuplicateCheckResult,
} from "@/app/actions/book-duplicates";

/**
 * The debounced duplicate probe behind the upload and edit forms.
 *
 * Three rules it exists to hold:
 *
 *  1. **Not on every keystroke.** A check is scheduled `delay` ms after the
 *     last change, and a newer draft supersedes an older in-flight answer —
 *     `requestId` is what stops a slow response for "Intro to P" from
 *     overwriting a fresh one for "Intro to Psychology".
 *  2. **Not on nothing.** Below the trigger threshold the hook reports `idle`,
 *     never `clean`. "We did not look" and "we looked and found nothing" are
 *     different sentences and the form says the right one.
 *  3. **A failure is a failure.** A rejected or errored check lands in `error`,
 *     never in an empty match list — a broken gate that reads as a clean bill
 *     of health is worse than no gate.
 */

export type DuplicateCheckState = "idle" | "checking" | "ready" | "error";

export type DuplicateCheckSnapshot = {
  state: DuplicateCheckState;
  result: Extract<DuplicateCheckResult, { ok: true }> | null;
  error: string | null;
};

/** Enough signal to be worth a round trip. */
export function hasEnoughSignal(input: DuplicateCheckInput): boolean {
  const title = (input.title ?? "").trim();
  const isbnDigits = (input.isbn ?? "").replace(/[^0-9xX]/g, "");
  const hash = (input.contentHash ?? "").trim();
  if (hash.length === 64) return true;
  if (isbnDigits.length >= 10) return true;
  // Four characters of a title is roughly one Khmer word or one short English
  // one — below that every book in the collection is a "match".
  return title.length >= 4;
}

const EMPTY: DuplicateCheckSnapshot = { state: "idle", result: null, error: null };

/** Serialized identity of a draft. Two drafts with the same key are the same
 *  question, so an answer to one is an answer to the other. */
function draftKey(input: DuplicateCheckInput): string {
  return JSON.stringify([
    input.title ?? "",
    input.author ?? "",
    input.isbn ?? "",
    input.publisher ?? "",
    input.year ?? "",
    input.contentHash ?? "",
    input.excludeBookId ?? "",
  ]);
}

export function useDuplicateCheck(input: DuplicateCheckInput, delay = 600): DuplicateCheckSnapshot & {
  /** Force a check now — used by the submit path, which must not act on a
   *  stale debounce window. */
  runNow: () => Promise<Extract<DuplicateCheckResult, { ok: true }> | null>;
} {
  /* The snapshot carries the key of the draft it answers. Anything else would
     let a finished result for "Intro to P" stay on screen under "Intro to
     Psychology" — the panel would be describing a record that is no longer in
     the form. */
  const [answer, setAnswer] = useState<{ key: string } & DuplicateCheckSnapshot>({
    key: "",
    ...EMPTY,
  });
  const requestId = useRef(0);
  /* `runNow` is called from an event handler and must see the record as it is
     at that moment, so the latest draft is mirrored into a ref — assigned in
     an effect, never during render. */
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  });

  const run = useCallback(async (draft: DuplicateCheckInput) => {
    const key = draftKey(draft);
    const id = ++requestId.current;
    setAnswer({ key, state: "checking", result: null, error: null });
    try {
      const result = await checkBookDuplicates(draft);
      if (id !== requestId.current) return null; // superseded
      if (!result.ok) {
        setAnswer({ key, state: "error", result: null, error: result.error });
        return null;
      }
      setAnswer({ key, state: "ready", result, error: null });
      return result;
    } catch (cause) {
      /* A Server Action can reject outright — a dropped connection, or a
         deployment swapped under an open form. Two things go wrong without
         this: the panel stays on "checking" forever, which reads as a gate
         still working when it has stopped; and `runNow()` throws out of the
         submit handler, which is called before the try block that would have
         caught it, leaving the form silent on a click. */
      if (id !== requestId.current) return null;
      const message = cause instanceof Error ? cause.message : String(cause);
      setAnswer({ key, state: "error", result: null, error: message });
      return null;
    }
  }, []);

  const key = draftKey(input);
  const enough = hasEnoughSignal(input);

  useEffect(() => {
    if (!enough) {
      // Supersede anything in flight; the view below is derived from `key`, so
      // nothing has to be cleared here.
      requestId.current += 1;
      return;
    }
    /* `input` is captured from the render in which `key` last changed, which
       is exactly the draft this timer is for. */
    const draft = input;
    const timer = window.setTimeout(() => void run(draft), delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enough, delay, run]);

  const runNow = useCallback(async () => {
    const draft = latest.current;
    if (!hasEnoughSignal(draft)) return null;
    return run(draft);
  }, [run]);

  /* Derived, never stored: an answer only counts for the draft it was asked
     about. Once the record changes, the panel reverts to "checking" rather
     than keeping the previous verdict on screen — a warning that describes a
     title the librarian has already edited away is worse than no warning, and
     the alternative (blanking to idle) makes the panel flicker on every
     keystroke. A draft below the trigger threshold has no answer at all. */
  const view: DuplicateCheckSnapshot = !enough
    ? EMPTY
    : answer.key === key
      ? { state: answer.state, result: answer.result, error: answer.error }
      : { state: "checking", result: null, error: null };

  return { ...view, runNow };
}
