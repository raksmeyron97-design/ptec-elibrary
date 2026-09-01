"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * The admin login page's 500.
 *
 * It sits outside `(protected)`, so it has no permission story of its own — a
 * visitor here is not signed in yet — and it deliberately does NOT use the
 * shared `AdminErrorState`: that component reads the `adminErrors` namespace,
 * which only the panel's own layout loads. The login page carries no
 * IntlProvider namespaces at all (it is untranslated today), so pulling one in
 * here would render message keys on screen at the worst possible moment.
 *
 * What it does adopt from the panel: the status tokens instead of raw red
 * Tailwind, and the digest instead of `error.message` — which production
 * redacts, so printing it only ever showed a React error code.
 */
export default function AdminLoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center"
    >
      <div className="w-full max-w-md rounded-2xl border border-danger-line bg-danger-soft p-8 shadow-sm">
        <span
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-danger-line bg-bg-surface text-danger"
          aria-hidden="true"
        >
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h2 className="text-base font-bold text-danger-text">Something went wrong</h2>
        <p className="mt-1.5 text-sm text-text-body">
          The sign-in page could not be loaded. The problem has been logged.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-[11px] text-text-muted">Reference: {error.digest}</p>
        )}
        <button
          type="button"
          onClick={reset}
          className="focus-field mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-contrast shadow-sm transition-colors duration-150 hover:bg-brand-hover"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </div>
    </div>
  );
}
