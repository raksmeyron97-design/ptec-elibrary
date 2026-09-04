"use client";

import { useEffect, useRef, type RefObject } from "react";

/** A ref that always holds the latest value — for native/high-frequency
    handlers that must read current state without being re-bound on every
    render. Written in an effect (never during render) so StrictMode's
    double-invoke and concurrent rendering stay honest. */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef<T>(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
