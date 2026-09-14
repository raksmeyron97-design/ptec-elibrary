"use client";

// /offline-books error boundary. The state, the wording and the recovery actions are
// shared by every public route: components/ui/core/ErrorRecovery.tsx.
import ErrorRecovery, { type ErrorBoundaryProps } from "@/components/ui/core/ErrorRecovery";

export default function OfflineBooksError(props: ErrorBoundaryProps) {
  return <ErrorRecovery {...props} logLabel="/offline-books" />;
}
