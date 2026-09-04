"use client";

// components/admin/ResourceCountAudit.tsx
//
// "Are the numbers on the public site true?" — the reconciliation panel for
// the admin Data Quality screen.
//
// Three things it reports, and one thing it deliberately cannot do:
//
//  * The canonical public figures, recomputed from the database, next to what
//    the public cache is currently serving. A difference is cache staleness,
//    not data loss.
//  * Per-type status breakdown. Every bucket is labelled; "All records" is
//    never presented as a resource count.
//  * Search-index coverage: published rows vs rows carrying a pgvector
//    embedding. There is no separate search-document table in this schema
//    (the embedding is a column on the resource row), so duplicate and
//    orphaned documents cannot exist — a missing embedding is the only drift.
//  * Full-text index coverage: published rows vs rows whose PDF pages were
//    actually extracted (migration 0133). This is a SEPARATE question from
//    the embedding above and is reported separately on purpose — production
//    once scored 3/120 on embeddings while scoring 0/120 here, and only the
//    second number explains why searching for a phrase inside a book returned
//    nothing and no AI answer could cite a page. `failed` and
//    `never attempted` are never merged into a single "not indexed" figure:
//    one is a bug on our side, the other is work not yet run, and the whole
//    defect was that they looked identical.
//
//  * It CANNOT set a counter. "Recalculate and verify" drops the stats cache
//    and recounts from canonical rows; there is no stored total to overwrite.

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RefreshCw, CheckCircle2, AlertTriangle, Search, FileSearch, Copy } from "lucide-react";
import { recalculateResourceStats } from "@/app/actions/data-quality";
import type { AdminTypeStats } from "@/lib/admin/resource-stats";
import type { ResourceStatsReconciliation } from "@/lib/admin/resource-stats";

type Props = {
  initial: { reconciliation: ResourceStatsReconciliation; byType: AdminTypeStats[] };
};

/** The public figures, in the order they are shown. */
const FIGURE_KEYS = ["digital", "books", "theses", "publications", "catalog", "paths"] as const;

const STATUS_COLUMNS = ["published", "draft", "inReview", "scheduled", "archived", "all"] as const;

export default function ResourceCountAudit({ initial }: Props) {
  const t = useTranslations("adminDataQuality.reconcile");
  const locale = useLocale();
  // One formatter per render pass, not one per figure: constructing an Intl
  // formatter is expensive and this panel prints a few dozen numbers. It has
  // to follow the admin's locale — Khmer digits are what the rest of this
  // panel's text is now written in.
  const numberFormat = new Intl.NumberFormat(locale);
  const fmt = (value: number) => numberFormat.format(value);
  // Seeded from the server render, then replaced by "Recalculate and verify".
  // The page keys this component on `initial.reconciliation.checkedAt`, so a
  // fresh server fetch remounts it — this state cannot go stale behind a
  // newer prop.
  const [data, setData] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { reconciliation: rec, byType } = data;
  const actual = rec.actual;

  function recalculate() {
    setError(null);
    startTransition(async () => {
      try {
        setData(await recalculateResourceStats());
      } catch (e) {
        setError(e instanceof Error ? e.message : t("recalculateFailed"));
      }
    });
  }

  const searchGap =
    rec.searchIndex?.reduce((sum, r) => sum + r.missingEmbedding, 0) ?? null;

  return (
    <section
      aria-labelledby="resource-count-audit-heading"
      className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="resource-count-audit-heading" className="text-[15px] font-bold text-text-heading">
            {t("title")}
          </h2>
          <p className="mt-1 max-w-[68ch] text-[12.5px] text-text-muted">{t("description")}</p>
        </div>
        <button
          type="button"
          onClick={recalculate}
          disabled={pending}
          className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-divider bg-paper px-3.5 text-[12.5px] font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
          {pending ? t("recalculating") : t("recalculate")}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-[12.5px] text-danger-text">
          {error}
        </p>
      )}

      {/* ── Cache vs database ── */}
      <div className="mt-4">
        {actual === null ? (
          <p className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-[12.5px] text-warning-text">
            {t("viewUnavailable")}
          </p>
        ) : rec.drift.length === 0 ? (
          <p className="inline-flex items-center gap-2 rounded-lg border border-success-line bg-success-soft px-3 py-2 text-[12.5px] font-semibold text-success-text">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            {t("cacheMatches")}
          </p>
        ) : (
          <div className="rounded-lg border border-warning-line bg-warning-soft px-3 py-2.5">
            <p className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-warning-text">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {t("driftCount", { count: rec.drift.length })}
            </p>
            <ul className="mt-1.5 space-y-0.5 text-[12px] text-warning-text">
              {rec.drift.map((d) => (
                <li key={d.metric} className="tabular-nums">
                  {t("driftRow", { metric: d.metric, cached: fmt(d.cached), actual: fmt(d.actual) })}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11.5px] text-warning-text">{t("driftHint")}</p>
          </div>
        )}
      </div>

      {/* ── Canonical public figures ── */}
      {actual && (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {FIGURE_KEYS.map((key) => {
            const value = {
              digital: actual.totalDigitalResources,
              books: actual.books,
              theses: actual.theses,
              publications: actual.publications,
              catalog: actual.physicalCatalogs,
              paths: actual.learningPaths,
            }[key];
            return (
              <div key={key} className="rounded-xl border border-divider bg-paper p-3">
                <dd className="text-[22px] font-bold leading-none tabular-nums text-text-heading">
                  {fmt(value)}
                </dd>
                <dt className="mt-1 text-[11px] text-text-muted">{t(`figures.${key}`)}</dt>
              </div>
            );
          })}
        </dl>
      )}

      {/* ── Status breakdown (admin only) ── */}
      <div className="mt-6 overflow-x-auto">
        <h3 className="text-[12.5px] font-bold text-text-heading">{t("status.title")}</h3>
        <p className="mt-0.5 text-[11.5px] text-text-muted">{t("status.hint")}</p>
        <table className="mt-2 w-full min-w-[560px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-divider text-left text-[11px] uppercase tracking-[0.08em] text-text-muted">
              <th scope="col" className="py-2 pr-3 font-bold">{t("status.type")}</th>
              {STATUS_COLUMNS.map((column) => (
                <th key={column} scope="col" className="py-2 pr-3 text-right font-bold last:pr-0">
                  {t(`status.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byType.map((row) => (
              <tr key={row.type} className="border-b border-divider/60">
                <th scope="row" className="py-2 pr-3 text-left font-semibold text-text-body">
                  {t(`type.${row.type}`)}
                </th>
                <td className="py-2 pr-3 text-right font-semibold tabular-nums text-text-heading">{fmt(row.published)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-text-muted">{fmt(row.draft)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-text-muted">{fmt(row.pendingReview)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-text-muted">{fmt(row.scheduled)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-text-muted">{fmt(row.archived)}</td>
                <td className="py-2 text-right tabular-nums text-text-muted">{fmt(row.all)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Search index reconciliation ── */}
      <div className="mt-6">
        <h3 className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-text-heading">
          <Search className="h-3.5 w-3.5" aria-hidden />
          {t("search.title")}
        </h3>
        {rec.searchIndex === null ? (
          <p className="mt-1 text-[12px] text-text-muted">{t("search.unavailable")}</p>
        ) : (
          <>
            <p className="mt-0.5 text-[11.5px] text-text-muted">
              {t.rich("search.hint", {
                command: () => (
                  <code className="rounded bg-paper px-1">npx tsx scripts/embed-library.ts</code>
                ),
              })}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {rec.searchIndex.map((r) => (
                <li
                  key={r.resourceType}
                  className={`rounded-lg border px-3 py-1.5 text-[12px] tabular-nums ${
                    r.missingEmbedding > 0
                      ? "border-warning-line bg-warning-soft text-warning-text"
                      : "border-divider bg-paper text-text-muted"
                  }`}
                >
                  {t("search.chip", {
                    type: t.has(`type.${r.resourceType}`) ? t(`type.${r.resourceType}`) : r.resourceType,
                    embedded: fmt(r.embedded),
                    published: fmt(r.published),
                  })}
                  {r.missingEmbedding > 0 && <> · {t("search.chipMissing", { count: fmt(r.missingEmbedding) })}</>}
                </li>
              ))}
            </ul>
            {actual && searchGap !== null && (
              <p className="mt-2 text-[11.5px] text-text-muted">
                {t("search.searchable", {
                  searchable: fmt(actual.searchableResources),
                  total: fmt(actual.totalDigitalResources),
                })}
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Full-text index reconciliation (migration 0133) ── */}
      <div className="mt-6">
        <h3 className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-text-heading">
          <FileSearch className="h-3.5 w-3.5" aria-hidden />
          {t("fullText.title")}
        </h3>
        {rec.fullTextIndex === null ? (
          <p className="mt-1 text-[12px] text-text-muted">{t("fullText.unavailable")}</p>
        ) : (
          <>
            <p className="mt-0.5 max-w-[78ch] text-[11.5px] text-text-muted">
              {t.rich("fullText.hint", {
                command: () => (
                  <code className="rounded bg-paper px-1">npx tsx scripts/extract-pdf-text.ts</code>
                ),
              })}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {rec.fullTextIndex.map((r) => {
                /* A record we never tried, and one we tried and crashed on,
                   both need a human — so both colour the chip. A scan does
                   not: it is a true fact about the document. */
                /* Stale is included because it is the one state that is
                   actively WRONG rather than merely absent — search can quote
                   text the current PDF no longer contains. A no_text_layer
                   count still does not colour the chip: that is a true fact
                   about the documents, not a defect. */
                const needsAction =
                  r.failed > 0 || r.neverAttempted > 0 || r.unfetchable > 0 || r.stale > 0;
                return (
                  <li
                    key={r.resourceType}
                    className={`rounded-lg border px-3 py-1.5 text-[12px] tabular-nums ${
                      needsAction
                        ? "border-warning-line bg-warning-soft text-warning-text"
                        : "border-divider bg-paper text-text-muted"
                    }`}
                  >
                    {t("fullText.chip", {
                      type: t.has(`type.${r.resourceType}`) ? t(`type.${r.resourceType}`) : r.resourceType,
                      indexed: fmt(r.indexed),
                      published: fmt(r.published),
                    })}
                    {r.indexed > 0 && (
                      <> · {t("fullText.chipPages", { pages: fmt(r.totalPages), chunks: fmt(r.totalChunks) })}</>
                    )}
                    {r.stale > 0 && <> · {t("fullText.chipStale", { count: fmt(r.stale) })}</>}
                    {r.running > 0 && <> · {t("fullText.chipRunning", { count: fmt(r.running) })}</>}
                    {r.neverAttempted > 0 && <> · {t("fullText.chipNever", { count: fmt(r.neverAttempted) })}</>}
                    {r.failed > 0 && <> · {t("fullText.chipFailed", { count: fmt(r.failed) })}</>}
                    {r.unfetchable > 0 && <> · {t("fullText.chipUnfetchable", { count: fmt(r.unfetchable) })}</>}
                    {r.failedConfig > 0 && <> · {t("fullText.chipConfig", { count: fmt(r.failedConfig) })}</>}
                    {r.noTextLayer > 0 && <> · {t("fullText.chipScanned", { count: fmt(r.noTextLayer) })}</>}
                  </li>
                );
              })}
            </ul>
            {rec.fullTextIndex.some((r) => r.failed > 0) && (
              <p className="mt-2 max-w-[78ch] text-[11.5px] text-warning-text">{t("fullText.failedHint")}</p>
            )}
            {rec.fullTextIndex.some((r) => r.neverAttempted > 0) && (
              <p className="mt-1 max-w-[78ch] text-[11.5px] text-text-muted">{t("fullText.neverHint")}</p>
            )}
            {rec.fullTextIndex.some((r) => r.stale > 0) && (
              <p className="mt-1 max-w-[78ch] text-[11.5px] text-warning-text">{t("fullText.staleHint")}</p>
            )}
            {rec.fullTextIndex.some((r) => r.failedConfig > 0) && (
              <p className="mt-1 max-w-[78ch] text-[11.5px] text-text-muted">{t("fullText.configHint")}</p>
            )}
            {rec.fullTextIndex.some((r) => r.failedPermanent > 0) && (
              <p className="mt-1 max-w-[78ch] text-[11.5px] text-text-muted">
                {t("fullText.permanentHint", {
                  count: fmt(rec.fullTextIndex.reduce((n, r) => n + r.failedPermanent, 0)),
                })}
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Possible duplicates ── */}
      {rec.possibleDuplicates.length > 0 && (
        <div className="mt-6">
          <h3 className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-text-heading">
            <Copy className="h-3.5 w-3.5" aria-hidden />
            {t("duplicates.title", { count: rec.possibleDuplicates.length })}
          </h3>
          <p className="mt-0.5 max-w-[68ch] text-[11.5px] text-text-muted">{t("duplicates.hint")}</p>
          <ul className="mt-2 space-y-1 text-[12px] text-text-muted">
            {rec.possibleDuplicates.slice(0, 10).map((d) => (
              <li key={`${d.type}:${d.title}`}>
                <span className="font-semibold text-text-body" dir="auto">{d.title}</span>
                {" — "}
                {t("duplicates.row", {
                  count: d.count,
                  type: t.has(`type.${d.type}`) ? t(`type.${d.type}`) : d.type,
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-5 text-[11px] text-text-muted">
        {t("lastReconciled", {
          time: new Date(rec.checkedAt).toLocaleString("en-GB", { timeZone: "UTC" }),
        })}
      </p>
    </section>
  );
}
