// Client-side state machine for the CSV import wizard.
//
// The wizard is an explicit state machine (not a pile of booleans): every UI
// action is derived from `phase`, and anything that invalidates downstream
// work (new file, edited paste, changed mapping, changed options) resets the
// dependent state in the reducer — stale validation results can never be
// imported.

import Papa from "papaparse";
import {
  autoMapHeaders,
  IMPORT_LIMITS,
  type ColumnMapping,
  type ImportGroup,
  type ImportOptions,
  type ImportRowResult,
  type ValidatedRow,
  type ValidationSummary,
  DEFAULT_IMPORT_OPTIONS,
} from "@/lib/catalog-import";
import type { CatalogImportContext } from "../import-actions";

// ── Phases ────────────────────────────────────────────────────────────────────

export type WizardPhase =
  | "upload"        // step 1 — no source yet, or source selected & parsed
  | "parse_failed"  // step 1 — source could not be read
  | "mapping"       // step 2
  | "validating"    // step 3 — running validation + duplicate check
  | "preview"       // step 3 — results ready, options + confirmation
  | "importing"     // step 4 — batches in flight
  | "done";         // step 4 — results screen (completed / failed / cancelled)

export const PHASE_STEP: Record<WizardPhase, 1 | 2 | 3 | 4> = {
  upload: 1, parse_failed: 1, mapping: 2, validating: 3, preview: 3, importing: 4, done: 4,
};

export type SourceType = "file" | "paste";

export type ParsedSource = {
  headers: string[];
  /** Data rows (array-of-arrays, header excluded). */
  rows: string[][];
  delimiter: string;
  hasBom: boolean;
  /** Source text is kept only to hash it at import time. */
  text: string;
};

export type ImportProgress = {
  totalBatches: number;
  batchesDone: number;
  processedRows: number;
  totalRows: number;
  created: number;
  updated: number;
  copiesCreated: number;
  skippedDuplicates: number;
  failed: number;
  excluded: number;
  cancelRequested: boolean;
  finalStatus: "completed" | "failed" | "cancelled" | null;
  errorMessage: string | null;
};

export const EMPTY_PROGRESS: ImportProgress = {
  totalBatches: 0, batchesDone: 0, processedRows: 0, totalRows: 0,
  created: 0, updated: 0, copiesCreated: 0, skippedDuplicates: 0, failed: 0, excluded: 0,
  cancelRequested: false, finalStatus: null, errorMessage: null,
};

export type WizardState = {
  phase: WizardPhase;
  sourceType: SourceType;
  fileName: string | null;
  fileSize: number | null;
  pasteText: string;
  parsed: ParsedSource | null;
  parseError: string | null;
  mappings: ColumnMapping[];
  refs: CatalogImportContext | null;
  rows: ValidatedRow[];
  groups: ImportGroup[];
  summary: ValidationSummary | null;
  options: ImportOptions;
  validationError: string | null;
  progress: ImportProgress;
  results: Map<number, ImportRowResult>;
  importId: string | null;
  startError: string | null;
  /** Set when the server said DUPLICATE_SUBMISSION — enables "import anyway". */
  duplicateSubmission: boolean;
};

export const INITIAL_STATE: WizardState = {
  phase: "upload",
  sourceType: "file",
  fileName: null,
  fileSize: null,
  pasteText: "",
  parsed: null,
  parseError: null,
  mappings: [],
  refs: null,
  rows: [],
  groups: [],
  summary: null,
  options: DEFAULT_IMPORT_OPTIONS,
  validationError: null,
  progress: EMPTY_PROGRESS,
  results: new Map(),
  importId: null,
  startError: null,
  duplicateSubmission: false,
};

// ── Actions ───────────────────────────────────────────────────────────────────

export type WizardAction =
  | { type: "SET_SOURCE_TYPE"; sourceType: SourceType }
  | { type: "SET_PASTE_TEXT"; text: string }
  | { type: "SOURCE_PARSED"; parsed: ParsedSource; fileName: string | null; fileSize: number | null; sourceType: SourceType }
  | { type: "PARSE_FAILED"; error: string }
  | { type: "CLEAR_SOURCE" }
  | { type: "SET_MAPPING"; sourceIndex: number; destination: ColumnMapping["destination"] }
  | { type: "GO_TO_MAPPING" }
  | { type: "BACK_TO_UPLOAD" }
  | { type: "VALIDATING" }
  | { type: "VALIDATED"; rows: ValidatedRow[]; groups: ImportGroup[]; summary: ValidationSummary; refs: CatalogImportContext }
  | { type: "VALIDATION_FAILED"; error: string }
  | { type: "BACK_TO_MAPPING" }
  | { type: "SET_OPTIONS"; options: ImportOptions }
  | { type: "TOGGLE_ROW_SKIP"; rowNumber: number }
  | { type: "REVALIDATED"; rows: ValidatedRow[]; groups: ImportGroup[]; summary: ValidationSummary }
  | { type: "IMPORT_STARTED"; importId: string; totalBatches: number; totalRows: number }
  | { type: "START_FAILED"; error: string; duplicateSubmission: boolean }
  | { type: "BATCH_DONE"; results: ImportRowResult[]; processedRows: number }
  | { type: "REQUEST_CANCEL" }
  | { type: "IMPORT_FINISHED"; finalStatus: "completed" | "failed" | "cancelled"; errorMessage?: string }
  | { type: "RESET" };

/**
 * Per-batch counts. created/updated/skipped are per BOOK (a multi-row group
 * yields one result per source row, all sharing the bookId — counting rows
 * would overstate books); failed/excluded stay per row. Groups never span
 * batches, so per-batch distinct bookIds sum correctly across the import.
 */
export function countBatchResults(results: ImportRowResult[]) {
  const distinct = (statuses: ImportRowResult["status"][]) =>
    new Set(
      results
        .filter((r) => statuses.includes(r.status))
        .map((r) => r.bookId ?? `row-${r.rowNumber}`),
    ).size;
  return {
    created: distinct(["created"]),
    updated: distinct(["updated", "copies_added"]),
    skippedDuplicates: distinct(["skipped_duplicate"]),
    failed: results.filter((r) => r.status === "failed").length,
    excluded: results.filter((r) => r.status === "excluded").length,
    copiesCreated: results.reduce((n, r) => n + (r.copiesCreated ?? 0), 0),
  };
}

function tallyResults(progress: ImportProgress, results: ImportRowResult[]): ImportProgress {
  const c = countBatchResults(results);
  return {
    ...progress,
    created: progress.created + c.created,
    updated: progress.updated + c.updated,
    skippedDuplicates: progress.skippedDuplicates + c.skippedDuplicates,
    failed: progress.failed + c.failed,
    excluded: progress.excluded + c.excluded,
    copiesCreated: progress.copiesCreated + c.copiesCreated,
  };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_SOURCE_TYPE":
      return { ...state, sourceType: action.sourceType };

    case "SET_PASTE_TEXT":
      // Editing the paste after parsing invalidates everything downstream.
      return {
        ...INITIAL_STATE,
        sourceType: "paste",
        pasteText: action.text,
        refs: state.refs,
        options: state.options,
      };

    case "SOURCE_PARSED":
      return {
        ...INITIAL_STATE,
        sourceType: action.sourceType,
        pasteText: state.pasteText,
        fileName: action.fileName,
        fileSize: action.fileSize,
        parsed: action.parsed,
        refs: state.refs,
        options: state.options,
        mappings: autoMapHeaders(action.parsed.headers, action.parsed.rows.slice(0, 5)),
      };

    case "PARSE_FAILED":
      return { ...state, phase: "parse_failed", parsed: null, parseError: action.error };

    case "CLEAR_SOURCE":
      return { ...INITIAL_STATE, sourceType: state.sourceType, refs: state.refs, options: state.options };

    case "GO_TO_MAPPING":
      return state.parsed ? { ...state, phase: "mapping", parseError: null } : state;

    case "BACK_TO_UPLOAD":
      return { ...state, phase: "upload" };

    case "SET_MAPPING": {
      // Mapping edits invalidate validation results.
      const mappings = state.mappings.map((m) => {
        if (m.sourceIndex === action.sourceIndex) {
          return { ...m, destination: action.destination, manuallyChanged: true, confidence: action.destination === "ignore" ? 0 : 1 };
        }
        // Enforce one-source-per-destination: unmap any other column that held it.
        if (action.destination !== "ignore" && m.destination === action.destination) {
          return { ...m, destination: "ignore" as const, confidence: 0 };
        }
        return m;
      });
      return { ...state, mappings, rows: [], groups: [], summary: null, results: new Map() };
    }

    case "VALIDATING":
      return { ...state, phase: "validating", validationError: null };

    case "VALIDATED":
      return {
        ...state,
        phase: "preview",
        rows: action.rows,
        groups: action.groups,
        summary: action.summary,
        refs: action.refs,
        startError: null,
        duplicateSubmission: false,
      };

    case "VALIDATION_FAILED":
      return { ...state, phase: "mapping", validationError: action.error };

    case "BACK_TO_MAPPING":
      return { ...state, phase: "mapping", validationError: null };

    case "SET_OPTIONS":
      return { ...state, options: action.options };

    case "TOGGLE_ROW_SKIP": {
      const rows = state.rows.map((r) =>
        r.rowNumber === action.rowNumber ? { ...r, skipped: !r.skipped } : r,
      );
      return { ...state, rows };
    }

    case "REVALIDATED":
      return { ...state, rows: action.rows, groups: action.groups, summary: action.summary };

    case "IMPORT_STARTED":
      return {
        ...state,
        phase: "importing",
        importId: action.importId,
        startError: null,
        duplicateSubmission: false,
        results: new Map(),
        progress: { ...EMPTY_PROGRESS, totalBatches: action.totalBatches, totalRows: action.totalRows },
      };

    case "START_FAILED":
      return { ...state, phase: "preview", startError: action.error, duplicateSubmission: action.duplicateSubmission };

    case "BATCH_DONE": {
      const results = new Map(state.results);
      for (const r of action.results) results.set(r.rowNumber, r);
      const progress = tallyResults(state.progress, action.results);
      progress.batchesDone += 1;
      progress.processedRows = Math.min(state.progress.totalRows, state.progress.processedRows + action.processedRows);
      return { ...state, results, progress };
    }

    case "REQUEST_CANCEL":
      return { ...state, progress: { ...state.progress, cancelRequested: true } };

    case "IMPORT_FINISHED":
      return {
        ...state,
        phase: "done",
        progress: { ...state.progress, finalStatus: action.finalStatus, errorMessage: action.errorMessage ?? null },
      };

    case "RESET":
      return { ...INITIAL_STATE, refs: state.refs };

    default:
      return state;
  }
}

// ── Source parsing & file checks (pure helpers used by StepUpload) ───────────

export type FileCheck = { ok: true } | { ok: false; error: string };

export function checkCsvFile(file: File): FileCheck {
  const name = file.name.toLowerCase();
  const okExt = /\.(csv|tsv|txt)$/.test(name);
  const okMime = !file.type || /^(text\/|application\/(csv|vnd\.ms-excel)$)/.test(file.type);
  if (!okExt) {
    return { ok: false, error: "Only .csv, .tsv or .txt files are supported. Excel files must be saved as CSV first (File → Save As → CSV UTF-8)." };
  }
  if (!okMime) {
    return { ok: false, error: `This file does not look like a text file (type "${file.type}").` };
  }
  if (file.size === 0) return { ok: false, error: "The file is empty." };
  if (file.size > IMPORT_LIMITS.maxFileBytes) {
    return { ok: false, error: `The file is larger than ${Math.round(IMPORT_LIMITS.maxFileBytes / (1024 * 1024))} MB. Split it into smaller files.` };
  }
  return { ok: true };
}

export type ParseOutcome =
  | { ok: true; parsed: ParsedSource }
  | { ok: false; error: string };

/** Parse CSV text into headers + data rows with limits and friendly errors. */
export function parseCsvSource(rawText: string): ParseOutcome {
  // Binary sniff — a NUL byte means this is not a text/CSV file.
  if (rawText.includes("\u0000")) {
    return { ok: false, error: "The file contains binary data — it is not a CSV file. If it came from Excel, use File → Save As → CSV UTF-8." };
  }
  // Heavy replacement-character presence means the file was not UTF-8.
  const replacements = (rawText.match(/�/g) ?? []).length;
  if (replacements > 4) {
    return { ok: false, error: "The file is not UTF-8 encoded — Khmer or accented characters would be destroyed. Re-save it as “CSV UTF-8”." };
  }

  const hasBom = rawText.charCodeAt(0) === 0xfeff;
  const text = hasBom ? rawText.slice(1) : rawText;
  if (!text.trim()) return { ok: false, error: "The CSV is empty." };

  const result = Papa.parse<string[]>(text.trim(), {
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t"],
  });

  const fatal = result.errors.find((e) => e.type === "Quotes" || e.type === "Delimiter");
  if (fatal && result.data.length <= 1) {
    const near = typeof fatal.row === "number" ? ` near row ${fatal.row + 1}` : "";
    return { ok: false, error: `The CSV structure could not be read${near}: ${fatal.message}. Check for an unclosed quotation mark.` };
  }

  const data = result.data.filter((r) => r.length > 0 && r.some((c) => c.trim() !== ""));
  if (data.length === 0) return { ok: false, error: "The CSV is empty." };
  if (data.length === 1) return { ok: false, error: "The CSV only contains a header row — there are no book rows to import." };

  const headers = data[0].map((h) => h.trim());
  if (headers.length > IMPORT_LIMITS.maxColumns) {
    return { ok: false, error: `The CSV has ${headers.length} columns — at most ${IMPORT_LIMITS.maxColumns} are supported.` };
  }
  const rows = data.slice(1);
  if (rows.length > IMPORT_LIMITS.maxRows) {
    return { ok: false, error: `The CSV has ${rows.length.toLocaleString()} rows — at most ${IMPORT_LIMITS.maxRows.toLocaleString()} rows per import. Split the file and import in parts.` };
  }

  return {
    ok: true,
    parsed: { headers, rows, delimiter: result.meta.delimiter ?? ",", hasBom, text: rawText },
  };
}

/** SHA-256 hex of the source text (Web Crypto). */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Trigger a client-side download of a text file (adds BOM for Excel). */
export function downloadTextFile(fileName: string, content: string, withBom = true) {
  const body = withBom && !content.startsWith("\uFEFF") ? "\uFEFF" + content : content;
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Derived import set (pure — used by preview, confirmation and import) ─────

import {
  buildImportGroups,
  refreshRowStatus,
  chunkGroups,
  summarizeValidation,
} from "@/lib/catalog-import";

/** Upgrade NEW_CATEGORY / NEW_DEPARTMENT warnings to errors in strict mode. */
export function applyStrictness(rows: ValidatedRow[], strict: boolean): ValidatedRow[] {
  return rows.map((r) => {
    let changed = false;
    const issues = r.issues.map((i) => {
      if (i.code === "NEW_CATEGORY" || i.code === "NEW_DEPARTMENT") {
        const severity = strict ? ("error" as const) : ("warning" as const);
        if (i.severity !== severity) { changed = true; return { ...i, severity }; }
      }
      return i;
    });
    return changed ? refreshRowStatus({ ...r, issues }) : r;
  });
}

export type ImportSet = {
  rows: ValidatedRow[];
  groups: ImportGroup[];
  batches: ImportGroup[][];
  summary: ValidationSummary;
  /** Book groups by outcome under the chosen duplicate strategy. */
  toCreate: number;
  toUpdate: number;
  toSkipDuplicates: number;
  importableRows: number;
  copiesPlanned: number;
};

/**
 * Compute exactly what an import would do under the current options: which
 * rows participate, the book groups, batches and headline counts shown on the
 * confirmation screen.
 */
export function deriveImportSet(rawRows: ValidatedRow[], options: ImportOptions): ImportSet {
  const strict = applyStrictness(rawRows, options.strictReferenceValues);
  // Warning rows excluded by options behave like skipped rows for grouping.
  const effective = strict.map((r) =>
    !options.includeWarnings && r.status === "warning" ? { ...r, skipped: true } : r,
  );
  const { groups, rows } = buildImportGroups(effective, { defaultOneCopy: options.defaultOneCopy });

  const dupGroups = groups.filter((g) => g.duplicateMatch);
  const freshGroups = groups.length - dupGroups.length;
  const strategy = options.duplicateStrategy;

  const activeGroups =
    strategy === "skip" ? groups.filter((g) => !g.duplicateMatch) : groups;

  return {
    rows,
    groups,
    batches: chunkGroups(groups),
    summary: summarizeValidation(rows, activeGroups),
    toCreate: freshGroups + (strategy === "create" ? dupGroups.length : 0),
    toUpdate: strategy === "update" ? dupGroups.length : 0,
    toSkipDuplicates: strategy === "skip" ? dupGroups.length : 0,
    importableRows: groups.reduce((n, g) => n + g.rowNumbers.length, 0)
      - (strategy === "skip" ? dupGroups.reduce((n, g) => n + g.rowNumbers.length, 0) : 0),
    copiesPlanned: activeGroups.reduce((n, g) => n + g.copies.length, 0),
  };
}
