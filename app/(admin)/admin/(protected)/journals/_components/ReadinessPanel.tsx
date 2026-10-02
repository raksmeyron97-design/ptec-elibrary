"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import type { JournalReadiness } from "@/lib/journals/readiness";

/**
 * What the public journal page will show, recomputed from the form as the
 * librarian types (lib/journals/readiness.ts — the list's completeness column
 * reads the same function). A missing fact is hidden on the public page, so
 * this is the only place its absence is visible.
 */
export default function ReadinessPanel({ readiness }: { readiness: JournalReadiness }) {
  const t = useTranslations("adminJournals");
  return (
    <section aria-labelledby="journal-readiness" className="rounded-2xl border border-divider bg-bg-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="journal-readiness" className="text-base font-semibold text-text-heading">
          {t("readinessHeading")}
        </h2>
        <span className="text-sm font-semibold tabular-nums text-text-body">{t("readinessScore", { score: readiness.score })}</span>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={readiness.score}
        aria-label={t("colCompleteness")}
      >
        <div className="h-full rounded-full bg-brand" style={{ width: `${readiness.score}%` }} />
      </div>
      <p className="mt-3 text-xs leading-5 text-text-muted">{t("readinessIntro")}</p>

      <ul className="mt-4 space-y-2 text-sm">
        {readiness.checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2">
            {c.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            )}
            <span className={c.ok ? "text-text-body" : "text-text-muted"}>
              {t(`check.${c.id}`)}
              <span className="sr-only"> — {c.ok ? t("readinessDone") : t("readinessMissing")}</span>
            </span>
          </li>
        ))}
      </ul>

      {readiness.invalidIssns.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {readiness.invalidIssns.map((issn) => (
            <li key={issn} className="flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-xs text-warning-text">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t("invalidIssn", { issn })}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 border-t border-divider pt-3 text-xs leading-5 text-text-body">{t(`indexingState.${readiness.indexing}`)}</p>
    </section>
  );
}
