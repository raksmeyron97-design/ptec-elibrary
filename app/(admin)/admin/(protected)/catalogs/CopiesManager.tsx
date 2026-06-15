"use client"
/* eslint-disable @typescript-eslint/no-explicit-any */

 
;
/* eslint-disable @typescript-eslint/no-unused-vars */

// app/admin/catalogs/CopiesManager.tsx
// Inline panel (shown per-book in the admin table) for managing individual copy records.

import { useState, useTransition, useEffect } from "react";
import {
  fetchCopiesForBook,
  addCopy,
  updateCopyStatus,
  updateCopy,
  deleteCopy,
  bulkAddCopies,
} from "./copy-actions";
import type { CatalogCopy, CopyStatus } from "./copy-actions";
import Icon from "@/components/ui/core/Icon";

// ── Helpers ────────────────────────────────────────────────────────────────────
const STATUS_OPTS: { value: CopyStatus; label: string }[] = [
  { value: "available",   label: "Available"   },
  { value: "checked_out", label: "Checked Out" },
  { value: "lost",        label: "Lost"        },
  { value: "damaged",     label: "Damaged"     },
  { value: "on_order",    label: "On Order"    },
];

const STATUS_COLOR: Record<CopyStatus, string> = {
  available:   "text-emerald-700 bg-emerald-50 border-emerald-200",
  checked_out: "text-amber-700 bg-amber-50 border-amber-200",
  lost:        "text-red-600 bg-red-50 border-red-200",
  damaged:     "text-orange-600 bg-orange-50 border-orange-200",
  on_order:    "text-brand bg-brand/5 border-blue-200",
};

const STATUS_DOT: Record<CopyStatus, string> = {
  available:   "bg-emerald-500",
  checked_out: "bg-amber-400",
  lost:        "bg-red-400",
  damaged:     "bg-orange-400",
  on_order:    "bg-blue-400",
};

const inputCls = `
  w-full rounded-lg border border-divider bg-paper px-2.5 py-1.5
  text-xs text-text-heading placeholder:text-text-muted
  outline-none focus:border-brand focus:ring-1 focus:ring-focus-ring/20
`;

// ── CopiesManager ──────────────────────────────────────────────────────────────
export default function CopiesManager({
  bookId,
  bookShelfLocation,
}: {
  bookId: string;
  bookShelfLocation?: string | null;
}) {
  const [open, setOpen]               = useState(false);
  const [copies, setCopies]           = useState<CatalogCopy[]>([]);
  const [loading, setLoading]         = useState(false);
  const [tab, setTab]                 = useState<"list" | "add" | "bulk">("list");
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [isPending, startTransition]  = useTransition();
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState<string | null>(null);

  // Add-copy form state
  const [addForm, setAddForm] = useState({
    barcode: "", call_number: "", shelf_location: "", holding_library: "PTEC Library", status: "available" as CopyStatus, notes: "",
  });

  // Edit form state (mirrors addForm fields)
  const [editForm, setEditForm] = useState({ ...addForm });

  // Bulk add
  const [bulkBarcodes, setBulkBarcodes]       = useState("");
  const [bulkCallNumber, setBulkCallNumber]   = useState("");
  const [bulkShelf, setBulkShelf]             = useState("");

  async function loadCopies() {
    setLoading(true);
    try {
      const data = await fetchCopiesForBook(bookId);
      setCopies(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    loadCopies();
  }

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setSuccess(null); }
    else          { setSuccess(msg); setError(null); }
    setTimeout(() => { setError(null); setSuccess(null); }, 3000);
  }

  // ── Add copy ────────────────────────────────────────────────────────────────
  function handleAdd() {
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        Object.entries(addForm).forEach(([k, v]) => fd.set(k, v));
        await addCopy(bookId, fd);
        setAddForm({ barcode: "", call_number: "", shelf_location: "", holding_library: "PTEC Library", status: "available", notes: "" });
        await loadCopies();
        setTab("list");
        flash("Copy added successfully!");
      } catch (e: any) { flash(e.message, true); }
    });
  }

  // ── Start editing ───────────────────────────────────────────────────────────
  function startEdit(copy: CatalogCopy) {
    setEditingId(copy.id);
    setEditForm({
      barcode:         copy.barcode         ?? "",
      call_number:     copy.call_number     ?? "",
      shelf_location:  copy.shelf_location  ?? "",
      holding_library: copy.holding_library,
      status:          copy.status,
      notes:           copy.notes           ?? "",
    });
  }

  // ── Save edit ───────────────────────────────────────────────────────────────
  function handleSaveEdit(copyId: string) {
    startTransition(async () => {
      try {
        const fd = new FormData();
        Object.entries(editForm).forEach(([k, v]) => fd.set(k, v));
        await updateCopy(copyId, fd);
        setEditingId(null);
        await loadCopies();
        flash("Copy updated!");
      } catch (e: any) { flash(e.message, true); }
    });
  }

  // ── Quick status toggle ─────────────────────────────────────────────────────
  function handleStatusChange(copyId: string, status: CopyStatus) {
    startTransition(async () => {
      try {
        await updateCopyStatus(copyId, status);
        await loadCopies();
        flash("Status updated!");
      } catch (e: any) { flash(e.message, true); }
    });
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  function handleDelete(copyId: string) {
    if (!confirm("Delete this copy? This cannot be undone.")) return;
    startTransition(async () => {
      try {
        await deleteCopy(copyId);
        await loadCopies();
        flash("Copy deleted.");
      } catch (e: any) { flash(e.message, true); }
    });
  }

  // ── Bulk add ────────────────────────────────────────────────────────────────
  function handleBulkAdd() {
    const barcodes = bulkBarcodes.split(/[\n,]+/).map((b) => b.trim()).filter(Boolean);
    if (barcodes.length === 0) { flash("Enter at least one barcode.", true); return; }
    startTransition(async () => {
      try {
        const res = await bulkAddCopies(bookId, barcodes, {
          call_number:     bulkCallNumber || undefined,
          shelf_location:  bulkShelf      || undefined,
          holding_library: "PTEC Library",
        });
        setBulkBarcodes(""); setBulkCallNumber(""); setBulkShelf("");
        await loadCopies();
        setTab("list");
        flash(`${res.added} cop${res.added !== 1 ? "ies" : "y"} added!`);
      } catch (e: any) { flash(e.message, true); }
    });
  }

  const availableCount  = copies.filter((c) => c.status === "available").length;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={handleOpen}
        className="relative text-text-muted transition hover:text-brand"
        title="Manage Copies"
      >
        <Icon name="library" className="w-5 h-5" />
        {copies.length > 0 && !open && (
          <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand text-[8px] font-bold text-white ring-2 ring-bg-surface">
            {copies.length}
          </span>
        )}
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 pt-16 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-bg-surface shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-divider bg-paper px-6 py-4">
              <div>
                <h2 className="font-bold text-text-heading">Manage Physical Copies</h2>
                <p className="text-xs text-text-muted mt-0.5">
                  {copies.length} cop{copies.length !== 1 ? "ies" : "y"} · {availableCount} available
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-body transition">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-divider px-6">
              {(["list", "add", "bulk"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`py-3 px-3 text-xs font-semibold border-b-2 transition -mb-px ${
                    tab === t
                      ? "border-brand text-brand"
                      : "border-transparent text-text-muted hover:text-text-body"
                  }`}
                >
                  {t === "list" ? "All Copies" : t === "add" ? "+ Add Copy" : "+ Bulk Add"}
                </button>
              ))}
            </div>

            <div className="p-6 space-y-4">

              {/* Flash messages */}
              {error   && <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-xs font-semibold text-red-600">{error}</p>}
              {success && <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-700">{success}</p>}

              {/* ── LIST TAB ── */}
              {tab === "list" && (
                <>
                  {loading ? (
                    <div className="flex items-center justify-center py-10">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                    </div>
                  ) : copies.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-divider py-10 text-center">
                      <p className="text-sm font-semibold text-text-muted">No copies yet</p>
                      <p className="text-xs text-text-muted mt-1">Add individual copies using the tabs above.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                      {copies.map((copy) => (
                        <div key={copy.id} className={`rounded-xl border p-4 ${STATUS_COLOR[copy.status].split(" ").slice(1).join(" ")}`}>
                          {editingId === copy.id ? (
                            /* ── Edit form ── */
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">Barcode</label>
                                  <input value={editForm.barcode} onChange={(e) => setEditForm({...editForm, barcode: e.target.value})} className={inputCls} placeholder="001234" />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">Status</label>
                                  <select value={editForm.status} onChange={(e) => setEditForm({...editForm, status: e.target.value as CopyStatus})} className={inputCls}>
                                    {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">Call Number</label>
                                  <input value={editForm.call_number} onChange={(e) => setEditForm({...editForm, call_number: e.target.value})} className={inputCls} placeholder="323 SOY 2023 Co1/5" />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">Shelf Location</label>
                                  <input value={editForm.shelf_location} onChange={(e) => setEditForm({...editForm, shelf_location: e.target.value})} className={inputCls} placeholder={bookShelfLocation ?? "A-1-01"} />
                                </div>
                                <div className="col-span-2">
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">Holding Library</label>
                                  <input value={editForm.holding_library} onChange={(e) => setEditForm({...editForm, holding_library: e.target.value})} className={inputCls} />
                                </div>
                                <div className="col-span-2">
                                  <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">Notes</label>
                                  <input value={editForm.notes} onChange={(e) => setEditForm({...editForm, notes: e.target.value})} className={inputCls} placeholder="Optional note" />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => handleSaveEdit(copy.id)} disabled={isPending} className="flex-1 rounded-lg bg-brand py-1.5 text-xs font-bold text-white transition hover:bg-brand-hover disabled:opacity-50">
                                  {isPending ? "Saving…" : "Save"}
                                </button>
                                <button onClick={() => setEditingId(null)} className="rounded-lg border border-divider px-3 py-1.5 text-xs text-text-muted hover:bg-paper">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* ── Display row ── */
                            <div className="flex items-start gap-3">
                              <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[copy.status]}`} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-sm font-bold text-text-heading">
                                    {copy.barcode ?? <span className="text-text-muted font-normal text-xs">No barcode</span>}
                                  </span>
                                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_COLOR[copy.status]}`}>
                                    {STATUS_OPTS.find((o) => o.value === copy.status)?.label}
                                  </span>
                                </div>
                                <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-text-muted">
                                  <span><span className="text-text-muted">Library:</span> {copy.holding_library}</span>
                                  <span><span className="text-text-muted">Shelf:</span> {copy.shelf_location ?? bookShelfLocation ?? "—"}</span>
                                  {copy.call_number && <span className="col-span-2"><span className="text-text-muted">Call No.:</span> <span className="font-mono">{copy.call_number}</span></span>}
                                  {copy.notes && <span className="col-span-2 italic text-text-muted">{copy.notes}</span>}
                                </div>
                              </div>
                              {/* Quick status select */}
                              <select
                                value={copy.status}
                                onChange={(e) => handleStatusChange(copy.id, e.target.value as CopyStatus)}
                                disabled={isPending}
                                className="shrink-0 rounded-lg border border-divider bg-bg-surface px-1.5 py-1 text-[10px] font-semibold text-text-body outline-none focus:border-brand disabled:opacity-50"
                              >
                                {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                              <button onClick={() => startEdit(copy)} className="shrink-0 rounded-lg border border-divider px-2 py-1 text-[10px] font-semibold text-text-muted hover:border-brand hover:text-brand transition">
                                Edit
                              </button>
                              <button onClick={() => handleDelete(copy.id)} disabled={isPending} className="shrink-0 rounded-lg border border-divider px-2 py-1 text-[10px] font-semibold text-text-muted hover:border-red-300 hover:text-red-500 transition disabled:opacity-50">
                                ×
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ── ADD TAB ── */}
              {tab === "add" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">Barcode</label>
                      <input value={addForm.barcode} onChange={(e) => setAddForm({...addForm, barcode: e.target.value})} className={inputCls} placeholder="001234" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">Status</label>
                      <select value={addForm.status} onChange={(e) => setAddForm({...addForm, status: e.target.value as CopyStatus})} className={inputCls}>
                        {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">Call Number</label>
                      <input value={addForm.call_number} onChange={(e) => setAddForm({...addForm, call_number: e.target.value})} className={inputCls} placeholder="323 SOY 2023 Co1/5" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">Shelf Location</label>
                      <input value={addForm.shelf_location} onChange={(e) => setAddForm({...addForm, shelf_location: e.target.value})} className={inputCls} placeholder={bookShelfLocation ?? "A-1-01"} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">Holding Library</label>
                      <input value={addForm.holding_library} onChange={(e) => setAddForm({...addForm, holding_library: e.target.value})} className={inputCls} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">Notes (optional)</label>
                      <input value={addForm.notes} onChange={(e) => setAddForm({...addForm, notes: e.target.value})} className={inputCls} placeholder="e.g. Damaged spine" />
                    </div>
                  </div>
                  <button onClick={handleAdd} disabled={isPending} className="w-full rounded-xl bg-gradient-to-br from-blue-950 to-brand py-2.5 text-sm font-semibold text-white shadow transition hover:shadow-lg disabled:opacity-50">
                    {isPending ? "Adding…" : "Add Copy"}
                  </button>
                </div>
              )}

              {/* ── BULK ADD TAB ── */}
              {tab === "bulk" && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-brand/5 border border-blue-100 p-4">
                    <p className="text-xs text-brand font-semibold mb-1">Bulk Add</p>
                    <p className="text-[11px] text-brand">Enter one barcode per line (or comma-separated). All copies will be created as <strong>Available</strong> and share the same call number and shelf location.</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">Barcodes</label>
                    <textarea
                      value={bulkBarcodes}
                      onChange={(e) => setBulkBarcodes(e.target.value)}
                      rows={5}
                      placeholder={"001234\n001235\n001236"}
                      className="w-full rounded-lg border border-divider bg-paper px-3 py-2 font-mono text-xs text-text-heading placeholder:text-text-muted outline-none focus:border-brand focus:ring-1 focus:ring-focus-ring/20 resize-none"
                    />
                    <p className="mt-1 text-[10px] text-text-muted">
                      {bulkBarcodes.split(/[\n,]+/).filter((b) => b.trim()).length} barcode(s) detected
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">Call Number (shared)</label>
                      <input value={bulkCallNumber} onChange={(e) => setBulkCallNumber(e.target.value)} className={inputCls} placeholder="323 SOY 2023 Co1/5" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">Shelf Location (shared)</label>
                      <input value={bulkShelf} onChange={(e) => setBulkShelf(e.target.value)} className={inputCls} placeholder={bookShelfLocation ?? "A-1-01"} />
                    </div>
                  </div>
                  <button onClick={handleBulkAdd} disabled={isPending} className="w-full rounded-xl bg-gradient-to-br from-blue-950 to-brand py-2.5 text-sm font-semibold text-white shadow transition hover:shadow-lg disabled:opacity-50">
                    {isPending ? "Adding…" : "Bulk Add Copies"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}