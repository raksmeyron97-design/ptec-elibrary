import { invalidateSession } from "@/components/providers/SessionProvider";

/**
 * Wipe browser-held state that belongs to the account being signed out.
 *
 * The service worker keeps derived caches (rendered pages, public Supabase
 * reads) that can hold a response produced while the previous account was
 * signed in. On a shared device the next person must not be able to pull those
 * back out of Cache Storage, so we tell the worker to drop them.
 *
 * DELIBERATELY NOT CLEARED: books the user downloaded for offline reading
 * ("offline-books"/"book-covers"). Those are content the user explicitly chose
 * to keep, they can be large, and silently destroying them on sign-out would be
 * a nasty surprise — lib/offline.ts owns their lifecycle and the UI has a
 * Remove button. If this library ever runs on genuinely shared kiosk devices,
 * that is the decision to revisit.
 *
 * Best-effort by design: everything here can fail (no SW, storage disabled,
 * private browsing) and sign-out must succeed anyway.
 */
export async function clearPrivateBrowserState(): Promise<void> {
  invalidateSession();

  try {
    const reg = await navigator.serviceWorker?.ready;
    reg?.active?.postMessage({ type: "CLEAR_PRIVATE_CACHES" });
  } catch {
    // No service worker, or storage unavailable — nothing cached to clear.
  }
}
