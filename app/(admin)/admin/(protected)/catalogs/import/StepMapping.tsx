"use client";
// Step 2 — map CSV columns to catalog fields.
//
// Auto-mapping already ran when the source was parsed (exact names, known
// aliases, conservative fuzzy matches). This step shows every source column
// with sample values so low-confidence matches get human eyes before any
// validation happens. Two columns can never target the same destination —
// the reducer unmaps the previous holder.

import type { Dispatch } from "react";
import {
  IMPORT_FIELDS,
  REQUIRED_FIELDS,
  missingRequiredFields,
  type BookImportField,
} from "@/lib/catalog-import";
import type { WizardAction, WizardState } from "./wizard-state";

const FIELD_LABEL: Record<BookImportField, string> = {
  title: "Title", author: "Author", isbn: "ISBN", publisher: "Publisher",
  year: "Year", language: "Language", category: "Category", department: "Department",
  shelf_location: "Shelf location", copies_total: "Copies total", description: "Description",
  accession_number: "Accession number", barcode: "Barcode", cover_url: "Cover URL", keywords: "Keywords",
};

export default function StepMapping({ state, dispatch }: { state: WizardState; dispatch: Dispatch<WizardAction> }) {
  const missing = missingRequiredFields(state.mappings);
  const mappedCount = state.mappings.filter((m) => m.destination !== "ignore").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-text-muted">
          <span className="font-semibold text-text-heading">{mappedCount}</span> of{" "}
          {state.mappings.length} columns mapped
          {state.parsed && <> · {state.parsed.rows.length.toLocaleString()} data rows</>}
        </p>
        {missing.length > 0 ? (
          <p className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-600" role="status">
            Map the required column{missing.length === 1 ? "" : "s"}: {missing.map((f) => FIELD_LABEL[f]).join(", ")}
          </p>
        ) : (
          <p className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700" role="status">
            ✓ All required columns mapped
          </p>
        )}
      </div>

      {state.validationError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="font-bold">Validation could not run</p>
          <p className="mt-0.5">{state.validationError}</p>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-divider bg-bg-surface">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Column mapping</caption>
          <thead>
            <tr className="border-b border-divider bg-paper/60">
              {["CSV column", "Sample values", "Maps to", "Status"].map((h) => (
                <th key={h} scope="col" className="whitespace-nowrap px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-divider/60">
            {state.mappings.map((m) => {
              const isRequired = m.destination !== "ignore" && (REQUIRED_FIELDS as string[]).includes(m.destination);
              const status =
                m.destination === "ignore"
                  ? { label: "Ignored", cls: "bg-paper border-divider text-text-muted" }
                  : m.manuallyChanged
                    ? { label: "Manual", cls: "bg-sky-50 border-sky-200 text-sky-700" }
                    : m.confidence >= 0.9
                      ? { label: "Matched", cls: "bg-emerald-50 border-emerald-200 text-emerald-700" }
                      : { label: "Check match", cls: "bg-amber-50 border-amber-200 text-amber-700" };
              return (
                <tr key={m.sourceIndex} className={m.destination === "ignore" ? "opacity-60" : ""}>
                  <td className="max-w-[180px] px-4 py-2.5">
                    <p className="truncate font-mono text-xs font-semibold text-text-heading">{m.sourceHeader}</p>
                  </td>
                  <td className="max-w-[220px] px-4 py-2.5">
                    <p className="truncate text-xs text-text-muted">
                      {m.sampleValues.filter(Boolean).slice(0, 2).join(" · ") || <span className="italic">empty</span>}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={m.destination}
                      onChange={(e) =>
                        dispatch({
                          type: "SET_MAPPING",
                          sourceIndex: m.sourceIndex,
                          destination: e.target.value as BookImportField | "ignore",
                        })
                      }
                      aria-label={`Destination field for column ${m.sourceHeader}`}
                      className="h-9 rounded-lg border border-divider bg-paper px-2.5 text-xs font-semibold text-text-body outline-none focus:border-brand focus:ring-2 focus:ring-focus-ring/15"
                    >
                      <option value="ignore">— Ignore this column —</option>
                      {IMPORT_FIELDS.map((f) => (
                        <option key={f} value={f}>
                          {FIELD_LABEL[f]}{(REQUIRED_FIELDS as string[]).includes(f) ? " *" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${status.cls}`}>
                      {status.label}
                      {isRequired && <span className="ml-1 font-normal">· required</span>}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-text-muted">
        Columns marked <span className="font-semibold text-amber-700">Check match</span> were guessed from a similar
        name — confirm they point to the right field. Ignored columns are not imported.
      </p>
    </div>
  );
}
