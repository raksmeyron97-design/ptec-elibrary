"use client";

import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  BookPlus,
  Check,
  ChevronDown,
  Search,
  SearchX,
  Trash2,
  X,
} from "lucide-react";
import { adminUpdateBookRequest, adminDeleteBookRequest } from "@/app/actions/book-requests";
import type { BookRequest, BookRequestStatus } from "@/app/actions/book-requests";
import { ConfirmDialog, EmptyState, StatusBadge, useToast } from "@/components/admin/kit";
import type { StatusTone } from "@/components/admin/kit";

const STATUS_TONE: Record<BookRequestStatus, StatusTone> = {
  pending: "warning",
  approved: "success",
  added: "info",
  rejected: "danger",
};

const FILTERS: (BookRequestStatus | "all")[] = ["all", "pending", "approved", "added", "rejected"];

/** The three status transitions offered for a request (its current status is hidden). */
const TRANSITIONS: { status: BookRequestStatus; icon: React.ElementType; labelKey: string }[] = [
  { status: "approved", icon: Check, labelKey: "approve" },
  { status: "added", icon: BookPlus, labelKey: "markAdded" },
  { status: "rejected", icon: X, labelKey: "reject" },
];

function formatDate(dateStr: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Phnom_Penh",
  }).format(new Date(dateStr));
}

type UpdateFn = (id: string, status: BookRequestStatus, note: string) => Promise<void>;

/** Status-change buttons — shared by the desktop detail panel and mobile cards. */
function TransitionButtons({
  req,
  note,
  busy,
  onUpdate,
}: {
  req: BookRequest;
  note: string;
  busy: boolean;
  onUpdate: UpdateFn;
}) {
  const t = useTranslations("adminBookRequests.actions");
  const styles: Record<BookRequestStatus, string> = {
    approved: "bg-success hover:bg-success/90",
    added: "bg-info hover:bg-info/90",
    rejected: "bg-danger hover:bg-danger/90",
    pending: "bg-brand hover:bg-brand-hover",
  };
  return (
    <>
      {TRANSITIONS.filter((tr) => tr.status !== req.status).map((tr) => {
        const Icon = tr.icon;
        return (
          <button
            key={tr.status}
            type="button"
            onClick={() => onUpdate(req.id, tr.status, note)}
            disabled={busy}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white transition disabled:opacity-60 ${styles[tr.status]}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {t(tr.labelKey)}
          </button>
        );
      })}
    </>
  );
}

/** Title + author + ISBN block, shared by table rows and mobile cards. */
function RequestSummary({ req }: { req: BookRequest }) {
  const t = useTranslations("adminBookRequests");
  return (
    <>
      <p className="text-[14px] font-bold leading-snug text-text-heading">{req.title}</p>
      {req.author && <p className="mt-0.5 text-[12.5px] text-text-muted">{t("by", { author: req.author })}</p>}
      {req.isbn && <p className="mt-0.5 font-mono text-[11.5px] text-text-muted">{t("isbn", { isbn: req.isbn })}</p>}
    </>
  );
}

/** Note editor + transitions + delete — the expandable detail area. */
function DetailPanel({
  req,
  note,
  onNoteChange,
  busy,
  onUpdate,
  onDelete,
}: {
  req: BookRequest;
  note: string;
  onNoteChange: (value: string) => void;
  busy: boolean;
  onUpdate: UpdateFn;
  onDelete: (req: BookRequest) => void;
}) {
  const t = useTranslations("adminBookRequests");
  return (
    <div className="flex flex-col gap-2.5">
      {req.reason && (
        <p className="rounded-lg border border-divider bg-paper px-3 py-2 text-[12.5px] text-text-body">
          <span className="font-semibold text-text-muted">{t("reasonLabel")}: </span>
          {req.reason}
        </p>
      )}
      <label className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {t("note.label")}
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder={t("note.placeholder")}
          rows={2}
          className="mt-1 w-full resize-none rounded-xl border border-divider bg-bg-surface px-3 py-2 text-[12.5px] font-normal normal-case tracking-normal text-text-body placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <TransitionButtons req={req} note={note} busy={busy} onUpdate={onUpdate} />
        <button
          type="button"
          onClick={() => onDelete(req)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-danger/25 bg-danger/5 px-3 py-1.5 text-[12px] font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-60"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> {t("actions.delete")}
        </button>
      </div>
      {req.admin_note && (
        <p className="text-[11.5px] text-text-muted">{t("note.current", { note: req.admin_note })}</p>
      )}
    </div>
  );
}

/** One request: a table row + optional detail row (desktop), or a card (mobile).
 *  Owns the per-request note draft so quick actions and the editor stay in sync. */
function RequestRow({
  req,
  variant,
  busy,
  onUpdate,
  onDelete,
}: {
  req: BookRequest;
  variant: "table" | "card";
  busy: boolean;
  onUpdate: UpdateFn;
  onDelete: (req: BookRequest) => void;
}) {
  const t = useTranslations("adminBookRequests");
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(req.admin_note ?? "");

  const detailsLabel = expanded ? t("actions.hideDetails") : t("actions.details");
  const statusBadge = (
    <StatusBadge tone={STATUS_TONE[req.status]}>{t(`status.${req.status}`)}</StatusBadge>
  );
  const detailToggle = (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
      className="inline-flex items-center gap-1 rounded-lg border border-divider px-2.5 py-1.5 text-[12px] font-medium text-text-muted transition hover:border-brand/40 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      {detailsLabel}
      <ChevronDown
        className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
        aria-hidden="true"
      />
    </button>
  );

  if (variant === "card") {
    return (
      <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge}
            <span className="text-[11px] text-text-muted">{formatDate(req.created_at, locale)}</span>
          </div>
          {detailToggle}
        </div>
        <div className="mt-2">
          <RequestSummary req={req} />
        </div>
        {!expanded && req.reason && (
          <p className="mt-2 line-clamp-2 text-[12.5px] text-text-muted">{req.reason}</p>
        )}
        {expanded && (
          <div className="mt-3 border-t border-divider pt-3">
            <DetailPanel
              req={req}
              note={note}
              onNoteChange={setNote}
              busy={busy}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <tr className={`transition-colors hover:bg-brand/[0.03] ${expanded ? "bg-brand/[0.03]" : ""}`}>
        <td className="px-4 py-3.5 align-top">
          <RequestSummary req={req} />
        </td>
        <td className="max-w-[260px] px-4 py-3.5 align-top">
          {req.reason ? (
            <p className="line-clamp-2 text-[12.5px] text-text-body">{req.reason}</p>
          ) : (
            <span className="text-text-muted" aria-hidden="true">—</span>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3.5 align-top text-[12.5px] text-text-muted">
          {formatDate(req.created_at, locale)}
        </td>
        <td className="whitespace-nowrap px-4 py-3.5 align-top">{statusBadge}</td>
        <td className="whitespace-nowrap px-4 py-3.5 align-top text-right">{detailToggle}</td>
      </tr>
      {expanded && (
        <tr className="bg-brand/[0.03]">
          <td colSpan={5} className="border-t border-divider/60 px-4 pb-4 pt-3">
            <DetailPanel
              req={req}
              note={note}
              onNoteChange={setNote}
              busy={busy}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          </td>
        </tr>
      )}
    </>
  );
}

export default function BookRequestsClient({ requests: initial }: { requests: BookRequest[] }) {
  const t = useTranslations("adminBookRequests");
  const toast = useToast();
  const [requests, setRequests] = useState(initial);
  const [filter, setFilter] = useState<BookRequestStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<BookRequest | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteBusy, startDelete] = useTransition();

  async function handleUpdate(id: string, status: BookRequestStatus, note: string) {
    setBusyId(id);
    const res = await adminUpdateBookRequest(id, status, note.trim() || undefined);
    setBusyId(null);
    if (res?.error) {
      toast.error(t("toasts.updateFailed"));
      return;
    }
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status, admin_note: note.trim() || null } : r)),
    );
    toast.success(t("toasts.updated", { status: t(`status.${status}`) }));
  }

  function handleDelete(req: BookRequest) {
    startDelete(async () => {
      const res = await adminDeleteBookRequest(req.id);
      if (res?.error) {
        toast.error(t("toasts.deleteFailed"));
        return;
      }
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      setConfirmTarget(null);
      toast.success(t("toasts.deleted"));
    });
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return [r.title, r.author, r.isbn].some((v) => v?.toLowerCase().includes(q));
    });
  }, [requests, filter, query]);

  const hasAny = requests.length > 0;
  const rowProps = {
    onUpdate: handleUpdate,
    onDelete: (req: BookRequest) => setConfirmTarget(req),
  };

  return (
    <div className="space-y-5">
      {/* ── Toolbar: status tabs + search ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("table.status")}>
          {FILTERS.map((value) => {
            const count =
              value === "all" ? requests.length : requests.filter((r) => r.status === value).length;
            const active = filter === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                aria-pressed={active}
                className={`rounded-full px-4 py-1.5 text-[12.5px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  active
                    ? "bg-brand text-white shadow-sm"
                    : "border border-divider bg-paper text-text-muted hover:border-brand/40 hover:text-text-body"
                }`}
              >
                {t(`filters.${value}`)}
                <span className={`ml-1.5 text-[11px] tabular-nums ${active ? "opacity-80" : "opacity-70"}`}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="h-10 w-full rounded-xl border border-divider bg-bg-surface pl-9 pr-3 text-sm text-text-body placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
      </div>

      {/* ── Content ── */}
      {visible.length === 0 ? (
        hasAny ? (
          <EmptyState
            icon={<SearchX className="h-6 w-6" />}
            title={t("noResults.title")}
            description={t("noResults.description")}
            action={
              <button
                type="button"
                onClick={() => {
                  setFilter("all");
                  setQuery("");
                }}
                className="inline-flex h-10 items-center rounded-xl border border-divider bg-bg-surface px-5 text-sm font-semibold text-text-body shadow-sm transition hover:bg-paper"
              >
                {t("noResults.clear")}
              </button>
            }
          />
        ) : (
          <EmptyState
            icon={<BookPlus className="h-6 w-6" />}
            title={t("empty.title")}
            description={t("empty.description")}
          />
        )
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm lg:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-divider bg-paper/60">
                    {(["request", "reason", "requested", "status"] as const).map((col) => (
                      <th
                        key={col}
                        scope="col"
                        className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-muted"
                      >
                        {t(`table.${col}`)}
                      </th>
                    ))}
                    <th
                      scope="col"
                      className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-text-muted"
                    >
                      {t("table.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider/60">
                  {visible.map((req) => (
                    <RequestRow
                      key={req.id}
                      req={req}
                      variant="table"
                      busy={busyId === req.id || deleteBusy}
                      {...rowProps}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 lg:hidden">
            {visible.map((req) => (
              <RequestRow
                key={req.id}
                req={req}
                variant="card"
                busy={busyId === req.id || deleteBusy}
                {...rowProps}
              />
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmTarget !== null}
        title={t("deleteDialog.title")}
        description={confirmTarget ? t("deleteDialog.description", { title: confirmTarget.title }) : undefined}
        hint={t("deleteDialog.hint")}
        confirmLabel={t("deleteDialog.confirm")}
        busyLabel={t("deleteDialog.busy")}
        busy={deleteBusy}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => confirmTarget && handleDelete(confirmTarget)}
      />
    </div>
  );
}
