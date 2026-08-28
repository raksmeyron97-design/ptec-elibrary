"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";

/**
 * Re-runs detection against the current catalog.
 *
 * The queue is a live view over the books table, and two administrators can be
 * working it at once — a record retired in another tab is still on screen here
 * until something re-fetches. The page is force-dynamic, so `router.refresh()`
 * is the whole mechanism.
 */
export default function RefreshButton() {
  const t = useTranslations("adminDuplicates");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className="focus-field inline-flex items-center gap-2 rounded-lg border border-divider bg-bg-surface px-3 py-2 text-[13px] font-semibold text-text-body transition hover:border-brand hover:text-brand disabled:opacity-60"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} aria-hidden="true" />
      {pending ? t("refreshing") : t("refresh")}
    </button>
  );
}
