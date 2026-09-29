import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { BackfillCoverage as Coverage } from "@/lib/admin/theses-shared";

/** The worklist this card counts: its rows are exactly the ones not complete. */
const WORKLIST = "/admin/theses?backfill=any&sort=most-viewed&status=published";

/**
 * How far the Khmer-and-contents backfill has come over the most-viewed
 * published theses (lib/admin/theses-shared.ts `summarizeBackfill`), with the
 * worklist one click away. It counts with the worklist filter's own rules, so
 * "23 still need…" is the number of rows that link opens onto.
 *
 * Nothing renders when the count could not be read (before migration 0160,
 * or on a failed query): "0 of 50" would read as a fact about the collection.
 */
export default function BackfillCoverage({ coverage }: { coverage: Coverage | null }) {
  const t = useTranslations("adminTheses.backfillCoverage");
  if (!coverage || coverage.considered === 0) return null;

  const remaining = coverage.considered - coverage.complete;
  const fields = [
    { key: "titleKm", done: coverage.titleKm, total: coverage.khmerApplicable },
    { key: "abstractKm", done: coverage.abstractKm, total: coverage.khmerApplicable },
    { key: "contents", done: coverage.contents, total: coverage.considered },
  ] as const;

  return (
    <section
      aria-labelledby="backfill-coverage-heading"
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border border-divider bg-bg-surface px-4 py-3 sm:px-5"
    >
      <div className="min-w-0">
        <h2 id="backfill-coverage-heading" className="text-sm font-semibold text-text-heading">
          {t("heading", { count: coverage.considered })}
        </h2>
        <p className="mt-0.5 text-xs text-text-muted">
          {remaining === 0 ? t("allDone") : t("remaining", { count: remaining })}
        </p>
        {/* Said only when it changes a denominator on this card. */}
        {coverage.khmerApplicable < coverage.considered && (
          <p className="mt-0.5 text-xs text-text-muted">{t("khmerNote")}</p>
        )}
      </div>

      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        {fields.map((f) => (
          <div key={f.key} className="min-w-0">
            <dt className="text-xs text-text-muted">{t(f.key)}</dt>
            <dd className="text-sm font-semibold tabular-nums text-text-heading">
              {t("ratio", { done: f.done, total: f.total })}
            </dd>
          </div>
        ))}
      </dl>

      {remaining > 0 && (
        <Link
          href={WORKLIST}
          className="inline-flex items-center gap-1.5 rounded-lg border border-divider px-3 py-1.5 text-xs font-semibold text-text-body transition-colors hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        >
          {t("open")}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </section>
  );
}
