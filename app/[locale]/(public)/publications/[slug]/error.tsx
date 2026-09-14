"use client";

// /publications/[slug] error boundary. The state, the wording and the recovery actions are
// shared by every public route: components/ui/core/ErrorRecovery.tsx.
import ErrorRecovery, { type ErrorBoundaryProps } from "@/components/ui/core/ErrorRecovery";

export default function PublicationError(props: ErrorBoundaryProps) {
  return <ErrorRecovery {...props} subject="publication" logLabel="/publications/[slug]" />;
}
