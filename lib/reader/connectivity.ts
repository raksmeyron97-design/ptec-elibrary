/* Network-interruption model for the reader — pure, so the whole recovery
   policy is unit-testable without a browser.

   Why a state machine rather than `navigator.onLine`: that flag is optimistic
   (a captive portal, a dead tunnel and a 429 all report "online"), and the
   thing that actually breaks is inside pdf.js — a range request that fails
   leaves its chunk registered as in-flight for the life of the document, so
   later requests for it hang rather than retry (audit F2). Recovery is
   therefore a DOCUMENT RELOAD that preserves reader state, and it must happen
   exactly once, only after connectivity is confirmed, and only if a failure
   actually occurred; while disconnected the reader must stop asking.

   States
     online        normal; prefetch and new mounts allowed
     offline       the browser says offline, or a transient failure was seen
                   and no probe has succeeded since; nothing new is requested
     reconnecting  a probe is in flight

   Events
     browserOffline / browserOnline   the window events
     loadFailed                        a page/document load failed (classified)
     probeStart / probeOk / probeFailed
     reloaded                          the document was reloaded after recovery */

import { READER_BUDGETS } from "./budgets";
import type { PdfErrorKind } from "./errors";

export type ConnectivityStatus = "online" | "offline" | "reconnecting";

export type ConnectivityState = {
  status: ConnectivityStatus;
  /** What the browser last said. Probes are pointless while it says offline. */
  browserOnline: boolean;
  /** Consecutive failed probes since the outage began. */
  attempt: number;
  /** A pdf.js request failed during this outage — the document must be
      reloaded once the network is back. */
  needsReload: boolean;
  /** Outages observed this session (telemetry). */
  transitions: number;
};

export type ConnectivityEvent =
  | { type: "browserOffline" }
  | { type: "browserOnline" }
  | { type: "loadFailed"; kind: PdfErrorKind }
  | { type: "probeStart" }
  | { type: "probeOk" }
  | { type: "probeFailed" }
  | { type: "reloaded" };

export const INITIAL_CONNECTIVITY: ConnectivityState = {
  status: "online",
  browserOnline: true,
  attempt: 0,
  needsReload: false,
  transitions: 0,
};

/** Failures worth waiting out. A 404 or a 403 will not fix itself. */
export function isTransientPdfError(kind: PdfErrorKind): boolean {
  return kind === "network" || kind === "rateLimited" || kind === "server";
}

/** Delay before probe `attempt` (0-based). The schedule's last entry repeats. */
export function backoffMs(attempt: number, schedule: readonly number[] = READER_BUDGETS.RECONNECT_BACKOFF_MS): number {
  if (!schedule.length) return 30_000;
  return schedule[Math.min(Math.max(0, attempt), schedule.length - 1)];
}

export function reduceConnectivity(state: ConnectivityState, event: ConnectivityEvent): ConnectivityState {
  switch (event.type) {
    case "browserOffline":
      return {
        ...state,
        browserOnline: false,
        status: "offline",
        attempt: 0,
        transitions: state.status === "online" ? state.transitions + 1 : state.transitions,
      };
    case "browserOnline":
      // The browser's word alone does not end an outage: a probe must succeed.
      return state.status === "online"
        ? { ...state, browserOnline: true }
        : { ...state, browserOnline: true, status: "offline", attempt: 0 };
    case "loadFailed":
      if (!isTransientPdfError(event.kind)) return state;
      return {
        ...state,
        status: state.status === "reconnecting" ? "reconnecting" : "offline",
        needsReload: true,
        transitions: state.status === "online" ? state.transitions + 1 : state.transitions,
      };
    case "probeStart":
      return state.status === "online" ? state : { ...state, status: "reconnecting" };
    case "probeOk":
      return { ...state, status: "online", attempt: 0 };
    case "probeFailed":
      return { ...state, status: "offline", attempt: state.attempt + 1 };
    case "reloaded":
      return { ...state, needsReload: false };
  }
}

/**
 * When to probe next, in ms, or null for "wait for an event". No probes while
 * the browser says offline (its `online` event is the trigger); none while
 * online or already probing.
 */
export function nextProbeDelay(state: ConnectivityState, schedule?: readonly number[]): number | null {
  if (state.status !== "offline") return null;
  if (!state.browserOnline) return null;
  return backoffMs(state.attempt, schedule);
}

/** Whether the reader may issue new pdf.js requests (mount pages, prefetch). */
export const mayFetch = (state: ConnectivityState): boolean => state.status === "online";

/** After a successful probe: reload only if something actually broke. */
export const shouldReloadAfterProbe = (state: ConnectivityState): boolean =>
  state.status === "online" && state.needsReload;

/** The HUD's word for the situation. `null` = say nothing. */
export function connectivityBadge(
  state: ConnectivityState,
  fromCache: boolean,
): "cached" | "offline" | "reconnecting" | null {
  if (fromCache) return "cached";
  if (state.status === "reconnecting") return "reconnecting";
  if (state.status === "offline") return "offline";
  return null;
}
