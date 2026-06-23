"use client"
/* eslint-disable @typescript-eslint/no-explicit-any */

 
;
/* eslint-disable @typescript-eslint/no-unused-vars */

// app/admin/catalogs/add-copies/[bookId]/AddCopiesClient.tsx

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCopy } from "@/app/(admin)/admin/(protected)/catalogs/copy-actions";

// ── Types ──────────────────────────────────────────────────────────────────────
type CopyStatus = "available" | "checked_out" | "lost" | "damaged" | "on_order";

interface CopyRow {
  id: string;               // client-only key
  barcode: string;
  call_number: string;
  shelf_location: string;
  holding_library: string;
  status: CopyStatus;
  notes: string;
  saved: boolean;
  saving: boolean;
  error: string | null;
}

const STATUS_OPTS: { value: CopyStatus; label: string }[] = [
  { value: "available",   label: "Available"   },
  { value: "checked_out", label: "Checked Out" },
  { value: "lost",        label: "Lost"        },
  { value: "damaged",     label: "Damaged"     },
  { value: "on_order",    label: "On Order"    },
];

const STATUS_DOT: Record<CopyStatus, string> = {
  available:   "bg-emerald-500",
  checked_out: "bg-amber-400",
  lost:        "bg-red-400",
  damaged:     "bg-orange-400",
  on_order:    "bg-blue-400",
};

function makeRow(defaults: Partial<CopyRow> = {}): CopyRow {
  return {
    id: crypto.randomUUID(),
    barcode: "",
    call_number: "",
    shelf_location: "",
    holding_library: "PTEC Library",
    status: "available",
    notes: "",
    saved: false,
    saving: false,
    error: null,
    ...defaults,
  };
}

const inputCls = `
  w-full rounded-lg border border-divider bg-bg-surface px-3 py-2
  text-sm text-text-heading placeholder:text-text-muted
  outline-none transition
  focus:border-brand/60 focus:ring-2 focus:ring-focus-ring/12
  disabled:bg-paper disabled:text-text-muted
`;

// ── Component ──────────────────────────────────────────────────────────────────
export default function AddCopiesClient({
  bookId,
  bookSlug,
  defaultShelfLocation,
  defaultAccession,
}: {
  bookId: string;
  bookSlug: string;
  defaultShelfLocation: string;
  defaultAccession: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<CopyRow[]>([makeRow({ shelf_location: defaultShelfLocation })]);
  const [, startTransition] = useTransition();

  // ── Row helpers ──────────────────────────────────────────────────────────────
  function updateRow(id: string, patch: Partial<CopyRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    // Pre-fill shelf_location from the last row
    const last = rows[rows.length - 1];
    setRows((prev) => [
      ...prev,
      makeRow({
        shelf_location:  last?.shelf_location  || defaultShelfLocation,
        holding_library: last?.holding_library || "PTEC Library",
      }),
    ]);
  }

  function addManyRows(n: number) {
    const last = rows[rows.length - 1];
    const newRows = Array.from({ length: n }, () =>
      makeRow({
        shelf_location:  last?.shelf_location  || defaultShelfLocation,
        holding_library: last?.holding_library || "PTEC Library",
      })
    );
    setRows((prev) => [...prev, ...newRows]);
  }

  function removeRow(id: string) {
    setRows((prev) => {
      if (prev.length === 1) return prev; // keep at least one
      return prev.filter((r) => r.id !== id);
    });
  }

  // ── Save a single row ────────────────────────────────────────────────────────
  async function saveRow(row: CopyRow) {
    if (row.saved || row.saving) return;
    updateRow(row.id, { saving: true, error: null });

    try {
      const fd = new FormData();
      fd.set("barcode",         row.barcode);
      fd.set("call_number",     row.call_number);
      fd.set("shelf_location",  row.shelf_location);
      fd.set("holding_library", row.holding_library);
      fd.set("status",          row.status);
      fd.set("notes",           row.notes);
      await addCopy(bookId, fd);
      updateRow(row.id, { saved: true, saving: false });
    } catch (e: any) {
      updateRow(row.id, { saving: false, error: e.message ?? "Failed to save" });
    }
  }

  // ── Save all unsaved rows ────────────────────────────────────────────────────
  async function saveAll() {
    const unsaved = rows.filter((r) => !r.saved);
    for (const row of unsaved) {
      await saveRow(row);
    }
  }

  // ── Save all then navigate ───────────────────────────────────────────────────
  function handleFinish() {
    startTransition(async () => {
      await saveAll();
      router.push(`/admin/catalogs`);
    });
  }

  function handleGoToAdmin() {
    startTransition(async () => {
      await saveAll();
      router.push("/admin/catalogs");
    });
  }

  // ── Counts ───────────────────────────────────────────────────────────────────
  const savedCount   = rows.filter((r) => r.saved).length;
  const unsavedCount = rows.filter((r) => !r.saved).length;
  const hasErrors    = rows.some((r) => r.error);

  return (
    <div className="space-y-4">

      {/* Summary bar */}
      <div className="flex items-center justify-between rounded-xl border border-divider bg-bg-surface px-5 py-3 shadow-sm">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-text-muted">
            <span className="font-bold text-text-heading">{rows.length}</span> cop{rows.length !== 1 ? "ies" : "y"} total
          </span>
          {savedCount > 0 && (
            <span className="flex items-center gap-1.5 font-semibold text-emerald-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {savedCount} saved
            </span>
          )}
          {unsavedCount > 0 && (
            <span className="flex items-center gap-1.5 text-text-muted">
              <span className="h-2 w-2 rounded-full bg-paper" />
              {unsavedCount} pending
            </span>
          )}
        </div>

        {/* Quick-add buttons */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Quick add:</span>
          {[1, 3, 5, 10].map((n) => (
            <button key={n} type="button" onClick={() => addManyRows(n)}
              className="rounded-lg border border-divider px-2.5 py-1 text-xs font-semibold text-text-body transition hover:border-brand hover:text-brand"
            >
              +{n}
            </button>
          ))}
        </div>
      </div>

      {/* Copy rows */}
      <div className="space-y-3">
        {rows.map((row, idx) => (
          <div
            key={row.id}
            className={`rounded-2xl border bg-bg-surface shadow-sm transition-all ${
              row.saved
                ? "border-emerald-200 bg-emerald-50/40"
                : row.error
                ? "border-red-200"
                : "border-divider"
            }`}
          >
            {/* Row header */}
            <div className="flex items-center justify-between border-b border-divider px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-paper text-[11px] font-bold text-text-muted">
                  {idx + 1}
                </span>
                {row.saved ? (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Saved
                  </span>
                ) : row.barcode ? (
                  <span className="font-mono text-xs font-semibold text-text-muted">{row.barcode}</span>
                ) : (
                  <span className="text-xs text-text-muted">Copy {idx + 1}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* Save this row */}
                {!row.saved && (
                  <button type="button" onClick={() => saveRow(row)}
                    disabled={row.saving}
                    className="rounded-lg border border-brand/30 px-3 py-1 text-xs font-semibold text-brand transition hover:bg-brand/5 disabled:opacity-50"
                  >
                    {row.saving ? "Saving…" : "Save"}
                  </button>
                )}
                {/* Remove row (only if not saved) */}
                {!row.saved && rows.length > 1 && (
                  <button type="button" onClick={() => removeRow(row.id)}
                    className="rounded-lg p-1.5 text-text-muted transition hover:text-red-400"
                    aria-label="Remove row"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Fields */}
            <div className={`grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 ${row.saved ? "opacity-60 pointer-events-none" : ""}`}>

              {/* Barcode */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                  Barcode
                </label>
                <input
                  value={row.barcode}
                  onChange={(e) => updateRow(row.id, { barcode: e.target.value })}
                  disabled={row.saved}
                  className={inputCls}
                  placeholder="e.g. 001234"
                />
              </div>

              {/* Call Number */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                  Call Number
                </label>
                <input
                  value={row.call_number}
                  onChange={(e) => updateRow(row.id, { call_number: e.target.value })}
                  disabled={row.saved}
                  className={inputCls}
                  placeholder={`323 SOY 2023 Co${idx + 1}/${rows.length}`}
                />
              </div>

              {/* Shelf Location */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                  Shelf Location
                </label>
                <input
                  value={row.shelf_location}
                  onChange={(e) => updateRow(row.id, { shelf_location: e.target.value })}
                  disabled={row.saved}
                  className={inputCls}
                  placeholder={defaultShelfLocation || "A-1-01"}
                />
              </div>

              {/* Holding Library */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                  Holding Library
                </label>
                <input
                  value={row.holding_library}
                  onChange={(e) => updateRow(row.id, { holding_library: e.target.value })}
                  disabled={row.saved}
                  className={inputCls}
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                  Status
                </label>
                <div className="relative">
                  <span className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full ${STATUS_DOT[row.status]}`} />
                  <select
                    value={row.status}
                    onChange={(e) => updateRow(row.id, { status: e.target.value as CopyStatus })}
                    disabled={row.saved}
                    className={inputCls + " pl-7"}
                  >
                    {STATUS_OPTS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                  Notes <span className="font-normal normal-case text-text-muted">(optional)</span>
                </label>
                <input
                  value={row.notes}
                  onChange={(e) => updateRow(row.id, { notes: e.target.value })}
                  disabled={row.saved}
                  className={inputCls}
                  placeholder="e.g. Donated, damaged spine…"
                />
              </div>
            </div>

            {/* Error */}
            {row.error && (
              <p className="border-t border-red-100 px-5 py-2 text-xs font-semibold text-red-500">
                ⚠ {row.error}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Add another row button */}
      <button type="button">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        Add another copy
      </button>

      {/* Error summary */}
      {hasErrors && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
          Some copies failed to save. Fix the errors above and try again.
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between rounded-2xl border border-divider bg-bg-surface px-6 py-4 shadow-sm">
        <button type="button">
          Save &amp; go to admin
        </button>

        <button type="button">
          Save &amp; Finish →
        </button>
      </div>
    </div>
  );
}