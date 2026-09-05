"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  INITIAL_CONNECTIVITY,
  connectivityBadge,
  mayFetch,
  nextProbeDelay,
  reduceConnectivity,
  type ConnectivityEvent,
  type ConnectivityState,
} from "@/lib/reader/connectivity";
import type { PdfErrorKind } from "@/lib/reader/errors";

/**
 * Network-interruption handling for the reader. The policy is the pure state
 * machine in lib/reader/connectivity.ts; this hook only wires it to the
 * browser: the `online`/`offline` events, a probe timer with backoff, and
 * the one side effect that matters — asking the viewer to reload the
 * document once, after connectivity is confirmed, if a request failed while
 * the link was down (a failed range request leaves its chunk permanently
 * "in flight" inside pdf.js, so a later request for it hangs rather than
 * retrying; see the audit, F2).
 *
 * The probe is a one-byte Range request for the document itself: it proves
 * the whole path — session, proxy, storage — rather than a CDN edge, and it
 * costs one `fileRange` token. It runs only when the browser claims to be
 * online (the `online` event is the trigger otherwise), never while a probe
 * is in flight, and on the 2 → 30 s schedule in READER_BUDGETS.
 *
 * `enabled: false` (the offline reader over a blob URL, or no document) makes
 * the hook inert: no listeners, no timers, no requests.
 */
export function useConnectivity({
  enabled,
  probeUrl,
  onReload,
  onTransition,
  onRecovery,
}: {
  enabled: boolean;
  probeUrl: string | null | undefined;
  /** Reload the document, preserving reader state. Called at most once per outage. */
  onReload: () => void;
  /** Telemetry: the reader stopped being able to fetch. */
  onTransition?: () => void;
  /** Telemetry: connectivity is confirmed back. `reloaded` says whether the
      document had to be reloaded to clear pdf.js's broken chunk state. */
  onRecovery?: (reloaded: boolean) => void;
}) {
  const [state, dispatch] = useReducer(
    (s: ConnectivityState, e: ConnectivityEvent) => reduceConnectivity(s, e),
    INITIAL_CONNECTIVITY,
  );
  const callbacks = useRef({ onReload, onTransition, onRecovery });
  useEffect(() => {
    callbacks.current = { onReload, onTransition, onRecovery };
  });
  const probeUrlRef = useRef(probeUrl);
  useEffect(() => {
    probeUrlRef.current = probeUrl;
  }, [probeUrl]);

  /* Browser events. `navigator.onLine` at mount seeds the state, so a reader
     opened from a cached page while already offline starts frozen. */
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (!navigator.onLine) dispatch({ type: "browserOffline" });
    const onOffline = () => dispatch({ type: "browserOffline" });
    const onOnline = () => dispatch({ type: "browserOnline" });
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled]);

  /** A pdf.js load failed. Transient kinds start (or extend) an outage; the
      reducer ignores the rest. */
  const reportLoadFailure = useCallback(
    (kind: PdfErrorKind) => {
      if (enabled) dispatch({ type: "loadFailed", kind });
    },
    [enabled],
  );

  /* One place decides what an OBSERVED transition means, so a repeated
     failure inside one outage cannot report twice and a recovery cannot be
     missed. Reading the transition here rather than at each dispatch site is
     also what keeps the callbacks out of render. */
  const prevStatus = useRef(state.status);
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = state.status;
    if (was === "online" && state.status !== "online") callbacks.current.onTransition?.();
    if (was !== "online" && state.status === "online" && !state.needsReload) {
      callbacks.current.onRecovery?.(false);
    }
  }, [state.status, state.needsReload]);

  /* The one side effect of recovery: a document whose chunk state pdf.js
     cannot repair is reloaded, exactly once. */
  useEffect(() => {
    if (state.status !== "online" || !state.needsReload) return;
    dispatch({ type: "reloaded" });
    callbacks.current.onReload();
    callbacks.current.onRecovery?.(true);
  }, [state.status, state.needsReload]);

  /* The probe loop. Re-armed whenever the machine's answer to "when next?"
     changes; cleared on every re-arm and on unmount, so exactly one timer
     exists at a time. */
  useEffect(() => {
    if (!enabled) return;
    const delay = nextProbeDelay(state);
    if (delay === null) return;
    let cancelled = false;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (cancelled) return;
      dispatch({ type: "probeStart" });
      const ok = await probe(probeUrlRef.current, controller.signal);
      if (cancelled) return;
      dispatch({ type: ok ? "probeOk" : "probeFailed" });
    }, delay);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
    // `state` as a whole is the input: status, attempt and browserOnline all
    // change the answer, and re-arming on any of them is the intent.
  }, [enabled, state]);

  return {
    state,
    reportLoadFailure,
    mayFetch: !enabled || mayFetch(state),
    badge: (fromCache: boolean) =>
      enabled ? connectivityBadge(state, fromCache) : fromCache ? ("cached" as const) : null,
  };
}

/** True when the document is reachable again. A 401/403/404 also returns
    true: the network is back, and the document's own error screen is the
    right place to say what is wrong with the file. */
async function probe(url: string | null | undefined, signal: AbortSignal): Promise<boolean> {
  if (!url || url.startsWith("blob:")) return true;
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      cache: "no-store",
      credentials: "same-origin",
      signal,
    });
    // One byte, and the body is released rather than read.
    try {
      await res.body?.cancel();
    } catch {
      /* already consumed */
    }
    if (res.status === 429 || res.status >= 500) return false;
    return true;
  } catch {
    return false;
  }
}
