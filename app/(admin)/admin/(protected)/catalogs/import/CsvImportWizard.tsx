"use client";
// Four-step CSV import wizard: Upload → Map columns → Validate → Import.
//
// Architecture (see wizard-state.ts for the state machine):
//   • parsing + preview validation run in the browser for instant feedback;
//   • one bulk server call checks duplicates against the live catalog;
//   • the import itself is client-driven batches of raw rows — the server
//     re-validates every value, so nothing here is trusted for writes;
//   • progress is real (per completed batch), never simulated.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
// Admin routes are outside the locale scheme — use plain next/navigation here.
import { useRouter } from "next/navigation";
import { IMPORT_LIMITS, type ImportRowResult } from "@/lib/catalog-import";
import {
  wizardReducer,
  INITIAL_STATE,
  PHASE_STEP,
  deriveImportSet,
  countBatchResults,
  sha256Hex,
  type ImportSet,
} from "./wizard-state";
import {
  getCatalogImportContext,
  checkCatalogDuplicates,
  startCatalogImport,
  runCatalogImportBatch,
  finishCatalogImport,
} from "../import-actions";
import {
  validateRow,
  markInFileDuplicates,
  refreshRowStatus,
  applyMappings,
  missingRequiredFields,
  type ValidatedRow,
} from "@/lib/catalog-import";
import StepUpload from "./StepUpload";
import StepMapping from "./StepMapping";
import StepValidate from "./StepValidate";
import StepImport from "./StepImport";

const STEPS = ["Upload", "Map columns", "Validate", "Import"] as const;

export default function CsvImportWizard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, dispatch] = useReducer(wizardReducer, INITIAL_STATE);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);
  const importRunningRef = useRef(false);

  const step = PHASE_STEP[state.phase];

  // The import set (groups, batches, confirmation counts) is derived from the
  // validated rows + current options — never cached across option changes.
  const importSet: ImportSet | null = useMemo(
    () => (state.phase === "preview" || state.phase === "importing" || state.phase === "done"
      ? deriveImportSet(state.rows, state.options)
      : null),
    [state.phase, state.rows, state.options],
  );

  // ── Open / close ─────────────────────────────────────────────────────────────

  const hasWorkInProgress =
    state.parsed !== null && state.phase !== "done" && state.phase !== "importing";

  const requestClose = useCallback(() => {
    if (state.phase === "importing") {
      // Never dismiss a running import silently.
      const ok = window.confirm(
        "An import is running. Closing this window stops it after the current batch — books already imported stay in the catalog. Stop the import?",
      );
      if (!ok) return;
      cancelRef.current = true;
      dispatch({ type: "REQUEST_CANCEL" });
      return; // the import loop closes the run; keep the dialog for the summary
    }
    if (hasWorkInProgress) {
      if (!window.confirm("Discard this import setup?")) return;
    }
    setOpen(false);
    dispatch({ type: "RESET" });
    triggerRef.current?.focus();
  }, [state.phase, hasWorkInProgress]);

  // Body scroll lock + Escape + initial focus.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        requestClose();
      }
      // Minimal focus trap: keep Tab inside the dialog.
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, requestClose]);

  // Guard against tab close while importing.
  useEffect(() => {
    if (state.phase !== "importing") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [state.phase]);

  // ── Step 2 → 3: validate everything ─────────────────────────────────────────

  const runValidation = useCallback(async () => {
    if (!state.parsed) return;
    dispatch({ type: "VALIDATING" });
    try {
      // Reference values (existing categories/departments) — cached per open.
      const refs = state.refs ?? (await getCatalogImportContext());

      const mappings = state.mappings;
      const validated: ValidatedRow[] = state.parsed.rows.map((row, i) =>
        validateRow(applyMappings(row, mappings), i + 2, refs),
      );
      const marked = markInFileDuplicates(validated);

      // One bulk duplicate check against the live catalog.
      const dupes = await checkCatalogDuplicates({
        isbns: [...new Set(marked.map((r) => r.normalized.isbn).filter(Boolean) as string[])],
        titleAuthors: [...new Set(marked.map((r) => `${r.normalized.title.toLowerCase()}|${r.normalized.author.toLowerCase()}`))],
        barcodes: [...new Set(marked.map((r) => r.normalized.barcode).filter(Boolean) as string[])],
        accessions: [...new Set(marked.map((r) => r.normalized.accession_number).filter(Boolean) as string[])],
      });
      const usedBarcodes = new Set(dupes.usedBarcodes);
      const usedAccessions = new Set(dupes.usedAccessions);

      const withDupes = marked.map((r) => {
        const issues = [...r.issues];
        if (r.normalized.barcode && usedBarcodes.has(r.normalized.barcode)) {
          issues.push({
            code: "DUPLICATE_BARCODE", severity: "error", field: "barcode",
            message: `Barcode "${r.normalized.barcode}" is already assigned to a copy in the library and cannot be reused.`,
          });
        }
        if (r.normalized.accession_number && usedAccessions.has(r.normalized.accession_number)) {
          issues.push({
            code: "DUPLICATE_ACCESSION", severity: "error", field: "accession_number",
            message: `Accession number "${r.normalized.accession_number}" is already in use.`,
          });
        }
        const isbnHit = r.normalized.isbn ? dupes.byIsbn[r.normalized.isbn] : undefined;
        const taHit = dupes.byTitleAuthor[`${r.normalized.title.toLowerCase()}|${r.normalized.author.toLowerCase()}`];
        const duplicateMatch = isbnHit ?? taHit;
        if (duplicateMatch) {
          issues.push({
            code: duplicateMatch.matchedBy === "isbn" ? "DUPLICATE_ISBN" : "DUPLICATE_TITLE_AUTHOR",
            severity: "warning",
            message: duplicateMatch.matchedBy === "isbn"
              ? `ISBN already belongs to “${duplicateMatch.existingTitle}” in the catalog.`
              : `“${duplicateMatch.existingTitle}” already exists with this title and author.`,
          });
        }
        return refreshRowStatus({ ...r, issues, duplicateMatch });
      });

      const set = deriveImportSet(withDupes, state.options);
      dispatch({ type: "VALIDATED", rows: withDupes, groups: set.groups, summary: set.summary, refs });
    } catch (e) {
      dispatch({
        type: "VALIDATION_FAILED",
        error: e instanceof Error ? e.message : "Validation failed — check your connection and try again.",
      });
    }
  }, [state.parsed, state.mappings, state.refs, state.options]);

  // ── Step 3 → 4: run the import ───────────────────────────────────────────────

  const runImport = useCallback(async (force = false) => {
    if (!state.parsed || !importSet || importRunningRef.current) return;
    const { batches } = importSet;
    const totalRows = batches.reduce((n, b) => n + b.reduce((m, g) => m + g.rowNumbers.length, 0), 0);
    if (totalRows === 0) return;

    importRunningRef.current = true;
    cancelRef.current = false;
    const startedAt = Date.now();

    try {
      const sourceHash = await sha256Hex(state.parsed.text);
      const start = await startCatalogImport({
        fileName: state.fileName,
        sourceType: state.sourceType,
        sourceHash,
        totalRows,
        options: state.options,
        force,
      });
      if (!start.ok) {
        dispatch({ type: "START_FAILED", error: start.error, duplicateSubmission: start.code === "DUPLICATE_SUBMISSION" });
        return;
      }

      dispatch({ type: "IMPORT_STARTED", importId: start.importId, totalBatches: batches.length, totalRows });

      const rowByNumber = new Map(state.rows.map((r) => [r.rowNumber, r]));
      const counts = { created: 0, updated: 0, copiesCreated: 0, skippedDuplicates: 0, failed: 0, excluded: 0 };
      let hadBatchFailure = false;

      for (const batch of batches) {
        if (cancelRef.current) break;
        const rowsPayload = batch.flatMap((g) =>
          g.rowNumbers.map((rn) => ({ rowNumber: rn, original: rowByNumber.get(rn)?.original ?? {} })),
        );
        try {
          const res = await runCatalogImportBatch({
            importId: start.importId,
            rows: rowsPayload,
            options: state.options,
          });
          const results: ImportRowResult[] = res.results;
          const c = countBatchResults(results);
          counts.created += c.created;
          counts.updated += c.updated;
          counts.skippedDuplicates += c.skippedDuplicates;
          counts.failed += c.failed;
          counts.excluded += c.excluded;
          counts.copiesCreated += c.copiesCreated;
          dispatch({ type: "BATCH_DONE", results, processedRows: rowsPayload.length });
          if (!res.ok) {
            hadBatchFailure = true;
            break;
          }
        } catch (e) {
          // A failed batch is reported honestly: its rows are marked failed and
          // the import stops. Nothing is retried automatically — a retry could
          // double-import a partially applied batch.
          hadBatchFailure = true;
          const message = e instanceof Error ? e.message : "The server did not respond.";
          const failed: ImportRowResult[] = rowsPayload.map((r) => ({
            rowNumber: r.rowNumber, status: "failed", message: `Batch failed: ${message}`,
          }));
          counts.failed += failed.length;
          dispatch({ type: "BATCH_DONE", results: failed, processedRows: rowsPayload.length });
          break;
        }
      }

      const finalStatus = cancelRef.current ? "cancelled" : hadBatchFailure ? "failed" : "completed";
      try {
        await finishCatalogImport({
          importId: start.importId,
          status: finalStatus,
          counts,
          durationMs: Date.now() - startedAt,
        });
      } catch {
        // Finalization is bookkeeping — the imported data is already in place.
      }
      dispatch({
        type: "IMPORT_FINISHED",
        finalStatus,
        errorMessage: hadBatchFailure ? "The import stopped after a failed batch. Rows below show exactly what was written." : undefined,
      });
    } finally {
      importRunningRef.current = false;
    }
  }, [state.parsed, state.fileName, state.sourceType, state.options, state.rows, importSet]);

  // ── Footer actions per phase ─────────────────────────────────────────────────

  const missingRequired = missingRequiredFields(state.mappings);

  const handleCancelImport = useCallback(() => {
    cancelRef.current = true;
    dispatch({ type: "REQUEST_CANCEL" });
  }, []);

  const handleDone = useCallback(() => {
    setOpen(false);
    dispatch({ type: "RESET" });
    triggerRef.current?.focus();
    router.refresh();
  }, [router]);

  function footer() {
    const backBtn = (onClick: () => void, label = "Back") => (
      <button type="button" onClick={onClick}
        className="inline-flex h-11 items-center rounded-xl border border-divider px-5 text-sm font-semibold text-text-body transition hover:bg-paper">
        {label}
      </button>
    );
    const primaryBtn = (onClick: () => void, label: string, disabled = false) => (
      <button type="button" onClick={onClick} disabled={disabled}
        className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-6 text-sm font-bold text-white shadow-sm transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40">
        {label}
      </button>
    );

    switch (state.phase) {
      case "upload":
      case "parse_failed":
        return (
          <>
            <span className="mr-auto text-xs text-text-muted">
              Limits: {Math.round(IMPORT_LIMITS.maxFileBytes / (1024 * 1024))} MB · {IMPORT_LIMITS.maxRows.toLocaleString()} rows
            </span>
            {backBtn(requestClose, "Cancel")}
            {primaryBtn(() => dispatch({ type: "GO_TO_MAPPING" }), "Continue", !state.parsed)}
          </>
        );
      case "mapping":
        return (
          <>
            {missingRequired.length > 0 && (
              <span className="mr-auto text-xs font-semibold text-red-500" role="status">
                Required not mapped: {missingRequired.join(", ")}
              </span>
            )}
            {backBtn(() => dispatch({ type: "BACK_TO_UPLOAD" }))}
            {primaryBtn(() => void runValidation(), "Validate rows", missingRequired.length > 0)}
          </>
        );
      case "validating":
        return (
          <>
            {backBtn(() => dispatch({ type: "BACK_TO_MAPPING" }))}
            {primaryBtn(() => {}, "Validating…", true)}
          </>
        );
      case "preview": {
        const n = importSet ? importSet.toCreate + importSet.toUpdate : 0;
        return (
          <>
            {backBtn(() => dispatch({ type: "BACK_TO_MAPPING" }))}
            {primaryBtn(
              () => void runImport(false),
              importSet && importSet.toUpdate > 0
                ? `Import ${importSet.toCreate} new · update ${importSet.toUpdate}`
                : `Import ${importSet?.toCreate ?? 0} book${(importSet?.toCreate ?? 0) === 1 ? "" : "s"}`,
              n === 0,
            )}
          </>
        );
      }
      case "importing":
        return (
          <button type="button"
            onClick={handleCancelImport}
            disabled={state.progress.cancelRequested}
            className="inline-flex h-11 items-center rounded-xl border border-red-200 px-5 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50">
            {state.progress.cancelRequested ? "Finishing current batch…" : "Cancel import"}
          </button>
        );
      case "done":
        return (
          <>
            <button type="button" onClick={() => dispatch({ type: "RESET" })}
              className="mr-auto inline-flex h-11 items-center rounded-xl border border-divider px-5 text-sm font-semibold text-text-body transition hover:bg-paper">
              Import another file
            </button>
            {primaryBtn(handleDone, "Done")}
          </>
        );
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-divider bg-bg-surface px-5 text-sm font-semibold text-text-body transition hover:bg-paper"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        Import CSV
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/45 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="csv-wizard-title"
            tabIndex={-1}
            className="flex h-[100dvh] w-full flex-col bg-bg-surface shadow-2xl outline-none sm:h-auto sm:max-h-[92dvh] sm:max-w-[980px] sm:rounded-2xl"
          >
            {/* Header — sticky by construction (flex column layout) */}
            <div className="flex items-center justify-between gap-4 border-b border-divider bg-paper px-4 py-3.5 sm:rounded-t-2xl sm:px-6">
              <div className="min-w-0">
                <h2 id="csv-wizard-title" className="text-base font-bold text-text-heading">
                  Import Books from CSV
                </h2>
                {/* Step indicator */}
                <ol className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]" aria-label="Import steps">
                  {STEPS.map((label, i) => {
                    const num = (i + 1) as 1 | 2 | 3 | 4;
                    const current = num === step;
                    const complete = num < step;
                    return (
                      <li key={label} className="flex items-center gap-1.5" aria-current={current ? "step" : undefined}>
                        <span
                          className={`flex h-4.5 w-4.5 items-center justify-center rounded-full text-[10px] font-bold ${
                            current ? "bg-brand text-white" : complete ? "bg-emerald-500 text-white" : "bg-paper border border-divider text-text-muted"
                          }`}
                          aria-hidden
                        >
                          {complete ? "✓" : num}
                        </span>
                        <span className={current ? "font-bold text-text-heading" : "text-text-muted"}>{label}</span>
                        {i < STEPS.length - 1 && <span aria-hidden className="text-text-muted/50">→</span>}
                      </li>
                    );
                  })}
                </ol>
              </div>
              <button type="button" onClick={requestClose} aria-label="Close import wizard"
                className="rounded-lg p-1.5 text-text-muted transition hover:bg-bg-surface hover:text-text-body">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
              {(state.phase === "upload" || state.phase === "parse_failed") && (
                <StepUpload state={state} dispatch={dispatch} />
              )}
              {state.phase === "mapping" && <StepMapping state={state} dispatch={dispatch} />}
              {(state.phase === "validating" || state.phase === "preview") && (
                <StepValidate state={state} dispatch={dispatch} importSet={importSet} />
              )}
              {(state.phase === "importing" || state.phase === "done") && (
                <StepImport state={state} importSet={importSet} />
              )}
            </div>

            {/* Sticky footer */}
            <div className="flex items-center justify-end gap-3 border-t border-divider bg-paper px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:rounded-b-2xl sm:px-6">
              {footer()}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
