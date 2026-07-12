"use client";

import { useCallback, useSyncExternalStore } from "react";

export const READER_TEXT_SIZE_MIN = 80;
export const READER_TEXT_SIZE_MAX = 160;
export const READER_TEXT_SIZE_STEP = 10;
export const READER_TEXT_SIZE_DEFAULT = 100;
export const READER_TEXT_SIZE_STORAGE_KEY = "ptec.abstractReader.textSize";

function normalizeTextSize(value: number): number {
  if (!Number.isFinite(value)) return READER_TEXT_SIZE_DEFAULT;
  const stepped = Math.round(value / READER_TEXT_SIZE_STEP) * READER_TEXT_SIZE_STEP;
  return Math.min(READER_TEXT_SIZE_MAX, Math.max(READER_TEXT_SIZE_MIN, stepped));
}

let memoryTextSize = READER_TEXT_SIZE_DEFAULT;
let useMemoryFallback = false;
const listeners = new Set<() => void>();

function readClientTextSize(): number {
  if (useMemoryFallback) return memoryTextSize;
  try {
    const stored = window.localStorage.getItem(READER_TEXT_SIZE_STORAGE_KEY);
    memoryTextSize = stored === null
      ? READER_TEXT_SIZE_DEFAULT
      : normalizeTextSize(Number(stored));
  } catch {
    // Retain the in-memory value in private/restricted browsing contexts.
  }
  return memoryTextSize;
}

function readServerTextSize(): number {
  return READER_TEXT_SIZE_DEFAULT;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== READER_TEXT_SIZE_STORAGE_KEY) return;
    useMemoryFallback = false;
    memoryTextSize = event.key === null || event.newValue === null
      ? READER_TEXT_SIZE_DEFAULT
      : normalizeTextSize(Number(event.newValue));
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function updateTextSize(value: number): void {
  memoryTextSize = normalizeTextSize(value);
  try {
    window.localStorage.setItem(READER_TEXT_SIZE_STORAGE_KEY, String(memoryTextSize));
    useMemoryFallback = false;
  } catch {
    // The in-memory preference keeps controls usable when storage is blocked.
    useMemoryFallback = true;
  }
  listeners.forEach((listener) => listener());
}

/**
 * Client-only reader preference state shared by every abstract reader (the
 * inline toolbar and the fullscreen dialog, across publications and theses).
 * The server and first client render both use 100%, then a saved preference is
 * applied after hydration — so SSR markup never mismatches.
 */
export function useReaderPreferences() {
  const textSize = useSyncExternalStore(subscribe, readClientTextSize, readServerTextSize);

  const decreaseTextSize = useCallback(() => {
    updateTextSize(textSize - READER_TEXT_SIZE_STEP);
  }, [textSize]);

  const increaseTextSize = useCallback(() => {
    updateTextSize(textSize + READER_TEXT_SIZE_STEP);
  }, [textSize]);

  const resetTextSize = useCallback(() => updateTextSize(READER_TEXT_SIZE_DEFAULT), []);

  return {
    textSize,
    decreaseTextSize,
    increaseTextSize,
    resetTextSize,
    canDecrease: textSize > READER_TEXT_SIZE_MIN,
    canIncrease: textSize < READER_TEXT_SIZE_MAX,
  };
}
