"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BookPlus, EyeOff, Loader2 } from "lucide-react";
import { actOnSearchTerm } from "@/app/actions/search-insights";
import { ebookUploadUrl } from "@/lib/admin/ebooks-url";

export type OpportunityItem = {
  kind: "zeroResult" | "lowCoverage";
  term: string;
  count: number;
};

/**
 * Collection-opportunity rows with their fixes attached: "Add book" opens the
 * existing upload flow pre-filled with the searched term, "Dismiss" records
 * an `ignored` search_term_action (same governance trail as
 * /admin/search-insights) and drops the row. Dismissal is reversible there —
 * nothing is deleted from raw analytics.
 */
export default function OpportunityList({ items: initial }: { items: OpportunityItem[] }) {
  const t = useTranslations("adminDashboard.searchAi");
  const [items, setItems] = useState(initial);
  const [busyTerm, setBusyTerm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const dismiss = (term: string) => {
    setBusyTerm(term);
    setError(null);
    startTransition(async () => {
      try {
        const res = await actOnSearchTerm(term, "ignored", "dismissed from dashboard");
        if ("error" in res) {
          setError(res.error);
        } else {
          setItems((prev) => prev.filter((i) => i.term !== term));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("dismissFailed"));
      } finally {
        setBusyTerm(null);
      }
    });
  };

  if (items.length === 0) {
    return (
      <p className="mt-3 rounded-xl bg-white/60 px-3 py-5 text-center text-xs text-text-muted">
        {t("noOpportunities")}
      </p>
    );
  }

  const actionBtn =
    "flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-[var(--dash-well)] hover:text-text-heading [--focus-ring-offset:1px] disabled:opacity-40";

  return (
    <>
      <ul className="mt-2.5 space-y-1.5">
        {items.map((o) => (
          <li key={`${o.kind}-${o.term}`} className="dash-insight flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="dash-status--warn dash-chip shrink-0 text-xs font-bold">
              {t(`opportunityKind.${o.kind}`)}
            </span>
            <span className="min-w-0 flex-1 dash-truncate text-xs font-medium text-text-body" title={o.term} dir="auto">
              {o.term}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-text-muted">
              {t("searchedTimes", { count: o.count })}
            </span>
            <span className="flex shrink-0 items-center gap-0.5">
              <Link
                href={ebookUploadUrl(o.term)}
                aria-label={t("addBookFor", { term: o.term })}
                title={t("addBookFor", { term: o.term })}
                className={actionBtn}
              >
                <BookPlus className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <button
                type="button"
                disabled={busyTerm !== null}
                onClick={() => dismiss(o.term)}
                aria-label={t("dismissTerm", { term: o.term })}
                title={t("dismissTerm", { term: o.term })}
                className={actionBtn}
              >
                {busyTerm === o.term ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-[var(--ptec-danger)]">
          {error}
        </p>
      )}
    </>
  );
}
