"use client";

import { useState } from "react";
import { BookPlus, Check, X, Trash2, ChevronDown } from "lucide-react";
import { adminUpdateBookRequest, adminDeleteBookRequest } from "@/app/actions/book-requests";
import type { BookRequest, BookRequestStatus } from "@/app/actions/book-requests";

const STATUS_STYLES: Record<BookRequestStatus, string> = {
  pending:  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  added:    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

function RequestRow({ req, onUpdate }: { req: BookRequest; onUpdate: (id: string, status: BookRequestStatus, note?: string) => void }) {
  const [note, setNote]     = useState(req.admin_note ?? "");
  const [busy, setBusy]     = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function act(status: BookRequestStatus) {
    setBusy(true);
    await onUpdate(req.id, status, note || undefined);
    setBusy(false);
  }

  return (
    <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${STATUS_STYLES[req.status]}`}>
              {req.status}
            </span>
            <span className="text-[11px] text-text-muted">
              {new Date(req.created_at).toLocaleDateString()}
            </span>
          </div>
          <h3 className="mt-1.5 text-[15px] font-bold text-text-heading leading-snug">{req.title}</h3>
          {req.author && <p className="text-[13px] text-text-muted">by {req.author}</p>}
          {req.isbn   && <p className="text-[12px] text-text-muted font-mono mt-0.5">ISBN: {req.isbn}</p>}
        </div>

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg border border-divider px-2.5 py-1.5 text-[12px] font-medium text-text-muted transition hover:border-brand/40 hover:text-brand"
        >
          Actions <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {req.reason && (
        <p className="mt-2 rounded-lg bg-paper px-3 py-2 text-[12.5px] text-text-body border border-divider">
          <span className="font-semibold text-text-muted">Reason: </span>{req.reason}
        </p>
      )}

      {expanded && (
        <div className="mt-3 flex flex-col gap-2 border-t border-divider pt-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Admin note (optional)…"
            rows={2}
            className="w-full resize-none rounded-xl border border-divider bg-paper px-3 py-2 text-[12.5px] text-text-body focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <div className="flex flex-wrap gap-2">
            {req.status !== "approved" && (
              <button
                type="button"
                onClick={() => act("approved")}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-green-700 disabled:opacity-60"
              >
                <Check className="h-3.5 w-3.5" /> Approve
              </button>
            )}
            {req.status !== "added" && (
              <button
                type="button"
                onClick={() => act("added")}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                <BookPlus className="h-3.5 w-3.5" /> Mark as Added
              </button>
            )}
            {req.status !== "rejected" && (
              <button
                type="button"
                onClick={() => act("rejected")}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                <X className="h-3.5 w-3.5" /> Reject
              </button>
            )}
            <DeleteButton reqId={req.id} />
          </div>
          {req.admin_note && (
            <p className="text-[11.5px] text-text-muted">Current note: {req.admin_note}</p>
          )}
        </div>
      )}
    </div>
  );
}

function DeleteButton({ reqId }: { reqId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (!confirm("Delete this request permanently?")) return;
        setBusy(true);
        await adminDeleteBookRequest(reqId);
        window.location.reload();
      }}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[12px] font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60 dark:border-red-800/40 dark:bg-red-900/10 dark:text-red-400"
    >
      <Trash2 className="h-3.5 w-3.5" /> Delete
    </button>
  );
}

const FILTERS: { label: string; value: BookRequestStatus | "all" }[] = [
  { label: "All",      value: "all" },
  { label: "Pending",  value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Added",    value: "added" },
  { label: "Rejected", value: "rejected" },
];

export default function BookRequestsClient({ requests: initial }: { requests: BookRequest[] }) {
  const [requests, setRequests]   = useState(initial);
  const [filter, setFilter]       = useState<BookRequestStatus | "all">("all");

  async function handleUpdate(id: string, status: BookRequestStatus, note?: string) {
    await adminUpdateBookRequest(id, status, note);
    setRequests((prev) =>
      prev.map((r) => r.id === id ? { ...r, status, admin_note: note ?? r.admin_note } : r)
    );
  }

  const visible = filter === "all" ? requests : requests.filter((r) => r.status === filter);

  return (
    <div>
      {/* Filter tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-all ${
              filter === f.value
                ? "bg-brand text-white shadow-sm"
                : "border border-divider bg-paper text-text-muted hover:border-brand/40 hover:text-text-body"
            }`}
          >
            {f.label}
            {f.value !== "all" && (
              <span className="ml-1.5 text-[11px] opacity-70">
                ({requests.filter((r) => r.status === f.value).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-divider bg-bg-surface py-16 text-center">
          <BookPlus className="mx-auto mb-3 h-10 w-10 text-text-muted/40" />
          <p className="text-[14px] font-semibold text-text-muted">No requests found</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((req) => (
            <RequestRow key={req.id} req={req} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
