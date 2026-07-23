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
//
//  * It CANNOT set a counter. "Recalculate and verify" drops the stats cache
//    and recounts from canonical rows; there is no stored total to overwrite.

import { useState, useTransition } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle, Search, Copy } from "lucide-react";
import { recalculateResourceStats } from "@/app/actions/data-quality";
import type { AdminTypeStats } from "@/lib/admin/resource-stats";
import type { ResourceStatsReconciliation } from "@/lib/admin/resource-stats";

type Props = {
  initial: { reconciliation: ResourceStatsReconciliation; byType: AdminTypeStats[] };
};

const TYPE_LABEL: Record<AdminTypeStats["type"], string> = {
  book: "E-books",
  thesis: "Theses",
  publication: "Publications",
  learning_path: "Learning paths",
  physical_catalog: "Physical catalog",
};

const SEARCH_TYPE_LABEL: Record<string, string> = {
  book: "E-books",
  thesis: "Theses",
  publication: "Publications",
  physical_catalog: "Physical catalog",
};

// Built once at module scope — constructing an Intl formatter is expensive
// and this renders a few dozen figures per pass.
const NUMBER_FORMAT = new Intl.NumberFormat("en");

function fmt(n: number) {
  return NUMBER_FORMAT.format(n);
}

export default function ResourceCountAudit({ initial }: Props) {
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
        setError(e instanceof Error ? e.message : "Recalculation failed");
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
            Resource count reconciliation
          </h2>
          <p className="mt-1 max-w-[68ch] text-[12.5px] text-text-muted">
            Public totals are recalculated from canonical records — never stored
            and never edited by hand. &ldquo;Digital resources&rdquo; is published
            e-books + theses + publications; the physical catalog and learning
            paths are counted separately and are not part of that total.
          </p>
        </div>
        <button
          type="button"
          onClick={recalculate}
          disabled={pending}
          className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-divider bg-paper px-3.5 text-[12.5px] font-semibold text-text-body transition-colors hover:border-brand/40 hover:text-brand disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
          {pending ? "Recalculating…" : "Recalculate and verify"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-700">
          {error}
        </p>
      )}

      {/* ── Cache vs database ── */}
      <div className="mt-4">
        {actual === null ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
            The canonical statistics view could not be read. Public surfaces are
            omitting their resource figures rather than showing a wrong one.
          </p>
        ) : rec.drift.length === 0 ? (
          <p className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Cache matches the database on every metric.
          </p>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <p className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-amber-800">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {rec.drift.length} metric{rec.drift.length === 1 ? "" : "s"} differ from the cached value
            </p>
            <ul className="mt-1.5 space-y-0.5 text-[12px] text-amber-900">
              {rec.drift.map((d) => (
                <li key={d.metric} className="tabular-nums">
                  {d.metric}: cache {fmt(d.cached)} → database {fmt(d.actual)}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11.5px] text-amber-800">
              Use &ldquo;Recalculate and verify&rdquo; to drop the cache; the next
              public render will recount.
            </p>
          </div>
        )}
      </div>

      {/* ── Canonical public figures ── */}
      {actual && (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              ["Digital resources", actual.totalDigitalResources],
              ["E-books", actual.books],
              ["Theses", actual.theses],
              ["Publications", actual.publications],
              ["Physical catalog", actual.physicalCatalogs],
              ["Learning paths", actual.learningPaths],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-divider bg-paper p-3">
              <dd className="text-[22px] font-bold leading-none tabular-nums text-text-heading">
                {fmt(value)}
              </dd>
              <dt className="mt-1 text-[11px] text-text-muted">{label}</dt>
            </div>
          ))}
        </dl>
      )}

      {/* ── Status breakdown (admin only) ── */}
      <div className="mt-6 overflow-x-auto">
        <h3 className="text-[12.5px] font-bold text-text-heading">By status</h3>
        <p className="mt-0.5 text-[11.5px] text-text-muted">
          Admin view. Only the &ldquo;Published&rdquo; column is a public figure.
        </p>
        <table className="mt-2 w-full min-w-[560px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-divider text-left text-[11px] uppercase tracking-[0.08em] text-text-muted">
              <th scope="col" className="py-2 pr-3 font-bold">Type</th>
              <th scope="col" className="py-2 pr-3 text-right font-bold">Published</th>
              <th scope="col" className="py-2 pr-3 text-right font-bold">Draft</th>
              <th scope="col" className="py-2 pr-3 text-right font-bold">In review</th>
              <th scope="col" className="py-2 pr-3 text-right font-bold">Scheduled</th>
              <th scope="col" className="py-2 pr-3 text-right font-bold">Archived</th>
              <th scope="col" className="py-2 text-right font-bold">All records</th>
            </tr>
          </thead>
          <tbody>
            {byType.map((row) => (
              <tr key={row.type} className="border-b border-divider/60">
                <th scope="row" className="py-2 pr-3 text-left font-semibold text-text-body">
                  {TYPE_LABEL[row.type]}
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
          Search index
        </h3>
        {rec.searchIndex === null ? (
          <p className="mt-1 text-[12px] text-text-muted">
            Search-health view unavailable (migration 0103 not applied yet).
          </p>
        ) : (
          <>
            <p className="mt-0.5 text-[11.5px] text-text-muted">
              Published records carrying a semantic-search embedding. Records
              without one are still reachable through keyword search; run{" "}
              <code className="rounded bg-paper px-1">npx tsx scripts/embed-library.ts</code>{" "}
              to close the gap.
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {rec.searchIndex.map((r) => (
                <li
                  key={r.resourceType}
                  className={`rounded-lg border px-3 py-1.5 text-[12px] tabular-nums ${
                    r.missingEmbedding > 0
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-divider bg-paper text-text-muted"
                  }`}
                >
                  {SEARCH_TYPE_LABEL[r.resourceType] ?? r.resourceType}: {fmt(r.embedded)} / {fmt(r.published)} indexed
                  {r.missingEmbedding > 0 && <> · {fmt(r.missingEmbedding)} missing</>}
                </li>
              ))}
            </ul>
            {actual && searchGap !== null && (
              <p className="mt-2 text-[11.5px] text-text-muted">
                Searchable digital resources: {fmt(actual.searchableResources)} of{" "}
                {fmt(actual.totalDigitalResources)}. This is reported separately and
                is never shown publicly as the resource total.
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
            Possible duplicate records ({rec.possibleDuplicates.length})
          </h3>
          <p className="mt-0.5 max-w-[68ch] text-[11.5px] text-text-muted">
            Published records sharing a title within the same type. They are each
            counted once (counts are per row, with no joins), so these do not
            inflate any total — but two editions of the same work may be worth
            merging or distinguishing.
          </p>
          <ul className="mt-2 space-y-1 text-[12px] text-text-muted">
            {rec.possibleDuplicates.slice(0, 10).map((d) => (
              <li key={`${d.type}:${d.title}`}>
                <span className="font-semibold text-text-body">{d.title}</span> — {d.count} records ({d.type})
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-5 text-[11px] text-text-muted">
        Last reconciled {new Date(rec.checkedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC
      </p>
    </section>
  );
}
