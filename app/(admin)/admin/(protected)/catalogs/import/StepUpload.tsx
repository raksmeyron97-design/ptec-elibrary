"use client";
// Step 1 — choose the CSV source: drag-and-drop / file picker, or paste.

import { useTranslations } from "next-intl";
import { useRef, useState, type Dispatch } from "react";
import {
  CSV_TEMPLATE_BLANK,
  CSV_TEMPLATE_EXAMPLE,
  FIELD_DOCS,
  IMPORT_LIMITS,
  REQUIRED_FIELDS,
  formatBytes,
  DELIMITER_LABEL,
} from "@/lib/catalog-import";
import {
  checkCsvFile,
  parseCsvSource,
  downloadTextFile,
  type WizardAction,
  type WizardState,
} from "./wizard-state";

const OPTIONAL_SUMMARY = "isbn, year, language, category, department, shelf_location, copies_total, barcode …";

export default function StepUpload({ state, dispatch }: { state: WizardState; dispatch: Dispatch<WizardAction> }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("adminCatalog.import.upload");
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const [parsing, setParsing] = useState(false);

  async function handleFile(file: File) {
    setFileError(null);
    const check = checkCsvFile(file);
    if (!check.ok) {
      setFileError(check.error);
      return;
    }
    setParsing(true);
    try {
      const text = await file.text(); // decoded as UTF-8
      const outcome = parseCsvSource(text);
      if (!outcome.ok) {
        setFileError(outcome.error);
        dispatch({ type: "CLEAR_SOURCE" });
      } else {
        dispatch({ type: "SOURCE_PARSED", parsed: outcome.parsed, fileName: file.name, fileSize: file.size, sourceType: "file" });
      }
    } finally {
      setParsing(false);
    }
  }

  function handlePasteParse(text: string) {
    // SET_PASTE_TEXT resets all downstream state; SOURCE_PARSED (dispatched in
    // the same event) then records the fresh parse. Sequential reducer
    // application makes this atomic from React's point of view.
    dispatch({ type: "SET_PASTE_TEXT", text });
    if (!text.trim()) return;
    const outcome = parseCsvSource(text);
    if (outcome.ok) {
      dispatch({ type: "SOURCE_PARSED", parsed: outcome.parsed, fileName: null, fileSize: null, sourceType: "paste" });
    }
  }

  const pasteRows = state.pasteText.trim() ? state.pasteText.trim().split(/\r?\n/).length - 1 : 0;

  const tabBtn = (id: "file" | "paste", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={state.sourceType === id}
      onClick={() => dispatch({ type: "SET_SOURCE_TYPE", sourceType: id })}
      className={`h-9 rounded-lg px-4 text-sm font-semibold transition ${
        state.sourceType === id
          ? "bg-bg-surface text-text-heading shadow-sm"
          : "text-text-muted hover:text-text-body"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* Source tabs */}
      <div role="tablist" aria-label={t("sourceAria")} className="inline-flex items-center gap-1 rounded-xl bg-paper p-1">
        {tabBtn("file", t("uploadFile"))}
        {tabBtn("paste", t("pasteCsv"))}
      </div>

      {state.sourceType === "file" ? (
        state.parsed && state.fileName ? (
          /* Selected-file card */
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-500/25 dark:bg-emerald-500/5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700" aria-hidden>
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-text-heading">{state.fileName}</p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {state.fileSize != null ? formatBytes(state.fileSize) : ""}
                    {" · "}{t("dataRows", { count: state.parsed.rows.length })}
                    {" · "}{t("delimiter", { name: DELIMITER_LABEL[state.parsed.delimiter] ?? state.parsed.delimiter })}
                    {" · "}UTF-8{state.parsed.hasBom ? " (BOM)" : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg border border-divider bg-bg-surface px-3 py-1.5 text-xs font-semibold text-text-body transition hover:bg-paper">
                  {t("replaceFile")}
                </button>
                <button type="button" onClick={() => dispatch({ type: "CLEAR_SOURCE" })}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50">
                  {t("remove")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Drop zone */
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
              dragOver ? "border-brand bg-brand/5" : "border-divider bg-paper/50"
            }`}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-brand" aria-hidden>
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M8 13h2m-2 4h5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="mt-3 font-semibold text-text-heading">
              {parsing ? t("reading") : t("dropHere")}
            </p>
            <p className="mt-1 text-sm text-text-muted">
              or{" "}
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="font-semibold text-brand underline-offset-2 hover:underline">
                {t("chooseFile")}
              </button>
            </p>
            <p className="mt-2 text-xs text-text-muted">
              {t("limits", { mb: Math.round(IMPORT_LIMITS.maxFileBytes / (1024 * 1024)), rows: IMPORT_LIMITS.maxRows })}
            </p>
          </div>
        )
      ) : (
        /* Paste editor */
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-text-muted">
              {t("pasteHint")}
            </p>
            <div className="flex gap-2">
              <button type="button"
                onClick={() => handlePasteParse(CSV_TEMPLATE_EXAMPLE)}
                className="rounded-lg border border-divider px-2.5 py-1 text-[11px] font-semibold text-text-body transition hover:bg-paper">
                {t("pasteSample")}
              </button>
              <button type="button"
                onClick={() => dispatch({ type: "CLEAR_SOURCE" })}
                disabled={!state.pasteText}
                className="rounded-lg border border-divider px-2.5 py-1 text-[11px] font-semibold text-text-body transition hover:bg-paper disabled:opacity-40">
                {t("clear")}
              </button>
            </div>
          </div>
          <textarea
            value={state.pasteText}
            onChange={(e) => handlePasteParse(e.target.value)}
            spellCheck={false}
            aria-label={t("csvTextAria")}
            placeholder={"title,author,isbn,year,language,category\nIntroduction to Law,John Smith,978-0-306-40615-7,2020,en,Law"}
            className="h-[280px] w-full resize-y overflow-auto whitespace-pre rounded-xl border border-divider bg-paper px-3 py-2.5 font-mono text-xs leading-relaxed text-text-body outline-none focus:border-brand focus:ring-2 focus:ring-focus-ring/15"
          />
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-muted" aria-live="polite">
            <span>{t("characters", { count: state.pasteText.length })}</span>
            {pasteRows > 0 && <span>{t("approxRows", { count: pasteRows })}</span>}
            {state.parsed && state.sourceType === "paste" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                {t("parsed", { count: state.parsed.rows.length, delimiter: DELIMITER_LABEL[state.parsed.delimiter] ?? "?" })}
              </span>
            )}
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />

      {/* Errors */}
      {(fileError || state.parseError) && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-bold">{t("fileUnusable")}</p>
          <p className="mt-0.5">{fileError ?? state.parseError}</p>
        </div>
      )}

      {/* Format summary */}
      <div className="rounded-2xl border border-divider bg-paper/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="text-xs leading-relaxed">
            <p>
              <span className="font-bold text-text-heading">{t("required")}</span>{" "}
              <code className="rounded bg-brand/10 px-1 font-mono text-brand">{REQUIRED_FIELDS.join(", ")}</code>
            </p>
            <p className="mt-1 text-text-muted">
              <span className="font-semibold text-text-body">{t("optional")}</span> {OPTIONAL_SUMMARY}
            </p>
            <p className="mt-1 text-text-muted">
              {t("formatNote")}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1.5">
            <button type="button" onClick={() => downloadTextFile("ptec-book-import-template.csv", CSV_TEMPLATE_BLANK)}
              className="text-xs font-semibold text-brand hover:underline">
              {t("blankTemplate")}
            </button>
            <button type="button" onClick={() => downloadTextFile("ptec-book-import-example.csv", CSV_TEMPLATE_EXAMPLE)}
              className="text-xs font-semibold text-brand hover:underline">
              {t("exampleCsv")}
            </button>
            <button type="button" onClick={() => setShowDocs((v) => !v)} aria-expanded={showDocs}
              className="text-xs font-semibold text-text-body hover:underline">
              {showDocs ? t("hideColumns") : t("viewColumns")}
            </button>
          </div>
        </div>

        {showDocs && (
          <div className="mt-3 overflow-x-auto rounded-xl border border-divider bg-bg-surface">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">{t("supportedColumns")}</caption>
              <thead>
                <tr className="border-b border-divider bg-paper/60">
                  {[t("col.column"), t("col.required"), t("col.type"), t("col.example"), t("col.rule")].map((h) => (
                    <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 font-bold uppercase tracking-wide text-text-muted">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-divider/60">
                {FIELD_DOCS.map((d) => (
                  <tr key={d.field}>
                    <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-text-heading">{d.field}</td>
                    <td className="px-3 py-2">{d.required ? <span className="font-bold text-red-500">{t("yes")}</span> : <span className="text-text-muted">{t("no")}</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-text-muted">{d.type}</td>
                    <td className="max-w-[180px] truncate px-3 py-2 font-mono text-text-muted">{d.example}</td>
                    <td className="min-w-[220px] px-3 py-2 text-text-muted">{d.rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
