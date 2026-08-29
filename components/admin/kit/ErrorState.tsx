"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * The canonical admin `error.tsx` body.
 *
 * The per-route copies this replaces were hand-written English strings on raw
 * `red-50`/`red-600`/`red-700` Tailwind colours — outside the token system, so
 * they ignored the status palette every other callout in the panel uses, and
 * untranslated, so a Khmer administrator hit an English wall. Both are the kind
 * of thing that only shows up when something has already gone wrong.
 *
 * `error.tsx` must be a client component, so this reads its strings through
 * `useTranslations` and the namespace must be in ADMIN_NAMESPACES.
 */
export default function AdminErrorState({
  error,
  reset,
  /** Optional one-line "what failed", e.g. "The collection could not be loaded." */
  description,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  description?: string;
}) {
  const t = useTranslations("adminErrors");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-2xl border border-danger-line bg-danger-soft px-6 py-16 text-center"
    >
      <span
        className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-danger-line bg-bg-surface text-danger"
        aria-hidden="true"
      >
        <AlertTriangle className="h-6 w-6" />
      </span>
      <p className="text-base font-bold text-danger-text">{t("title")}</p>
      <p className="mt-1.5 max-w-sm text-sm text-text-body">{description ?? t("body")}</p>

      {/* The digest is the only handle support has on a production error — the
          message itself is redacted by Next in a production build. */}
      {error.digest && (
        <p className="mt-3 font-mono text-[11px] text-text-muted">
          {t("reference", { digest: error.digest })}
        </p>
      )}

      <button
        type="button"
        onClick={reset}
        className="focus-field mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-contrast shadow-sm transition-colors duration-150 hover:bg-brand-hover"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {t("retry")}
      </button>
    </div>
  );
}
