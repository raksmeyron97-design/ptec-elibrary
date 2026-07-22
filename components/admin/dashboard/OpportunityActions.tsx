"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BookPlus, Check, EyeOff, Loader2 } from "lucide-react";
import { actOnSearchTerm } from "@/app/actions/search-insights";
import type { SearchOpportunity } from "@/lib/admin/dashboard-shared";

/**
 * The fixes for one search opportunity, attached to the evidence that
 * justifies them: "Add resource" opens the upload flow pre-filled with the
 * term; "Dismiss" records an `ignored` search_term_action — the same
 * governance trail /admin/search-insights writes, reversible there, and never
 * a deletion from raw analytics.
 *
 * Server actions re-check permissions; failures surface inline with the
 * server's own message rather than silently dropping the row.
 */
export default function OpportunityActions({
  term,
  kind,
}: {
  term: string;
  kind: SearchOpportunity["kind"];
}) {
  const t = useTranslations("adminDashboard.opportunities");
  const [state, setState] = useState<"idle" | "busy" | "dismissed">("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const dismiss = () => {
    setState("busy");
    setError(null);
    startTransition(async () => {
      try {
        const res = await actOnSearchTerm(term, "ignored", "dismissed from dashboard");
        if ("error" in res) {
          setError(res.error);
          setState("idle");
        } else {
          setState("dismissed");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("dismissFailed"));
        setState("idle");
      }
    });
  };

  if (state === "dismissed") {
    return (
      <p role="status" className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        {t("dismissed")}
      </p>
    );
  }

  const btn =
    "flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2 text-[11.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:opacity-50";

  return (
    <div className="flex items-center gap-1">
      {error && (
        <span role="alert" className="text-[10.5px] font-medium text-rose-700">
          {error}
        </span>
      )}
      <Link
        href={`/admin/upload?title=${encodeURIComponent(term)}`}
        className={`${btn} border border-brand/25 bg-brand/5 text-brand hover:bg-brand/10`}
      >
        <BookPlus className="h-3.5 w-3.5" aria-hidden="true" />
        {kind === "lowClickThrough" ? t("action.review") : t("action.add")}
        <span className="sr-only">{term}</span>
      </Link>
      <button
        type="button"
        disabled={state === "busy"}
        onClick={dismiss}
        className={`${btn} text-text-muted hover:bg-paper hover:text-text-heading`}
      >
        {state === "busy" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {t("action.dismiss")}
        <span className="sr-only">{term}</span>
      </button>
    </div>
  );
}
