"use client";

import AdminErrorState from "@/components/admin/kit/ErrorState";

/**
 * The admin panel's 500 — and *only* its 500.
 *
 * This boundary used to also try to be the 403, by testing `error.message`
 * against "forbidden" / "unauthorized". That could never work in production:
 * React redacts server error messages before they reach a client error
 * boundary, so every authorization failure arrived here as an opaque digest and
 * fell through to the red crash branch — an authorization
 * outcome wearing the costume of a crash.
 *
 * Authorization now never reaches this file. `requireRouteAccess()` raises
 * Next's 403/401 interrupts, which route to `forbidden.tsx` / `unauthorized.tsx`
 * with real status codes. What is left here is what belongs here: unexpected
 * failures, shown as unexpected failures, with the digest as the only handle —
 * no stack, no database text, no internal permission detail.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AdminErrorState error={error} reset={reset} />;
}
