"use client";
// app/admin/catalogs/CopiesPanel.tsx
// The physical-copy management interface for one catalog record.
// Used by: the edit page ("Physical Copies" tab), the add-book flow (step 2)
// and /admin/catalogs/add-copies/[bookId].
//
// Layout: existing copies first (always visible), then a pending batch that
// the librarian builds via quick-add / the sequence generator and saves in one
// transactional call (saveCopies) — either every copy is created or none.

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  type CopyStatus,
  type GeneratedCopy,
  COPY_STATUS,
  COPY_STATUS_OPTIONS,
  computeCopyStats,
  copyStatusBadgeClass,
  copyStatusDotClass,
  generateCopies,
  normalizeCopyStatus,
  DEFAULT_HOLDING_LIBRARY,
} from "@/lib/catalog";
import {
  type CatalogCopy,
  fetchCopiesForBook,
  saveCopies,
  updateCopy,
  updateCopyStatus,
  archiveCopy,
  deleteCopy,
} from "./copy-actions";

// ── Small helpers ──────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-divider bg-bg-surface px-2.5 py-1.5 text-xs " +
  "text-text-heading placeholder:text-text-muted outline-none transition " +
  "focus:border-brand/60 focus:ring-2 focus:ring-focus-ring/15 disabled:bg-paper disabled:text-text-muted";

const labelCls = "block text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1";

let rowSeq = 0;
function clientId() {
  rowSeq += 1;
  return `pending-${rowSeq}`;
}

type PendingRow = GeneratedCopy & { clientId: string };

function StatusBadge({ status }: { status: CopyStatus }) {
  const t = useTranslations("adminCatalog.copies.status");
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold whitespace-nowrap ${copyStatusBadgeClass(status)}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${copyStatusDotClass(status)}`} />
      {t(status)}
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CopiesPanel({
  bookId,
  bookShelfLocation,
  initialCopies,
}: {
  bookId: string;
  bookShelfLocation?: string | null;
  initialCopies: CatalogCopy[];
}) {
  const t = useTranslations("adminCatalog.copies");
  const tStatus = useTranslations("adminCatalog.copies.status");
  const [copies, setCopies] = useState<CatalogCopy[]>(initialCopies);
  const [showWithdrawn, setShowWithdrawn] = useState(false);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{ kind: "archive" | "delete"; id: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showGenerator, setShowGenerator] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Sequence-generator form
  const [gen, setGen] = useState({
    count: "3",
    barcodePrefix: "PTEC-",
    barcodeStart: "",
    accessionPrefix: "ACC-",
    accessionStart: "",
    callNumberBase: "",
    shelfLocation: bookShelfLocation ?? "",
    status: "available" as CopyStatus,
    condition: "",
    notes: "",
  });

  const liveCopies = useMemo(
    () => copies.filter((c) => normalizeCopyStatus(c.status) !== "withdrawn"),
    [copies],
  );
  const withdrawnCopies = useMemo(
    () => copies.filter((c) => normalizeCopyStatus(c.status) === "withdrawn"),
    [copies],
  );
  const stats = useMemo(() => computeCopyStats(copies), [copies]);
  const nextCopyNumber = useMemo(() => {
    const maxSaved = Math.max(0, liveCopies.length, ...liveCopies.map((c) => c.copy_number ?? 0));
    const maxPending = Math.max(0, ...pending.map((p) => p.copy_number));
    return Math.max(maxSaved, maxPending) + 1;
  }, [liveCopies, pending]);

  // Unsaved-changes guard: pending rows are lost if the tab closes.
  useEffect(() => {
    if (pending.length === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [pending.length]);

  function flash(kind: "error" | "notice", msg: string) {
    if (kind === "error") { setError(msg); setNotice(null); }
    else { setNotice(msg); setError(null); }
  }

  async function reload() {
    try {
      setCopies(await fetchCopiesForBook(bookId));
    } catch (e) {
      flash("error", e instanceof Error ? e.message : t("toasts.reloadFailed"));
    }
  }

  // ── Pending batch ────────────────────────────────────────────────────────────

  function blankRow(copyNo: number): PendingRow {
    const last = pending[pending.length - 1];
    const lastSaved = liveCopies[liveCopies.length - 1];
    return {
      clientId: clientId(),
      copy_number: copyNo,
      barcode: null,
      accession_number: null,
      call_number: null,
      shelf_location: last?.shelf_location ?? lastSaved?.shelf_location ?? bookShelfLocation ?? null,
      holding_library: last?.holding_library ?? lastSaved?.holding_library ?? DEFAULT_HOLDING_LIBRARY,
      status: "available",
      condition: null,
      notes: null,
    };
  }

  function quickAdd(n: number) {
    setPending((prev) => {
      const rows = [...prev];
      let no = nextCopyNumber;
      for (let i = 0; i < n; i++) rows.push(blankRow(no++));
      return rows;
    });
    setNotice(null);
    setError(null);
  }

  function runGenerator() {
    const count = Math.min(Math.max(1, Number(gen.count) || 1), 100);
    const generated = generateCopies({
      count,
      barcodePrefix: gen.barcodePrefix,
      barcodeStart: gen.barcodeStart.trim() === "" ? null : Number(gen.barcodeStart),
      accessionPrefix: gen.accessionPrefix,
      accessionStart: gen.accessionStart.trim() === "" ? null : Number(gen.accessionStart),
      callNumberBase: gen.callNumberBase || null,
      shelfLocation: gen.shelfLocation || null,
      holdingLibrary: DEFAULT_HOLDING_LIBRARY,
      status: gen.status,
      condition: gen.condition || null,
      notes: gen.notes || null,
      copyNumberStart: nextCopyNumber,
    });
    setPending((prev) => [...prev, ...generated.map((g) => ({ ...g, clientId: clientId() }))]);
    setShowGenerator(false);
  }

  function updatePendingRow(id: string, patch: Partial<GeneratedCopy>) {
    setPending((prev) => prev.map((r) => (r.clientId === id ? { ...r, ...patch } : r)));
  }

  function removePendingRow(id: string) {
    setPending((prev) => prev.filter((r) => r.clientId !== id));
  }

  function handleSaveAll() {
    if (pending.length === 0) return;
    startTransition(async () => {
      const rows: GeneratedCopy[] = pending.map(({ clientId: _ignored, ...rest }) => rest);
      const res = await saveCopies(bookId, rows);
      if (res.success) {
        setPending([]);
        await reload();
        flash("notice", `${res.added} ${res.added === 1 ? "copy" : "copies"} saved. Nothing is pending.`);
      } else {
        flash("error", res.error);
      }
    });
  }

  // ── Saved-copy operations ────────────────────────────────────────────────────

  function startEdit(copy: CatalogCopy) {
    setEditingId(copy.id);
    setEditForm({
      barcode: copy.barcode ?? "",
      accession_number: copy.accession_number ?? "",
      call_number: copy.call_number ?? "",
      shelf_location: copy.shelf_location ?? "",
      holding_library: copy.holding_library ?? DEFAULT_HOLDING_LIBRARY,
      status: normalizeCopyStatus(copy.status),
      condition: copy.condition ?? "",
      notes: copy.notes ?? "",
      copy_number: copy.copy_number != null ? String(copy.copy_number) : "",
    });
  }

  function handleSaveEdit(copyId: string) {
    startTransition(async () => {
      const fd = new FormData();
      Object.entries(editForm).forEach(([k, v]) => fd.set(k, v));
      const res = await updateCopy(copyId, fd);
      if (res.success) {
        setEditingId(null);
        await reload();
        flash("notice", t("toasts.updated"));
      } else {
        flash("error", res.error);
      }
    });
  }

  function handleStatusChange(copyId: string, status: CopyStatus) {
    startTransition(async () => {
      const res = await updateCopyStatus(copyId, status);
      if (res.success) { await reload(); flash("notice", t("toasts.statusUpdated")); }
      else flash("error", res.error);
    });
  }

  function handleConfirmedAction() {
    if (!confirm) return;
    const { kind, id } = confirm;
    startTransition(async () => {
      const res = kind === "archive" ? await archiveCopy(id) : await deleteCopy(id);
      setConfirm(null);
      if (res.success) {
        await reload();
        flash("notice", kind === "archive" ? t("toasts.withdrawn") : t("toasts.deleted"));
      } else {
        flash("error", res.error);
      }
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const visibleCopies = showWithdrawn ? copies : liveCopies;

  return (
    <div className="space-y-5">

      {/* Live messages */}
      <div aria-live="polite" className="space-y-2">
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-600">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-700">
            {notice}
          </p>
        )}
      </div>

      {/* ── Summary chips ── */}
      <div className="flex flex-wrap gap-2" aria-label={t("summaryAria")}>
        {[
          { label: "Total", value: stats.total, cls: "text-text-heading" },
          { label: "Available", value: stats.available, cls: "text-emerald-600" },
          { label: "On loan", value: stats.onLoan, cls: "text-amber-600" },
          { label: "Reserved", value: stats.reserved, cls: "text-amber-600" },
          { label: "Reference only", value: stats.referenceOnly, cls: "text-sky-600" },
          { label: "Unavailable", value: stats.unavailable, cls: "text-red-500" },
        ].map(({ label, value, cls }) => (
          <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-divider bg-bg-surface px-3 py-1 text-[11px] font-semibold text-text-muted">
            {label}
            <span className={`text-xs font-bold ${cls}`}>{value}</span>
          </span>
        ))}
        {withdrawnCopies.length > 0 && (
          <button
            type="button"
            onClick={() => setShowWithdrawn((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-divider px-3 py-1 text-[11px] font-semibold text-text-muted transition hover:border-brand hover:text-brand"
            aria-pressed={showWithdrawn}
          >
            {showWithdrawn ? t("hideWithdrawn", { count: withdrawnCopies.length }) : t("showWithdrawn", { count: withdrawnCopies.length })}
          </button>
        )}
      </div>

      {/* ── Existing copies ── */}
      <div className="rounded-2xl border border-divider bg-bg-surface shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-divider bg-paper/60 px-4 py-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
            Saved copies ({visibleCopies.length})
          </h3>
        </div>

        {visibleCopies.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-semibold text-text-heading">{t("noCopies")}</p>
            <p className="mt-1 text-xs text-text-muted">
              Use the quick-add buttons or the sequence generator below — new copies appear as a pending batch you save in one step.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="sr-only">{t("tableCaption")}</caption>
                <thead>
                  <tr className="border-b border-divider text-left">
                    {["#", t("col.barcode"), t("col.accession"), t("col.callNumber"), t("col.shelf"), t("col.status"), t("col.notes"), t("col.actions")].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-text-muted whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider/60">
                  {visibleCopies.map((copy) => {
                    const status = normalizeCopyStatus(copy.status);
                    const isEditing = editingId === copy.id;
                    return (
                      <tr key={copy.id} className={status === "withdrawn" ? "opacity-50" : ""}>
                        {isEditing ? (
                          <td colSpan={8} className="px-3 py-3">
                            <EditCopyForm
                              form={editForm}
                              setForm={setEditForm}
                              onSave={() => handleSaveEdit(copy.id)}
                              onCancel={() => setEditingId(null)}
                              busy={isPending}
                            />
                          </td>
                        ) : (
                          <>
                            <td className="px-3 py-2.5 font-bold text-text-heading">{copy.copy_number ?? "—"}</td>
                            <td className="px-3 py-2.5 font-mono">{copy.barcode ?? <span className="text-text-muted">—</span>}</td>
                            <td className="px-3 py-2.5 font-mono">{copy.accession_number ?? <span className="text-text-muted">—</span>}</td>
                            <td className="px-3 py-2.5 font-mono">{copy.call_number ?? <span className="text-text-muted">—</span>}</td>
                            <td className="px-3 py-2.5 font-mono">{copy.shelf_location ?? <span className="text-text-muted">—</span>}</td>
                            <td className="px-3 py-2.5">
                              {status === "withdrawn" ? (
                                <StatusBadge status={status} />
                              ) : (
                                <label className="sr-only" htmlFor={`status-${copy.id}`}>Change status of copy {copy.copy_number ?? copy.barcode ?? copy.id}</label>
                              )}
                              {status !== "withdrawn" && (
                                <select
                                  id={`status-${copy.id}`}
                                  value={status}
                                  onChange={(e) => handleStatusChange(copy.id, e.target.value as CopyStatus)}
                                  disabled={isPending}
                                  className={`rounded-lg border px-2 py-1 text-[11px] font-semibold outline-none focus:ring-2 focus:ring-focus-ring/20 disabled:opacity-50 ${copyStatusBadgeClass(status)}`}
                                >
                                  {COPY_STATUS_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="max-w-[140px] truncate px-3 py-2.5 text-text-muted" title={copy.notes ?? undefined}>
                              {copy.notes ?? ""}
                            </td>
                            <td className="px-3 py-2.5">
                              <RowActions
                                copy={copy}
                                status={status}
                                confirm={confirm}
                                setConfirm={setConfirm}
                                onEdit={() => startEdit(copy)}
                                onConfirmed={handleConfirmedAction}
                                busy={isPending}
                              />
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="divide-y divide-divider/60 md:hidden">
              {visibleCopies.map((copy) => {
                const status = normalizeCopyStatus(copy.status);
                const isEditing = editingId === copy.id;
                return (
                  <li key={copy.id} className={`px-4 py-3 ${status === "withdrawn" ? "opacity-50" : ""}`}>
                    {isEditing ? (
                      <EditCopyForm
                        form={editForm}
                        setForm={setEditForm}
                        onSave={() => handleSaveEdit(copy.id)}
                        onCancel={() => setEditingId(null)}
                        busy={isPending}
                      />
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-text-heading">
                            {t("copyN", { n: copy.copy_number ?? "—" })}
                            {copy.barcode && <span className="ml-2 font-mono text-xs font-semibold text-text-muted">{copy.barcode}</span>}
                          </span>
                          <StatusBadge status={status} />
                        </div>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-text-muted">
                          {copy.accession_number && (<><dt className="font-medium">{t("col.accession")}</dt><dd className="font-mono text-text-body">{copy.accession_number}</dd></>)}
                          {copy.call_number && (<><dt className="font-medium">{t("col.callNo")}</dt><dd className="font-mono text-text-body">{copy.call_number}</dd></>)}
                          {copy.shelf_location && (<><dt className="font-medium">{t("col.shelf")}</dt><dd className="font-mono text-text-body">{copy.shelf_location}</dd></>)}
                          {copy.notes && (<><dt className="font-medium">{t("col.notes")}</dt><dd className="text-text-body">{copy.notes}</dd></>)}
                        </dl>
                        <RowActions
                          copy={copy}
                          status={status}
                          confirm={confirm}
                          setConfirm={setConfirm}
                          onEdit={() => startEdit(copy)}
                          onConfirmed={handleConfirmedAction}
                          busy={isPending}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* ── Add copies ── */}
      <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">{t("addCopies")}</h3>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-text-muted">{t("quickAdd")}</span>
            {[1, 3, 5, 10].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => quickAdd(n)}
                className="rounded-lg border border-divider px-2.5 py-1 text-xs font-semibold text-text-body transition hover:border-brand hover:text-brand"
              >
                +{n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowGenerator((v) => !v)}
              aria-expanded={showGenerator}
              className="rounded-lg border border-brand/40 px-3 py-1 text-xs font-semibold text-brand transition hover:bg-brand/5"
            >
              {showGenerator ? t("closeGenerator") : t("generateSequence")}
            </button>
          </div>
        </div>

        {/* Sequence generator */}
        {showGenerator && (
          <div className="rounded-xl border border-divider bg-paper/50 p-4">
            <p className="mb-3 text-[11px] text-text-muted">
              Generates numbered barcodes / accession numbers (e.g. PTEC-001250, PTEC-001251, …) and appends
              the copies to the pending batch below — nothing is saved until you press <strong>{t("saveAllCopies")}</strong>.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="gen-count" className={labelCls}>{t("gen.count")}</label>
                <input id="gen-count" type="number" min={1} max={100} value={gen.count}
                  onChange={(e) => setGen({ ...gen, count: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label htmlFor="gen-bprefix" className={labelCls}>{t("gen.barcodePrefix")}</label>
                <input id="gen-bprefix" value={gen.barcodePrefix}
                  onChange={(e) => setGen({ ...gen, barcodePrefix: e.target.value })} className={inputCls} placeholder={t("barcodePrefixPlaceholder")} />
              </div>
              <div>
                <label htmlFor="gen-bstart" className={labelCls}>{t("gen.barcodeStart")}</label>
                <input id="gen-bstart" type="number" min={0} value={gen.barcodeStart}
                  onChange={(e) => setGen({ ...gen, barcodeStart: e.target.value })} className={inputCls} placeholder={t("barcodeStartPlaceholder")} />
              </div>
              <div>
                <label htmlFor="gen-aprefix" className={labelCls}>{t("gen.accessionPrefix")}</label>
                <input id="gen-aprefix" value={gen.accessionPrefix}
                  onChange={(e) => setGen({ ...gen, accessionPrefix: e.target.value })} className={inputCls} placeholder={t("accessionPrefixPlaceholder")} />
              </div>
              <div>
                <label htmlFor="gen-astart" className={labelCls}>{t("gen.accessionStart")}</label>
                <input id="gen-astart" type="number" min={0} value={gen.accessionStart}
                  onChange={(e) => setGen({ ...gen, accessionStart: e.target.value })} className={inputCls} placeholder={t("blankNone")} />
              </div>
              <div>
                <label htmlFor="gen-call" className={labelCls}>{t("gen.baseCallNumber")}</label>
                <input id="gen-call" value={gen.callNumberBase}
                  onChange={(e) => setGen({ ...gen, callNumberBase: e.target.value })} className={inputCls} placeholder={t("callNumberGenPlaceholder")} />
              </div>
              <div>
                <label htmlFor="gen-shelf" className={labelCls}>{t("field.shelfLocation")}</label>
                <input id="gen-shelf" value={gen.shelfLocation}
                  onChange={(e) => setGen({ ...gen, shelfLocation: e.target.value })} className={inputCls} placeholder={bookShelfLocation ?? "B-2-01"} />
              </div>
              <div>
                <label htmlFor="gen-status" className={labelCls}>{t("field.status")}</label>
                <select id="gen-status" value={gen.status}
                  onChange={(e) => setGen({ ...gen, status: e.target.value as CopyStatus })} className={inputCls}>
                  {COPY_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{tStatus(o.value)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="gen-cond" className={labelCls}>{t("field.condition")}</label>
                <input id="gen-cond" value={gen.condition}
                  onChange={(e) => setGen({ ...gen, condition: e.target.value })} className={inputCls} placeholder={t("conditionPlaceholder2")} />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={runGenerator}
                className="rounded-lg bg-brand px-4 py-1.5 text-xs font-bold text-white transition hover:bg-brand-hover"
              >
                Add to pending batch
              </button>
            </div>
          </div>
        )}

        {/* Pending batch */}
        {pending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-divider px-4 py-6 text-center text-xs text-text-muted">
            No pending copies. Quick-add or generate a sequence to build a batch, review it, then save everything at once.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-amber-700">
                <span aria-hidden>●</span> {pending.length} pending {pending.length === 1 ? "copy" : "copies"} — not saved yet
              </p>
              <button
                type="button"
                onClick={() => setPending([])}
                className="text-[11px] font-semibold text-text-muted transition hover:text-red-500"
              >
                Discard batch
              </button>
            </div>

            <ul className="space-y-2">
              {pending.map((row) => (
                <li key={row.clientId} className="rounded-xl border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-500/25 dark:bg-amber-500/5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-text-heading">Copy {row.copy_number} <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700">pending</span></span>
                    <button
                      type="button"
                      onClick={() => removePendingRow(row.clientId)}
                      className="rounded-lg p-1 text-text-muted transition hover:text-red-500"
                      aria-label={`Remove pending copy ${row.copy_number}`}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                        <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                    <div>
                      <label htmlFor={`p-bar-${row.clientId}`} className={labelCls}>{t("field.barcode")}</label>
                      <input id={`p-bar-${row.clientId}`} value={row.barcode ?? ""} className={inputCls}
                        onChange={(e) => updatePendingRow(row.clientId, { barcode: e.target.value || null })} placeholder={t("barcodePlaceholder")} />
                    </div>
                    <div>
                      <label htmlFor={`p-acc-${row.clientId}`} className={labelCls}>{t("col.accession")}</label>
                      <input id={`p-acc-${row.clientId}`} value={row.accession_number ?? ""} className={inputCls}
                        onChange={(e) => updatePendingRow(row.clientId, { accession_number: e.target.value || null })} placeholder={t("accessionPlaceholder")} />
                    </div>
                    <div>
                      <label htmlFor={`p-call-${row.clientId}`} className={labelCls}>{t("field.callNumber")}</label>
                      <input id={`p-call-${row.clientId}`} value={row.call_number ?? ""} className={inputCls}
                        onChange={(e) => updatePendingRow(row.clientId, { call_number: e.target.value || null })} placeholder={t("callNumberPlaceholder")} />
                    </div>
                    <div>
                      <label htmlFor={`p-shelf-${row.clientId}`} className={labelCls}>{t("col.shelf")}</label>
                      <input id={`p-shelf-${row.clientId}`} value={row.shelf_location ?? ""} className={inputCls}
                        onChange={(e) => updatePendingRow(row.clientId, { shelf_location: e.target.value || null })} placeholder={t("shelfPlaceholder")} />
                    </div>
                    <div>
                      <label htmlFor={`p-status-${row.clientId}`} className={labelCls}>{t("field.status")}</label>
                      <select id={`p-status-${row.clientId}`} value={row.status} className={inputCls}
                        onChange={(e) => updatePendingRow(row.clientId, { status: e.target.value as CopyStatus })}>
                        {COPY_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{tStatus(o.value)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`p-notes-${row.clientId}`} className={labelCls}>{t("col.notes")}</label>
                      <input id={`p-notes-${row.clientId}`} value={row.notes ?? ""} className={inputCls}
                        onChange={(e) => updatePendingRow(row.clientId, { notes: e.target.value || null })} placeholder={t("optional")} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => quickAdd(1)}
                className="rounded-xl border border-divider px-4 py-2 text-xs font-semibold text-text-body transition hover:bg-paper"
              >
                Add another copy
              </button>
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={isPending}
                className="rounded-xl bg-brand px-6 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-brand-hover disabled:opacity-60"
              >
                {isPending ? t("saving") : `Save all copies (${pending.length})`}
              </button>
            </div>
            <p className="text-right text-[10px] text-text-muted">
              Saved together — if any copy is invalid (e.g. duplicate barcode), nothing is created.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Row actions (edit / archive / delete with inline confirm) ─────────────────

function RowActions({
  copy,
  status,
  confirm,
  setConfirm,
  onEdit,
  onConfirmed,
  busy,
}: {
  copy: CatalogCopy;
  status: CopyStatus;
  confirm: { kind: "archive" | "delete"; id: string } | null;
  setConfirm: (c: { kind: "archive" | "delete"; id: string } | null) => void;
  onEdit: () => void;
  onConfirmed: () => void;
  busy: boolean;
}) {
  const t = useTranslations("adminCatalog.copies");
  const confirming = confirm?.id === copy.id ? confirm : null;

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="text-[10px] font-semibold text-text-muted">
          {confirming.kind === "archive" ? t("withdrawConfirm") : t("deleteConfirm")}
        </span>
        <button type="button" onClick={onConfirmed} disabled={busy}
          className="rounded-lg bg-red-500 px-2 py-1 text-[10px] font-bold text-white transition hover:bg-red-600 disabled:opacity-50">
          {busy ? "…" : t("confirm")}
        </button>
        <button type="button" onClick={() => setConfirm(null)}
          className="rounded-lg border border-divider px-2 py-1 text-[10px] text-text-muted transition hover:bg-paper">
          {t("cancel")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <button type="button" onClick={onEdit}
        className="rounded-lg border border-divider px-2 py-1 text-[10px] font-semibold text-text-muted transition hover:border-brand hover:text-brand">
        Edit
      </button>
      {status !== "withdrawn" && (
        <button type="button" onClick={() => setConfirm({ kind: "archive", id: copy.id })}
          title={t("withdrawTitle")}
          className="rounded-lg border border-divider px-2 py-1 text-[10px] font-semibold text-text-muted transition hover:border-amber-400 hover:text-amber-600">
          Withdraw
        </button>
      )}
      <button type="button" onClick={() => setConfirm({ kind: "delete", id: copy.id })}
        title={t("deleteTitle")}
        className="rounded-lg border border-divider px-2 py-1 text-[10px] font-semibold text-text-muted transition hover:border-red-300 hover:text-red-500">
        Delete
      </button>
    </div>
  );
}

// ── Inline edit form ───────────────────────────────────────────────────────────

function EditCopyForm({
  form,
  setForm,
  onSave,
  onCancel,
  busy,
}: {
  form: Record<string, string>;
  setForm: (f: Record<string, string>) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const t = useTranslations("adminCatalog.copies");
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="space-y-3 rounded-xl border border-brand/25 bg-brand/[0.03] p-3">
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <div>
          <label htmlFor="edit-copy-no" className={labelCls}>{t("field.copyNo")}</label>
          <input id="edit-copy-no" type="number" min={1} value={form.copy_number} onChange={set("copy_number")} className={inputCls} />
        </div>
        <div>
          <label htmlFor="edit-barcode" className={labelCls}>{t("field.barcode")}</label>
          <input id="edit-barcode" value={form.barcode} onChange={set("barcode")} className={inputCls} placeholder={t("barcodePlaceholder")} />
        </div>
        <div>
          <label htmlFor="edit-accession" className={labelCls}>{t("field.accessionNo")}</label>
          <input id="edit-accession" value={form.accession_number} onChange={set("accession_number")} className={inputCls} placeholder={t("accessionPlaceholder")} />
        </div>
        <div>
          <label htmlFor="edit-call" className={labelCls}>{t("field.callNumber")}</label>
          <input id="edit-call" value={form.call_number} onChange={set("call_number")} className={inputCls} placeholder={t("callNumberPlaceholder")} />
        </div>
        <div>
          <label htmlFor="edit-shelf" className={labelCls}>{t("field.shelfLocation")}</label>
          <input id="edit-shelf" value={form.shelf_location} onChange={set("shelf_location")} className={inputCls} placeholder={t("shelfPlaceholder")} />
        </div>
        <div>
          <label htmlFor="edit-library" className={labelCls}>{t("field.holdingLibrary")}</label>
          <input id="edit-library" value={form.holding_library} onChange={set("holding_library")} className={inputCls} />
        </div>
        <div>
          <label htmlFor="edit-status" className={labelCls}>{t("field.status")}</label>
          <select id="edit-status" value={form.status} onChange={set("status")} className={inputCls}>
            {COPY_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(`status.${o.value}`)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="edit-condition" className={labelCls}>{t("field.condition")}</label>
          <input id="edit-condition" value={form.condition} onChange={set("condition")} className={inputCls} placeholder={t("conditionPlaceholder")} />
        </div>
        <div className="sm:col-span-3 lg:col-span-4">
          <label htmlFor="edit-notes" className={labelCls}>{t("col.notes")}</label>
          <input id="edit-notes" value={form.notes} onChange={set("notes")} className={inputCls} placeholder={t("optional")} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-divider px-3 py-1.5 text-xs font-semibold text-text-muted transition hover:bg-paper">
          Cancel
        </button>
        <button type="button" onClick={onSave} disabled={busy}
          className="rounded-lg bg-brand px-4 py-1.5 text-xs font-bold text-white transition hover:bg-brand-hover disabled:opacity-50">
          {busy ? t("saving") : t("saveCopy")}
        </button>
      </div>
    </div>
  );
}
