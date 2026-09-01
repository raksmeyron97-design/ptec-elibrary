"use client";

import AdminErrorState from "@/components/admin/kit/ErrorState";

/**
 * 500 only.
 *
 * These per-route boundaries were hand-written English on raw red Tailwind
 * colours, printing `error.message` — which in production is a redaction, not a
 * message. Authorization never lands here any more: `requireRouteAccess()`
 * raises Next's 403/401 interrupts, which route to forbidden.tsx /
 * unauthorized.tsx instead.
 */
export default function EbookEditError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AdminErrorState error={error} reset={reset} />;
}
