"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

// ─────────────────────────────────────────────────────────────────────────────
// "A new version is available" — the other half of `skipWaiting: false`.
//
// app/sw.ts stopped letting a freshly installed worker seize control of open
// pages, because those pages are still running the previous build and its route
// chunks are hashed per deployment: a navigation inside a tab someone had open
// could request a chunk the new deployment had already replaced. The cost of
// that fix is that users would otherwise sit on stale code indefinitely, since
// a waiting worker only activates once every tab for the origin is closed —
// which, for an installed PWA people leave open, can be never.
//
// So the handover becomes a decision the reader makes. This watches for a
// waiting worker and offers a button; nothing reloads until it is pressed, so
// the update can never interrupt a PDF, a form, or an admin edit.
//
// It also never speaks in the first UPDATE_PROMPT_QUIET_MS of a visit: a
// worker found while the page is still settling would put a toast over the
// first thing a reader looks at, for an update that can wait ten seconds.
// The clock is the document's (performance.now()), so a client-side route
// change does not restart it.
// ─────────────────────────────────────────────────────────────────────────────

/** No update prompt during the first ten seconds of a visit. */
export const UPDATE_PROMPT_QUIET_MS = 10_000;

export default function UpdateAvailable() {
  // RootShell mounts this under every root layout, so its namespace is in
  // ROOT_NAMESPACES — the only one guaranteed on /admin and /auth too.
  const t = useTranslations("pwaUpdate");
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);
  const [quietOver, setQuietOver] = useState(false);
  const reloading = useRef(false);

  // Ends the quiet period at UPDATE_PROMPT_QUIET_MS after the document loaded
  // (immediately, if that has already passed).
  useEffect(() => {
    const id = setTimeout(() => setQuietOver(true), Math.max(0, UPDATE_PROMPT_QUIET_MS - performance.now()));
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // One signal unregisters everything, including the listeners attached
    // inside the async getRegistration() callback and the nested statechange
    // listener below. Hand-rolled cleanup arrays cannot cover those: they are
    // populated after an await, so an unmount that lands in between leaves a
    // listener holding this component's setState.
    const controller = new AbortController();
    const { signal } = controller;

    // A worker is only an *update* if this page is already controlled by an
    // older one. On a first-ever visit the very first worker also reaches
    // "installed", and prompting someone to update a page they just opened is
    // nonsense.
    const offerIfUpdate = (sw: ServiceWorker | null) => {
      if (!signal.aborted && sw && navigator.serviceWorker.controller) setWaiting(sw);
    };

    navigator.serviceWorker
      .getRegistration()
      .then((registration) => {
        if (signal.aborted || !registration) return;

        offerIfUpdate(registration.waiting);

        registration.addEventListener(
          "updatefound",
          () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener(
              "statechange",
              () => {
                if (installing.state === "installed") offerIfUpdate(registration.waiting);
              },
              { signal },
            );
          },
          { signal },
        );
      })
      .catch(() => {
        // No worker, or storage disabled. There is simply nothing to offer.
      });

    // The new worker calling clients.claim() after skipWaiting() fires this.
    // Reloading here (rather than in the click handler) is what makes the
    // button reliable: it waits for the handover to actually happen instead of
    // guessing at a delay, and it also covers the case where another tab
    // accepted the update first.
    //
    // ONLY when this page was already controlled. `clientsClaim: true` also
    // fires controllerchange the first time a worker ever activates, on a page
    // that was loaded before it existed — reloading there yanks the page out
    // from under someone seconds into their first visit (and, measurably,
    // destroyed the execution context mid-test). A first claim is not a
    // handover: nothing about the page is stale, so there is nothing to reload.
    const wasControlled = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        if (!wasControlled || reloading.current) return;
        reloading.current = true;
        window.location.reload();
      },
      { signal },
    );

    return () => controller.abort();
  }, []);

  const applyUpdate = useCallback(() => {
    if (!waiting) return;
    setUpdating(true);
    waiting.postMessage({ type: "SKIP_WAITING" });
  }, [waiting]);

  if (!waiting || !quietOver) return null;

  return (
    // Phones: docked above the tab bar (--ptec-mobile-nav-clearance, 0 at lg).
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-3 z-[200] mx-auto max-w-md rounded-xl border border-divider bg-bg-surface p-3 shadow-lg bottom-[calc(var(--ptec-mobile-nav-clearance)+0.75rem)] sm:inset-x-auto sm:right-4 lg:bottom-[calc(1rem+env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-text-body">
          {t("message")}
        </p>
        <button
          type="button"
          onClick={applyUpdate}
          disabled={updating}
          className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-contrast transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {updating ? t("updating") : t("update")}
        </button>
        <button
          type="button"
          onClick={() => setWaiting(null)}
          className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-text-muted transition-colors hover:text-text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          aria-label={t("dismiss")}
        >
          {t("later")}
        </button>
      </div>
    </div>
  );
}
