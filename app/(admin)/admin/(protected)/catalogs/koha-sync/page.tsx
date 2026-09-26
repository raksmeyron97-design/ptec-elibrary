// app/admin/catalogs/koha-sync/page.tsx
//
// Koha Phase 2: the Physical Library as a read-only projection of Koha.
// Shows whether the integration can reach Koha, what the last run did (or,
// for a preview, would do), and every exception a librarian must look at.
// Starting a run happens in KohaSyncPanel (catalog: write).

import Link from "next/link";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import { PageHeader, StatusBadge, EmptyState } from "@/components/admin/kit";
import { getKohaConfig } from "@/lib/koha";
import { kohaCanRead } from "@/lib/koha/config";
import { isFreshFullPreview, isRunning, readKohaSyncState } from "@/lib/koha/sync-server";
import KohaSyncPanel from "./_components/KohaSyncPanel";

export const dynamic = "force-dynamic";

const EXCEPTION_LABEL: Record<string, string> = {
  record_not_in_koha: "Record not in Koha",
  copy_not_in_koha: "Copy not in Koha",
  record_emptied: "All copies are under other Koha records",
  regrouped: "Copies moved to follow Koha",
  barcode_conflict: "Barcode conflict",
  missing_biblio: "Koha record unreadable",
};

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Phnom_Penh", dateStyle: "medium", timeStyle: "short" }) : "—";

export default async function KohaSyncPage() {
  await requireRouteAccess("catalog.koha-sync");

  const config = getKohaConfig();
  const configured = kohaCanRead(config);
  const host = (() => { try { return config.baseUrl ? new URL(config.baseUrl).host : null; } catch { return null; } })();
  const stateOrMissing = await readKohaSyncState();
  const missingTable = stateOrMissing === "missing_table";
  const state = missingTable ? null : stateOrMissing;
  const running = isRunning(state);
  const summary = state?.last_summary ?? {};
  const counts = summary.counts ?? {};
  const previewReady = isFreshFullPreview(state);
  const exceptions = summary.exceptions ?? [];

  return (
    <div className="w-full max-w-5xl space-y-6">
      <PageHeader
        breadcrumb={<Link href="/admin/catalogs" className="hover:underline">Physical Library</Link>}
        title="Koha sync"
        description="The Physical Library is a read-only copy of Koha: records, copies and availability come from Koha. Nothing here writes to Koha."
        actions={!missingTable && (
          <KohaSyncPanel state={{ configured: configured && !missingTable, running, initialized: !!state?.initialized_at, previewReady, counts }} />
        )}
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-divider bg-bg-surface p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Connection</h2>
          <p className="mt-1 text-sm text-text-body">
            {configured ? <StatusBadge tone="success">{config.mode}</StatusBadge> : <StatusBadge tone="warning">{config.mode === "off" ? "off" : "not configured"}</StatusBadge>}
            {host && <span className="ml-2 font-mono text-xs">{host}</span>}
            {config.libraryId && <span className="ml-2 font-mono text-xs">library {config.libraryId}</span>}
          </p>
          {!configured && (
            <p className="mt-2 text-xs text-text-muted">
              Set KOHA_INTEGRATION=read and the KOHA_* settings on the server (docs/KOHA-INTEGRATION.md).{config.problems.length ? ` ${config.problems.join(" ")}` : ""}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-divider bg-bg-surface p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">First build</h2>
          <p className="mt-1 text-sm text-text-body">
            {state?.initialized_at ? <>Done {when(state.initialized_at)}</> : "Not yet. Run a preview, check it, then build."}
          </p>
          <p className="mt-2 text-xs text-text-muted">
            {state?.initialized_at ? "Changes in Koha are picked up every 15 minutes." : "The scheduled sync stays off until the first build is applied here."}
          </p>
        </div>
        <div className="rounded-xl border border-divider bg-bg-surface p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Last run</h2>
          <p className="mt-1 text-sm text-text-body">
            {state?.last_run_at ? (
              <>
                <StatusBadge tone={state.last_run_status === "ok" ? "success" : "danger"}>
                  {state.last_run_mode} {state.last_run_applied ? "sync" : "preview"} · {state.last_run_status}
                </StatusBadge>
                <span className="ml-2 text-xs text-text-muted">{when(state.last_run_at)}{summary.durationMs ? ` · ${Math.round(summary.durationMs / 1000)} s` : ""}</span>
              </>
            ) : "Never"}
          </p>
          {state?.last_error && <p className="mt-2 text-xs text-danger-text">{state.last_error}</p>}
        </div>
      </section>

      {missingTable && (
        <p className="rounded-xl border border-warning-line bg-warning-soft p-4 text-sm text-warning-text">
          The database does not have the Koha sync table yet. Migration 0157 must be applied before the sync can run.
        </p>
      )}

      {state?.last_run_at && (
        <section className="rounded-xl border border-divider bg-bg-surface p-4">
          <h2 className="text-sm font-semibold text-text-heading">
            {state.last_run_applied ? "What the last sync did" : "What an apply would do (from the last preview)"}
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            {[
              ["kohaRecords", "Koha records read"], ["kohaItems", "Koha items read"],
              ["createRecords", "Records created"], ["linkRecords", "Records linked"],
              ["updateRecords", "Records updated"], ["unlistRecords", "Records unlisted"],
              ["createCopies", "Copies created"], ["linkCopies", "Copies linked"],
              ["updateCopies", "Copies updated"], ["retireCopies", "Copies withdrawn"],
            ].map(([k, label]) => (
              <div key={k}>
                <dt className="text-xs text-text-muted">{label}</dt>
                <dd className="font-semibold tabular-nums text-text-heading">{(counts[k] ?? 0).toLocaleString()}</dd>
              </div>
            ))}
          </dl>
          {(summary.errorsTotal ?? 0) > 0 && (
            <div className="mt-4 rounded-lg border border-danger-line bg-danger-soft p-3 text-xs text-danger-text">
              <p className="font-semibold">{summary.errorsTotal} error{summary.errorsTotal === 1 ? "" : "s"}. The next run retries; nothing was deleted.</p>
              <ul className="mt-1 list-disc pl-4">{(summary.errors ?? []).map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      {state?.last_run_at && (
        <section className="rounded-xl border border-divider bg-bg-surface">
          <h2 className="border-b border-divider px-4 py-3 text-sm font-semibold text-text-heading">
            For a librarian to look at <span className="font-normal text-text-muted">({(summary.exceptionsTotal ?? exceptions.length).toLocaleString()})</span>
          </h2>
          {exceptions.length === 0 ? (
            <EmptyState title="Nothing to look at" description="Every record and copy in the e-Library matches Koha." />
          ) : (
            <ul className="divide-y divide-divider">
              {exceptions.map((e, i) => (
                <li key={i} className="flex flex-col gap-1 px-4 py-2.5 text-sm sm:flex-row sm:items-baseline sm:gap-3">
                  <StatusBadge tone={e.kind === "barcode_conflict" || e.kind === "missing_biblio" ? "danger" : "warning"} className="shrink-0">
                    {EXCEPTION_LABEL[e.kind] ?? e.kind}
                  </StatusBadge>
                  <span className="text-text-body">{e.message}</span>
                  {e.bookId && <Link href={`/admin/catalogs/edit/${e.bookId}`} className="shrink-0 text-xs font-semibold text-brand hover:underline sm:ml-auto">Open record</Link>}
                </li>
              ))}
            </ul>
          )}
          {(summary.exceptionsTotal ?? 0) > exceptions.length && (
            <p className="border-t border-divider px-4 py-2 text-xs text-text-muted">Showing the first {exceptions.length} of {summary.exceptionsTotal}.</p>
          )}
        </section>
      )}
    </div>
  );
}
