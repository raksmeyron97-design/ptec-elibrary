"use client";

// components/ui/core/ErrorRecovery.tsx
// The one error state for the public site: what went wrong in words a reader
// can act on, and three ways out — try again, search, go home.
//
// Every public error.tsx renders this. Before it there were fourteen private
// copies, and eleven of them drew a "Try again" button with NO onClick at all:
// the one recovery action on the page did nothing. Thirteen were English-only,
// and one printed the raw error message to the reader.
//
// It calls `retry`, not `reset`. In Next 16.3 `reset()` only clears the
// boundary and re-renders the SAME failed server payload; `retry()` refreshes
// the route first (node_modules/next/dist/docs/.../error.md). Every public page
// is server-rendered, so for them `reset` was a second way for "Try again" to
// do nothing. Pinned by lib/error-boundaries.test.ts.

import { useEffect, useId, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, House, RotateCw, Search } from "lucide-react";
import { Link } from "@/i18n/navigation";

/** What Next hands an error.tsx; `retry` is stable from 16.3. */
export type ErrorBoundaryProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function ErrorRecovery({
  error,
  retry,
  subject = "page",
  logLabel,
}: ErrorBoundaryProps & {
  /** Names what failed to load, in the heading. */
  subject?: "page" | "book" | "publication";
  /** Route label for the console — diagnostics only, never shown. */
  logLabel: string;
}) {
  const t = useTranslations("errors");
  const headingId = useId();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    // Logged for diagnostics; the reader is never shown the message — in
    // production React has already replaced it with a generic one anyway.
    console.error(`[${logLabel} error]`, error);
  }, [error, logLabel]);

  const title = subject === "book" ? t("bookTitle") : subject === "publication" ? t("publicationTitle") : t("title");

  return (
    <section
      role="alert"
      aria-labelledby={headingId}
      className="flex min-h-[55vh] items-center justify-center px-5 py-16"
    >
      <div className="w-full max-w-md text-center">
        <div
          aria-hidden="true"
          className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-danger-line bg-danger-soft text-danger-text"
        >
          <AlertTriangle className="h-8 w-8" strokeWidth={1.8} />
        </div>
        <h1 id={headingId} className="text-[20px] font-bold leading-snug text-text-heading sm:text-[22px]">
          {title}
        </h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-text-body">{t("body")}</p>

        <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => startTransition(() => retry())}
            disabled={pending}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-[15px] font-semibold text-brand-contrast transition-colors hover:bg-brand-hover disabled:cursor-wait disabled:opacity-75"
          >
            <RotateCw className={`h-4 w-4 ${pending ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
            {pending ? t("retrying") : t("retry")}
          </button>
          <Link
            href="/search"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-divider bg-bg-surface px-5 text-[15px] font-semibold text-text-heading transition-colors hover:border-brand/40 hover:text-brand"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            {t("search")}
          </Link>
        </div>
        <Link
          href="/"
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-[14px] font-semibold text-brand underline-offset-4 hover:underline"
        >
          <House className="h-4 w-4" aria-hidden="true" />
          {t("home")}
        </Link>
      </div>
    </section>
  );
}
