/**
 * Save failures the raw message cannot explain.
 *
 * Next's App Router throws "An unexpected response was received from the
 * server." (E394) when a Server Action POST comes back as anything other than
 * an RSC payload. The two ways that happens here are both about the transport,
 * not about the form: the admin's Supabase session has expired, so middleware
 * answers the action POST with a 307 to /admin/login and the browser follows it
 * to an HTML page; or a proxy in front of the app (the Cloudflare tunnel) hands
 * back its own 502/504/413 error page. Either way the author's edits are still
 * in the fields, and the thing to do is sign in again in a second tab and press
 * Save — which the raw sentence says nothing about.
 *
 * This translates the message only. It never decides whether a save happened:
 * that is still the Server Action's own result.
 *
 * It lives in its own module rather than inside the form so it can be exercised
 * without mounting a component that imports `next/navigation` and four Server
 * Actions — the message an author reads on a failed save is worth a test.
 */
export type SaveErrorDescription = {
  message: string;
  /** The transport failed, not the data — the banner offers a sign-in link. */
  sessionExpired: boolean;
};

export const SESSION_EXPIRED_MESSAGE =
  "Your changes were not saved — the server did not answer this form. " +
  "Your admin session has most likely expired. Sign in again in a new tab, " +
  "then come back to this page and press Save. Nothing you typed has been lost.";

export function describeSaveError(err: unknown): SaveErrorDescription {
  const raw =
    err instanceof Error && err.message ? err.message : "Save failed.";
  if (!raw.toLowerCase().includes("unexpected response")) {
    return { message: raw, sessionExpired: false };
  }
  return { message: SESSION_EXPIRED_MESSAGE, sessionExpired: true };
}
