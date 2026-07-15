"use client";
// Step 3 — validation summary, preview table, import options, confirmation.
//
// Nothing has been written yet when this step renders. The table is paginated
// (never thousands of DOM rows), filterable by status, searchable, and every
// row expands to show its issues, normalized values and duplicate match.
// Status is always conveyed with text — never color alone.

import { useMemo, useState, type Dispatch } from "react";
import {
  buildFailedRowsCsv,
  type RowStatus,
  type ValidatedRow,
} from "@/lib/catalog-import";
import { downloadTextFile, type ImportSet, type WizardAction, type WizardState } from "./wizard-state";

const PAGE_SIZE = 50;

type Filter = "all" | RowStatus | "skipped";

const STATUS_BADGE: Record<RowStatus | "skipped", { label: string; cls: string; icon: string }> = {
  ready:     { label: "Ready",     cls: "bg-emerald-50 border-emerald-200 text-emerald-700", icon: "✓" },
  warning:   { label: "Warning",   cls: "bg-amber-50 border-amber-200 text-amber-700",       icon: "!" },
  error:     { label: "Error",     cls: "bg-red-50 border-red-200 text-red-600",             icon: "✕" },
  duplicate: { label: "Duplicate", cls: "bg-sky-50 border-sky-200 text-sky-700",             icon: "≡" },
  skipped:   { label: "Skipped",   cls: "bg-paper border-divider text-text-muted",           icon: "–" },
};

export default function StepValidate({
  state,
  dispatch,
  importSet,
}: {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
  importSet: ImportSet | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);

  const rows = importSet?.rows ?? state.rows;
  const summary = importSet?.summary ?? state.summary;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const status: Filter = r.skipped ? "skipped" : r.status;
      if (filter !== "all" && status !== filter) return false;
      if (!q) return true;
      return (
        r.normalized.title.toLowerCase().includes(q) ||
        r.normalized.author.toLowerCase().includes(q) ||
        (r.normalized.isbn ?? "").includes(q) ||
        (r.normalized.barcode ?? "").toLowerCase().includes(q) ||
        String(r.rowNumber) === q
      );
    });
  }, [rows, filter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (state.phase === "validating") {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-text-muted" role="status" aria-live="polite">
        <svg className="h-8 w-8 animate-spin text-brand" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
        </svg>
        <p className="text-sm font-semibold">Validating rows and checking the catalog for duplicates…</p>
      </div>
    );
  }

  if (!summary || !importSet) return null;

  const cards: { label: string; value: number; tone: string; f: Filter }[] = [
    { label: "Total rows", value: summary.total, tone: "text-text-heading", f: "all" },
    { label: "Ready", value: summary.ready, tone: "text-emerald-600", f: "ready" },
    { label: "Warnings", value: summary.warnings, tone: "text-amber-600", f: "warning" },
    { label: "Errors", value: summary.errors, tone: "text-red-500", f: "error" },
    { label: "Duplicates", value: summary.duplicates, tone: "text-sky-600", f: "duplicate" },
  ];

  const opts = state.options;
  const setOpts = (patch: Partial<typeof opts>) => dispatch({ type: "SET_OPTIONS", options: { ...opts, ...patch } });
  const nothingToImport = importSet.toCreate + importSet.toUpdate === 0;

  return (
    <div className="space-y-4">
      {/* Completion message */}
      <p className="text-sm text-text-body" role="status">
        Validation completed.{" "}
        <span className="font-bold text-text-heading">
          {importSet.importableRows.toLocaleString()} of {summary.total.toLocaleString()} rows
        </span>{" "}
        will be imported with the current options.
      </p>

      {/* Summary cards (double as filters) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" aria-label="Validation summary — click a card to filter">
        {cards.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => { setFilter(c.f); setPage(1); }}
            aria-pressed={filter === c.f}
            className={`rounded-xl border p-3 text-left transition ${
              filter === c.f ? "border-brand bg-brand/5 ring-1 ring-brand/30" : "border-divider bg-bg-surface hover:bg-paper"
            }`}
          >
            <p className="text-[11px] font-semibold text-text-muted">{c.label}</p>
            <p className={`mt-0.5 text-xl font-bold ${c.tone}`}>{c.value.toLocaleString()}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search title, author, ISBN, barcode or row number…"
          aria-label="Search preview rows"
          className="h-9 w-full max-w-sm rounded-lg border border-divider bg-paper px-3 text-xs text-text-body outline-none focus:border-brand focus:ring-2 focus:ring-focus-ring/15"
        />
        <span className="text-xs text-text-muted" aria-live="polite">
          {filtered.length.toLocaleString()} row{filtered.length === 1 ? "" : "s"} shown
        </span>
      </div>

      {/* Preview table */}
      <div className="overflow-hidden rounded-2xl border border-divider bg-bg-surface">
        <div className="max-h-[340px] overflow-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Validation preview</caption>
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-divider bg-paper">
                {["Row", "Status", "Title / Author", "ISBN", "Copies", "Issues", ""].map((h, i) => (
                  <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-divider/60">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-text-muted">
                    No rows match this filter.
                  </td>
                </tr>
              ) : pageRows.map((r) => {
                const key: RowStatus | "skipped" = r.skipped ? "skipped" : r.status;
                const badge = STATUS_BADGE[key];
                const isOpen = expanded === r.rowNumber;
                return (
                  <RowLine
                    key={r.rowNumber}
                    row={r}
                    badge={badge}
                    isOpen={isOpen}
                    onToggle={() => setExpanded(isOpen ? null : r.rowNumber)}
                    onSkipToggle={() => dispatch({ type: "TOGGLE_ROW_SKIP", rowNumber: r.rowNumber })}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <nav className="flex items-center justify-between border-t border-divider bg-paper/50 px-3 py-2 text-xs" aria-label="Preview pagination">
            <button type="button" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}
              className="rounded-lg border border-divider px-3 py-1 font-semibold text-text-body transition hover:bg-paper disabled:opacity-40">
              ← Previous
            </button>
            <span className="text-text-muted">Page {safePage} of {pageCount}</span>
            <button type="button" disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}
              className="rounded-lg border border-divider px-3 py-1 font-semibold text-text-body transition hover:bg-paper disabled:opacity-40">
              Next →
            </button>
          </nav>
        )}
      </div>

      {summary.errors > 0 && (
        <button type="button"
          onClick={() => downloadTextFile(`ptec-book-import-errors-${new Date().toISOString().slice(0, 10)}.csv`, buildFailedRowsCsv(rows, new Map()), false)}
          className="text-xs font-semibold text-brand hover:underline">
          ↓ Download {summary.errors} error row{summary.errors === 1 ? "" : "s"} as CSV (fix and re-import)
        </button>
      )}

      {/* Options panel */}
      <fieldset className="rounded-2xl border border-divider bg-paper/50 p-4">
        <legend className="px-1 text-xs font-bold uppercase tracking-wider text-text-muted">Import options</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-bold text-text-heading">Books that already exist in the catalog</p>
            <div className="space-y-1.5" role="radiogroup" aria-label="Duplicate strategy">
              {([
                ["skip", "Skip them (safest — nothing is changed)"],
                ["update", "Fill in missing details only, and add new copies"],
                ["create", "Create separate records anyway"],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex cursor-pointer items-start gap-2 text-xs text-text-body">
                  <input
                    type="radio"
                    name="dup-strategy"
                    checked={opts.duplicateStrategy === value}
                    onChange={() => setOpts({ duplicateStrategy: value })}
                    className="mt-0.5 accent-[var(--color-brand,#2563eb)]"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="mb-1.5 text-xs font-bold text-text-heading">Rows &amp; reference values</p>
            <label className="flex cursor-pointer items-start gap-2 text-xs text-text-body">
              <input type="checkbox" checked={opts.includeWarnings} onChange={(e) => setOpts({ includeWarnings: e.target.checked })} className="mt-0.5" />
              <span>Import rows that have warnings</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-xs text-text-body">
              <input type="checkbox" checked={opts.defaultOneCopy} onChange={(e) => setOpts({ defaultOneCopy: e.target.checked })} className="mt-0.5" />
              <span>Create one copy for rows without a barcode or copies count</span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-xs text-text-body">
              <input type="checkbox" checked={opts.strictReferenceValues} onChange={(e) => setOpts({ strictReferenceValues: e.target.checked })} className="mt-0.5" />
              <span>Treat new category / department values as errors (strict mode)</span>
            </label>
            {(summary.newCategories.length > 0 || summary.newDepartments.length > 0) && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800">
                {summary.newCategories.length > 0 && (
                  <p><span className="font-bold">{summary.newCategories.length} new categor{summary.newCategories.length === 1 ? "y" : "ies"}:</span> {summary.newCategories.slice(0, 6).join(", ")}{summary.newCategories.length > 6 ? "…" : ""}</p>
                )}
                {summary.newDepartments.length > 0 && (
                  <p><span className="font-bold">{summary.newDepartments.length} new department{summary.newDepartments.length === 1 ? "" : "s"}:</span> {summary.newDepartments.slice(0, 6).join(", ")}{summary.newDepartments.length > 6 ? "…" : ""}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </fieldset>

      {/* Confirmation summary */}
      <div
        className={`rounded-2xl border p-4 ${nothingToImport ? "border-red-200 bg-red-50/60" : "border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/25 dark:bg-emerald-500/5"}`}
        aria-live="polite"
      >
        {nothingToImport ? (
          <>
            <p className="font-bold text-red-700">Nothing can be imported with the current selection.</p>
            <p className="mt-1 text-xs text-red-600">
              Fix the errors in your CSV (download the error rows above), go back to mapping, or adjust the options.
            </p>
          </>
        ) : (
          <>
            <p className="font-bold text-text-heading">
              Ready to import {importSet.toCreate.toLocaleString()} new book{importSet.toCreate === 1 ? "" : "s"}
              {importSet.toUpdate > 0 && <> and update {importSet.toUpdate.toLocaleString()}</>}
            </p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-text-body">
              <li>• {importSet.copiesPlanned.toLocaleString()} physical cop{importSet.copiesPlanned === 1 ? "y" : "ies"} will be created</li>
              {importSet.toSkipDuplicates > 0 && <li>• {importSet.toSkipDuplicates.toLocaleString()} duplicate book{importSet.toSkipDuplicates === 1 ? "" : "s"} will be skipped and reported</li>}
              {summary.errors > 0 && <li>• {summary.errors.toLocaleString()} invalid row{summary.errors === 1 ? "" : "s"} will not be imported</li>}
              {!opts.includeWarnings && summary.warnings > 0 && <li>• {summary.warnings.toLocaleString()} warning row{summary.warnings === 1 ? "" : "s"} will be excluded</li>}
              {summary.skipped > 0 && <li>• {summary.skipped.toLocaleString()} row{summary.skipped === 1 ? "" : "s"} manually skipped</li>}
              {summary.newCategories.length > 0 && !opts.strictReferenceValues && <li>• {summary.newCategories.length} new category value{summary.newCategories.length === 1 ? "" : "s"} will be introduced</li>}
              {summary.driveLinksConverted > 0 && <li>• {summary.driveLinksConverted.toLocaleString()} Google Drive cover link{summary.driveLinksConverted === 1 ? "" : "s"} converted</li>}
            </ul>
          </>
        )}
        {state.startError && (
          <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <p className="font-bold">{state.startError}</p>
            {state.duplicateSubmission && (
              <p className="mt-1">
                Use the button below only if you really intend to import this file again.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Row + expandable details ──────────────────────────────────────────────────

function RowLine({
  row,
  badge,
  isOpen,
  onToggle,
  onSkipToggle,
}: {
  row: ValidatedRow;
  badge: { label: string; cls: string; icon: string };
  isOpen: boolean;
  onToggle: () => void;
  onSkipToggle: () => void;
}) {
  const copies = row.normalized.copies_total ?? (row.normalized.barcode || row.normalized.accession_number ? 1 : null);
  return (
    <>
      <tr className={`transition hover:bg-paper/40 ${row.skipped ? "opacity-50" : ""}`}>
        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-text-muted">{row.rowNumber}</td>
        <td className="whitespace-nowrap px-3 py-2">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${badge.cls}`}>
            <span aria-hidden>{badge.icon}</span> {badge.label}
          </span>
        </td>
        <td className="max-w-[240px] px-3 py-2">
          <p className="truncate text-xs font-semibold text-text-heading">{row.normalized.title || <span className="italic font-normal text-red-500">missing title</span>}</p>
          <p className="truncate text-[11px] text-text-muted">{row.normalized.author || <span className="italic text-red-400">missing author</span>}</p>
        </td>
        <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-text-muted">{row.normalized.isbn ?? "—"}</td>
        <td className="whitespace-nowrap px-3 py-2 text-xs text-text-muted">{copies ?? "—"}</td>
        <td className="max-w-[220px] px-3 py-2">
          <p className="truncate text-[11px] text-text-muted">
            {row.issues.length === 0 ? "—" : row.issues[0].message}
            {row.issues.length > 1 && <span className="font-semibold"> +{row.issues.length - 1} more</span>}
          </p>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-right">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? "Hide" : "Show"} details for row ${row.rowNumber}`}
            className="rounded-lg border border-divider px-2 py-1 text-[11px] font-semibold text-text-body transition hover:bg-paper"
          >
            {isOpen ? "Hide" : "Details"}
          </button>
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-paper/40">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <p className="mb-1 font-bold text-text-heading">Issues</p>
                {row.issues.length === 0 ? (
                  <p className="text-text-muted">No issues — this row is ready.</p>
                ) : (
                  <ul className="space-y-1">
                    {row.issues.map((i, idx) => (
                      <li key={idx} className={i.severity === "error" ? "text-red-600" : "text-amber-700"}>
                        <span className="font-mono text-[10px] font-bold">{i.code}</span> — {i.message}
                      </li>
                    ))}
                  </ul>
                )}
                {row.duplicateMatch && (
                  <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-sky-800">
                    Matches existing record <span className="font-bold">“{row.duplicateMatch.existingTitle}”</span>{" "}
                    (by {row.duplicateMatch.matchedBy === "isbn" ? "ISBN" : "title + author"}).
                  </p>
                )}
              </div>
              <div>
                <p className="mb-1 font-bold text-text-heading">Normalized values</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-text-muted">
                  {([
                    ["Language", row.normalized.language],
                    ["Category", row.normalized.category ?? "—"],
                    ["Department", row.normalized.department ?? "—"],
                    ["Shelf", row.normalized.shelf_location ?? "—"],
                    ["Barcode", row.normalized.barcode ?? "—"],
                    ["Accession", row.normalized.accession_number ?? "—"],
                    ["Year", row.normalized.year ?? "—"],
                    ["Cover", coverLabel(row)],
                    ["Keywords", row.normalized.keywords.join(", ") || "—"],
                  ] as const).map(([k, v]) => (
                    <FragmentRow key={k} k={k} v={String(v)} />
                  ))}
                </dl>
                <button
                  type="button"
                  onClick={onSkipToggle}
                  className={`mt-2 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                    row.skipped
                      ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      : "border-divider text-text-body hover:bg-paper"
                  }`}
                >
                  {row.skipped ? "Restore row" : "Skip this row"}
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function FragmentRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="font-semibold text-text-body">{k}</dt>
      <dd className="truncate">{v}</dd>
    </>
  );
}

function coverLabel(row: ValidatedRow): string {
  switch (row.normalized.cover_status) {
    case "none": return "none";
    case "valid": return "URL ok";
    case "converted": return "Drive link converted";
    case "insecure": return "dropped (http)";
    case "invalid": return "dropped (invalid)";
  }
}
