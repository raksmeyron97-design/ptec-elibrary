"use client";

import AdminErrorState from "@/components/admin/kit/ErrorState";

/** Users-page 500. Authorization failures never arrive here — see the panel's
 *  own error.tsx and forbidden.tsx. */
export default function UsersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AdminErrorState error={error} reset={reset} />;
}
