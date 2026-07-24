import { getTranslations } from "next-intl/server";
import { CheckCircle2, AlertTriangle, Database } from "lucide-react";
import type { CanonicalBackfillReconciliation } from "@/lib/admin/canonical-backfill";

// Read-only integrity panel for the canonical-model backfills (migrations
// 0104–0109). Shows, per domain, the legacy source count vs the canonical count
// the backfill produced; a nonzero gap is drift for a librarian to investigate.
// Server component — no interactivity, so no client bundle. Before the
// migrations are applied the view is absent and `rows` is empty, which we render
// as an "apply migration" hint rather than a false "healthy".

// Domain slugs come straight from the DB view; map to friendly labels.
const DOMAIN_LABELS: Record<string, string> = {
  book_authors: "Book authors",
  publication_authorships: "Publication authors",
  thesis_with_authors: "Thesis authors",
  book_files: "Book files",
  publication_files: "Publication files",
  thesis_pdf: "Thesis PDFs",
  book_categories: "Book subjects",
  publications_with_refs: "Publication references",
};

export default async function CanonicalBackfillAudit({
  data,
}: {
  data: CanonicalBackfillReconciliation;
}) {
  const t = await getTranslations("adminDataQuality");
  const available = data.rows.length > 0;
  const drifting = data.rows.filter((r) => r.gap !== 0);
  const healthy = available && drifting.length === 0;

  return (
    <section
      aria-labelledby="canonical-backfill-title"
      className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider p-5">
        <div className="flex items-start gap-2.5">
          <Database className="mt-0.5 h-4 w-4 text-brand" aria-hidden="true" />
          <div>
            <h2 id="canonical-backfill-title" className="text-[15px] font-bold text-text-heading">
              {t("backfill.title")}
            </h2>
            <p className="mt-1 text-[12px] text-text-muted">{t("backfill.subtitle")}</p>
          </div>
        </div>
        {available && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
              healthy
                ? "border-success/25 bg-success/5 text-success"
                : "border-danger/25 bg-danger/5 text-danger"
            }`}
          >
            {healthy ? (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {healthy ? t("backfill.healthy") : t("backfill.drift", { count: drifting.length })}
          </span>
        )}
      </div>

      {!available ? (
        <p className="m-5 rounded-xl bg-paper px-3 py-2.5 text-[12px] leading-5 text-text-muted">
          {t("backfill.unavailable")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-divider text-left text-[11px] font-bold uppercase tracking-wider text-text-muted">
                <th scope="col" className="px-5 py-2.5 font-bold">{t("backfill.colDomain")}</th>
                <th scope="col" className="px-5 py-2.5 text-right font-bold">{t("backfill.colLegacy")}</th>
                <th scope="col" className="px-5 py-2.5 text-right font-bold">{t("backfill.colCanonical")}</th>
                <th scope="col" className="px-5 py-2.5 text-right font-bold">{t("backfill.colGap")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {data.rows.map((row) => (
                <tr key={row.domain} className={row.gap !== 0 ? "bg-danger/5" : undefined}>
                  <th scope="row" className="px-5 py-2.5 text-left font-semibold text-text-heading">
                    {DOMAIN_LABELS[row.domain] ?? row.domain}
                  </th>
                  <td className="px-5 py-2.5 text-right tabular-nums text-text-body">{row.legacyCount}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-text-body">{row.canonicalCount}</td>
                  <td
                    className={`px-5 py-2.5 text-right font-semibold tabular-nums ${
                      row.gap === 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {row.gap === 0 ? "0" : `+${row.gap}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-divider bg-paper/60 px-5 py-3 text-[11.5px] text-text-muted">
            {t("backfill.footnote")}
          </p>
        </div>
      )}
    </section>
  );
}
