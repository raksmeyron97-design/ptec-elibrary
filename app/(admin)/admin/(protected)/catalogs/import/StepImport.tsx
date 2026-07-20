"use client";
// Step 4 — real import progress (per completed server batch) and the final
// results screen with downloadable reports. Progress is never simulated:
// every number on this screen comes from server-confirmed batch results.

// Admin routes are outside the locale scheme — plain next/link is correct here.
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  buildFailedRowsCsv,
  buildImportReportCsv,
} from "@/lib/catalog-import";
import { downloadTextFile, type ImportSet, type WizardState } from "./wizard-state";

export default function StepImport({ state, importSet }: { state: WizardState; importSet: ImportSet | null }) {
  const t = useTranslations("adminCatalog.import.progress");
  const p = state.progress;
  const pct = p.totalRows > 0 ? Math.round((p.processedRows / p.totalRows) * 100) : 0;
  const rows = importSet?.rows ?? state.rows;
  const today = new Date().toISOString().slice(0, 10);

  if (state.phase === "importing") {
    return (
      <div className="mx-auto max-w-lg space-y-5 py-6" role="status" aria-live="polite">
        <div className="text-center">
          <p className="text-lg font-bold text-text-heading">{t("importing")}</p>
          <p className="mt-1 text-sm text-text-muted">
            {t("rowsProcessed", { processed: p.processedRows, total: p.totalRows })}
            {p.totalBatches > 1 && <> · {t("batchOf", { current: Math.min(p.batchesDone + 1, p.totalBatches), total: p.totalBatches })}</>}
          </p>
        </div>

        <div
          className="h-3 w-full overflow-hidden rounded-full bg-paper"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("progressAria")}
        >
          <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-center text-2xl font-bold text-brand">{pct}%</p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: t("created"), value: p.created, tone: "text-emerald-600" },
            { label: t("updated"), value: p.updated, tone: "text-sky-600" },
            { label: t("skipped"), value: p.skippedDuplicates, tone: "text-text-muted" },
            { label: t("failed"), value: p.failed, tone: "text-red-500" },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-divider bg-bg-surface p-3 text-center">
              <p className="text-[11px] font-semibold text-text-muted">{c.label}</p>
              <p className={`text-lg font-bold ${c.tone}`}>{c.value.toLocaleString()}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-text-muted">
          {p.cancelRequested ? t("cancelling") : t("keepOpen")}
        </p>
      </div>
    );
  }

  // ── Done ────────────────────────────────────────────────────────────────────

  const status = p.finalStatus ?? "completed";
  const heading =
    status === "completed"
      ? p.failed > 0 ? t("completedWithFailures") : t("completed")
      : status === "cancelled"
        ? t("cancelled")
        : t("stopped");
  const headTone =
    status === "completed" && p.failed === 0 ? "text-emerald-600" : status === "failed" ? "text-red-600" : "text-amber-600";

  return (
    <div className="mx-auto max-w-2xl space-y-5 py-4">
      <div className="text-center">
        <p className={`text-xl font-bold ${headTone}`} role="status">{heading}</p>
        {p.errorMessage && <p className="mt-1 text-sm text-red-600">{p.errorMessage}</p>}
        {status === "cancelled" && (
          <p className="mt-1 text-sm text-text-muted">
            {t("cancelledNote")}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { label: t("booksCreated"), value: p.created, tone: "text-emerald-600" },
          { label: t("booksUpdated"), value: p.updated, tone: "text-sky-600" },
          { label: t("copiesCreated"), value: p.copiesCreated, tone: "text-emerald-600" },
          { label: t("duplicatesSkipped"), value: p.skippedDuplicates, tone: "text-text-muted" },
          { label: t("rowsFailed"), value: p.failed, tone: p.failed > 0 ? "text-red-500" : "text-text-muted" },
          { label: t("rowsExcluded"), value: p.excluded, tone: "text-text-muted" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-divider bg-bg-surface p-3.5 text-center">
            <p className="text-[11px] font-semibold text-text-muted">{c.label}</p>
            <p className={`mt-0.5 text-2xl font-bold ${c.tone}`}>{c.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Failed row details (first few, full list in the report) */}
      {p.failed > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-3 text-xs text-red-700">
          <p className="font-bold">{t("failedRows")}</p>
          <ul className="mt-1 space-y-0.5">
            {[...state.results.values()]
              .filter((r) => r.status === "failed")
              .slice(0, 5)
              .map((r) => (
                <li key={r.rowNumber}>{t("rowError", { row: r.rowNumber, message: r.message ?? t("failedShort") })}</li>
              ))}
            {p.failed > 5 && <li className="italic">{t("andMore", { count: p.failed - 5 })}</li>}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => downloadTextFile(`ptec-book-import-report-${today}.csv`, buildImportReportCsv(rows, state.results), false)}
          className="rounded-xl border border-divider px-4 py-2 text-xs font-semibold text-text-body transition hover:bg-paper"
        >
          {t("downloadReport")}
        </button>
        {p.failed > 0 && (
          <button
            type="button"
            onClick={() => downloadTextFile(`ptec-book-import-errors-${today}.csv`, buildFailedRowsCsv(rows, state.results), false)}
            className="rounded-xl border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
          >
            {t("downloadFailed")}
          </button>
        )}
        <Link
          href="/admin/catalogs?sort=newest"
          className="rounded-xl border border-divider px-4 py-2 text-xs font-semibold text-brand transition hover:bg-paper"
        >
          {t("viewImported")}
        </Link>
      </div>

      <p className="text-center text-[11px] text-text-muted">
        {t("recordedNote")}
        {state.importId && <> ({t("importId")} <span className="font-mono">{state.importId.slice(0, 8)}</span>)</>}.
      </p>
    </div>
  );
}
