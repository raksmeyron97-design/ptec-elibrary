"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * The list failed to load — distinct from "no books yet" and from "no books
 * match these filters", which are the other two states this slot can show.
 * Only this one offers Retry; the other two offer a way forward, not a redo.
 *
 * Previously hardcoded `red-200` / `red-50` / `red-600` and English strings.
 * The status triplet (`danger-soft` / `danger-line` / `danger-text`) is what
 * every other callout in the panel uses — see lib/status-tokens.test.ts.
 */
export default function EbookErrorState() {
  const router = useRouter();
  const t = useTranslations("adminEbooks.states");

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
      <p className="text-base font-bold text-danger-text">{t("loadFailedTitle")}</p>
      <p className="mt-1.5 max-w-sm text-sm text-text-body">{t("loadFailedBody")}</p>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="focus-field mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-contrast shadow-sm transition-colors duration-150 hover:bg-brand-hover"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {t("retry")}
      </button>
    </div>
  );
}
