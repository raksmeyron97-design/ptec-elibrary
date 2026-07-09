"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search, Mail, MailOpen, CheckCircle2, Ban, Trash2, Send,
  ChevronLeft, ChevronRight, ArrowLeft, Phone, AlertTriangle, Loader2,
} from "lucide-react";
import {
  adminListContactMessages,
  adminGetContactMessage,
  adminReplyToContactMessage,
  adminUpdateContactMessageStatus,
  adminUpdateContactMessagePriority,
  adminDeleteContactMessage,
  type ContactMessage,
  type ContactReply,
  type ContactMessageCounts,
  type ContactStatus,
  type ContactPriority,
} from "@/app/actions/contact-messages";
import { CONTACT_CATEGORIES, CONTACT_CATEGORY_LABELS, type ContactCategory } from "@/lib/contact/validate";
import ConfirmDialog from "@/components/admin/inbox/ConfirmDialog";
import { useToast, ToastStack } from "@/components/admin/inbox/Toast";

const STATUS_FILTERS: { label: string; value: ContactStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "New", value: "new" },
  { label: "Read", value: "read" },
  { label: "Replied", value: "replied" },
  { label: "Closed", value: "closed" },
  { label: "Spam", value: "spam" },
];

const STATUS_BADGE: Record<ContactStatus, string> = {
  new: "bg-blue-100 text-blue-800",
  read: "bg-slate-100 text-slate-700",
  replied: "bg-green-100 text-green-800",
  closed: "bg-gray-200 text-gray-700",
  spam: "bg-red-100 text-red-800",
};

const PRIORITY_BADGE: Record<ContactPriority, string> = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-blue-50 text-blue-700",
  high: "bg-red-100 text-red-700",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface DetailState {
  message: ContactMessage;
  replies: ContactReply[];
}

type ConfirmAction = { type: "delete" | "spam"; id: string; subject: string };

const PAGE_SIZE = 20;

export default function InboxClient({
  initial,
}: {
  initial: {
    messages: ContactMessage[];
    total: number;
    page: number;
    pageSize: number;
    counts: ContactMessageCounts;
  };
}) {
  const [messages, setMessages] = useState<ContactMessage[]>(initial.messages);
  const [total, setTotal] = useState(initial.total);
  const [page, setPage] = useState(initial.page);
  const [counts, setCounts] = useState<ContactMessageCounts>(initial.counts);
  const [loadingList, setLoadingList] = useState(false);

  const [statusFilter, setStatusFilter] = useState<ContactStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<ContactCategory | "all">("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const [replyBody, setReplyBody] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [sending, setSending] = useState(false);

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const toast = useToast();
  const skipNextFetch = useRef(true);

  // Debounce search input.
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const fetchList = useCallback(
    async (targetPage: number) => {
      setLoadingList(true);
      try {
        const res = await adminListContactMessages({
          status: statusFilter,
          category: categoryFilter,
          search: debouncedSearch || undefined,
          page: targetPage,
          pageSize: PAGE_SIZE,
        });
        setMessages(res.messages);
        setTotal(res.total);
        setPage(res.page);
        setCounts(res.counts);
      } catch {
        toast.error("Failed to load messages.");
      } finally {
        setLoadingList(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statusFilter, categoryFilter, debouncedSearch],
  );

  // Refetch whenever filters/search change (skip the very first mount — we
  // already have server-rendered initial data for the default "all" view).
  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    fetchList(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, categoryFilter, debouncedSearch]);

  async function selectMessage(id: string) {
    setSelectedId(id);
    setMobileView("detail");
    setLoadingDetail(true);
    setReplyBody("");
    setShowCcBcc(false);
    setCc("");
    setBcc("");
    try {
      const res = await adminGetContactMessage(id);
      if (!res) {
        toast.error("Message not found.");
        setDetail(null);
        return;
      }
      setDetail(res);
      // Reflect the new -> read auto-transition in the list without a refetch.
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: res.message.status } : m)));
      setCounts((prev) => {
        const wasNew = messages.find((m) => m.id === id)?.status === "new";
        if (!wasNew) return prev;
        return { ...prev, new: Math.max(0, prev.new - 1), read: prev.read + 1 };
      });
    } catch {
      toast.error("Failed to load message.");
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleSendReply() {
    if (!selectedId || !replyBody.trim()) return;
    setSending(true);
    try {
      const res = await adminReplyToContactMessage(selectedId, {
        replyBody,
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
      });
      if (!res.success) {
        toast.error(res.error ?? "Failed to send reply.");
        return;
      }
      if (res.reply) {
        setDetail((prev) => (prev ? { ...prev, replies: [...prev.replies, res.reply!], message: { ...prev.message, status: "replied" } } : prev));
        setMessages((prev) => prev.map((m) => (m.id === selectedId ? { ...m, status: "replied" } : m)));
        setCounts((prev) => ({ ...prev }));
      }
      setReplyBody("");
      setCc("");
      setBcc("");
      setShowCcBcc(false);
      if (res.warning) toast.warning(res.warning);
      else toast.success("Reply sent.");
    } catch {
      toast.error("Failed to send reply.");
    } finally {
      setSending(false);
    }
  }

  async function handleStatusChange(id: string, status: ContactStatus) {
    try {
      const res = await adminUpdateContactMessageStatus(id, status);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)));
      setDetail((prev) => (prev && prev.message.id === id ? { ...prev, message: { ...prev.message, status } } : prev));
      toast.success(`Marked as ${status}.`);
    } catch {
      toast.error("Failed to update status.");
    }
  }

  async function handlePriorityChange(id: string, priority: ContactPriority) {
    try {
      const res = await adminUpdateContactMessagePriority(id, priority);
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, priority } : m)));
      setDetail((prev) => (prev && prev.message.id === id ? { ...prev, message: { ...prev.message, priority } } : prev));
    } catch {
      toast.error("Failed to update priority.");
    }
  }

  async function handleConfirmedAction() {
    if (!confirmAction) return;
    setConfirmBusy(true);
    try {
      if (confirmAction.type === "delete") {
        const res = await adminDeleteContactMessage(confirmAction.id);
        if ("error" in res && res.error) {
          toast.error(res.error);
          return;
        }
        setMessages((prev) => prev.filter((m) => m.id !== confirmAction.id));
        setTotal((prev) => Math.max(0, prev - 1));
        if (selectedId === confirmAction.id) {
          setSelectedId(null);
          setDetail(null);
          setMobileView("list");
        }
        toast.success("Message deleted.");
      } else {
        await handleStatusChange(confirmAction.id, "spam");
      }
    } finally {
      setConfirmBusy(false);
      setConfirmAction(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="grid gap-4 lg:grid-cols-[200px_360px_1fr]">
      {/* ── Left: filters ─────────────────────────────────────────── */}
      <div className={`${mobileView === "detail" ? "hidden lg:block" : ""} space-y-5`}>
        <div>
          <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Status</p>
          <div className="flex flex-col gap-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
                  statusFilter === f.value
                    ? "bg-brand text-white shadow-sm"
                    : "text-text-body hover:bg-paper"
                }`}
              >
                <span>{f.label}</span>
                <span className={statusFilter === f.value ? "text-white/80" : "text-text-muted"}>
                  {f.value === "all" ? counts.all : counts[f.value]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Category</p>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as ContactCategory | "all")}
            className="w-full rounded-lg border border-divider bg-bg-surface px-3 py-2 text-[13px] text-text-body focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          >
            <option value="all">All Categories</option>
            {CONTACT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CONTACT_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Middle: message list ─────────────────────────────────── */}
      <div className={`${mobileView === "detail" ? "hidden lg:flex" : "flex"} flex-col rounded-2xl border border-divider bg-bg-surface`}>
        <div className="border-b border-divider p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, email, subject…"
              className="h-9 w-full rounded-lg border border-divider bg-paper pl-9 pr-3 text-[13px] text-text-body focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ maxHeight: "70vh" }}>
          {loadingList ? (
            <ListSkeleton />
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
              <Mail className="h-8 w-8 text-text-muted/40" />
              <p className="text-[13px] font-semibold text-text-muted">No messages found</p>
            </div>
          ) : (
            <ul role="list">
              {messages.map((m) => {
                const unread = m.status === "new";
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => selectMessage(m.id)}
                      className={`block w-full border-b border-divider px-4 py-3 text-left transition hover:bg-paper ${
                        selectedId === m.id ? "bg-brand/5" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate text-[13.5px] ${unread ? "font-bold text-text-heading" : "font-medium text-text-body"}`}>
                          {m.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-text-muted">{timeAgo(m.created_at)}</span>
                      </div>
                      <p className={`mt-0.5 truncate text-[13px] ${unread ? "font-semibold text-text-heading" : "text-text-muted"}`}>
                        {m.subject}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_BADGE[m.status]}`}>
                          {m.status}
                        </span>
                        <span className="rounded-full border border-divider px-2 py-0.5 text-[10px] font-medium text-text-muted">
                          {CONTACT_CATEGORY_LABELS[m.category]}
                        </span>
                        {!m.confirmation_sent && (
                          <span title="Confirmation email failed to send" className="text-amber-500">
                            <AlertTriangle className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-divider px-4 py-2.5">
          <p className="text-[11.5px] text-text-muted">
            {total === 0 ? "0 results" : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1 || loadingList}
              onClick={() => fetchList(page - 1)}
              className="rounded-md p-1 text-text-muted transition hover:bg-paper disabled:opacity-30"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[11.5px] text-text-muted">{page} / {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages || loadingList}
              onClick={() => fetchList(page + 1)}
              className="rounded-md p-1 text-text-muted transition hover:bg-paper disabled:opacity-30"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Right: detail + reply ────────────────────────────────── */}
      <div className={`${mobileView === "list" ? "hidden lg:block" : ""} rounded-2xl border border-divider bg-bg-surface`}>
        {!selectedId ? (
          <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-2 py-20 text-center">
            <MailOpen className="h-10 w-10 text-text-muted/30" />
            <p className="text-[13.5px] font-semibold text-text-muted">Select a message to view</p>
          </div>
        ) : loadingDetail || !detail ? (
          <DetailSkeleton />
        ) : (
          <MessageDetail
            detail={detail}
            onBack={() => setMobileView("list")}
            onStatusChange={(status) => handleStatusChange(detail.message.id, status)}
            onPriorityChange={(priority) => handlePriorityChange(detail.message.id, priority)}
            onRequestSpam={() => setConfirmAction({ type: "spam", id: detail.message.id, subject: detail.message.subject })}
            onRequestDelete={() => setConfirmAction({ type: "delete", id: detail.message.id, subject: detail.message.subject })}
            replyBody={replyBody}
            setReplyBody={setReplyBody}
            showCcBcc={showCcBcc}
            setShowCcBcc={setShowCcBcc}
            cc={cc}
            setCc={setCc}
            bcc={bcc}
            setBcc={setBcc}
            sending={sending}
            onSendReply={handleSendReply}
          />
        )}
      </div>

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.type === "delete" ? "Delete this message?" : "Mark as spam?"}
          description={
            confirmAction.type === "delete" ? (
              <>You are about to permanently delete <strong>{confirmAction.subject}</strong> and its reply history. This cannot be undone.</>
            ) : (
              <>Marking <strong>{confirmAction.subject}</strong> as spam moves it out of the active queue. You can change its status back later.</>
            )
          }
          confirmLabel={confirmAction.type === "delete" ? "Delete message" : "Mark as spam"}
          busyLabel={confirmAction.type === "delete" ? "Deleting…" : "Updating…"}
          tone={confirmAction.type === "delete" ? "danger" : "warning"}
          busy={confirmBusy}
          onCancel={() => setConfirmAction(null)}
          onConfirm={handleConfirmedAction}
        />
      )}

      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  );
}

function MessageDetail({
  detail,
  onBack,
  onStatusChange,
  onPriorityChange,
  onRequestSpam,
  onRequestDelete,
  replyBody,
  setReplyBody,
  showCcBcc,
  setShowCcBcc,
  cc,
  setCc,
  bcc,
  setBcc,
  sending,
  onSendReply,
}: {
  detail: DetailState;
  onBack: () => void;
  onStatusChange: (status: ContactStatus) => void;
  onPriorityChange: (priority: ContactPriority) => void;
  onRequestSpam: () => void;
  onRequestDelete: () => void;
  replyBody: string;
  setReplyBody: (v: string) => void;
  showCcBcc: boolean;
  setShowCcBcc: (v: boolean) => void;
  cc: string;
  setCc: (v: string) => void;
  bcc: string;
  setBcc: (v: string) => void;
  sending: boolean;
  onSendReply: () => void;
}) {
  const { message, replies } = detail;

  return (
    <div className="flex flex-col">
      <div className="border-b border-divider p-4 md:p-5">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-text-muted lg:hidden"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to inbox
        </button>

        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-[16px] font-bold text-text-heading">{message.subject}</h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRequestSpam}
              title="Mark as spam"
              className="rounded-lg border border-divider p-1.5 text-text-muted transition hover:border-red-200 hover:text-red-600"
            >
              <Ban className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onRequestDelete}
              title="Delete"
              className="rounded-lg border border-divider p-1.5 text-text-muted transition hover:border-red-200 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] text-text-body">
          <span className="font-semibold">{message.name}</span>
          <a href={`mailto:${message.email}`} className="text-brand hover:underline">{message.email}</a>
          {message.phone && (
            <span className="inline-flex items-center gap-1 text-text-muted">
              <Phone className="h-3 w-3" /> {message.phone}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-divider px-2.5 py-0.5 text-[11px] font-medium text-text-muted">
            {CONTACT_CATEGORY_LABELS[message.category]}
          </span>

          <select
            value={message.status}
            onChange={(e) => onStatusChange(e.target.value as ContactStatus)}
            className={`rounded-full border-0 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-brand/30 ${STATUS_BADGE[message.status]}`}
          >
            {(["new", "read", "replied", "closed", "spam"] as ContactStatus[]).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            value={message.priority}
            onChange={(e) => onPriorityChange(e.target.value as ContactPriority)}
            className={`rounded-full border-0 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-brand/30 ${PRIORITY_BADGE[message.priority]}`}
          >
            {(["low", "normal", "high"] as ContactPriority[]).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <span className="text-[11px] text-text-muted">{timeAgo(message.created_at)}</span>

          {!message.confirmation_sent && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
              <AlertTriangle className="h-3 w-3" /> Confirmation email failed
            </span>
          )}
        </div>
      </div>

      <div className="max-h-[45vh] space-y-4 overflow-y-auto p-4 md:p-5">
        <div className="rounded-xl border border-divider bg-paper p-4">
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-text-body">{message.message}</p>
        </div>

        {replies.map((r) => (
          <div key={r.id} className="rounded-xl border border-brand/20 bg-brand/5 p-4">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-bold text-text-heading">{r.admin_name}</span>
              <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
                {r.gmail_message_id ? (
                  <span className="inline-flex items-center gap-1 text-green-700">
                    <CheckCircle2 className="h-3 w-3" /> Sent
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="h-3 w-3" /> Not sent
                  </span>
                )}
                {timeAgo(r.created_at)}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-text-body">{r.reply_body}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-divider p-4 md:p-5">
        <textarea
          value={replyBody}
          onChange={(e) => setReplyBody(e.target.value)}
          placeholder={`Reply to ${message.name}…`}
          rows={4}
          className="w-full resize-none rounded-xl border border-divider bg-paper px-3.5 py-2.5 text-[13.5px] text-text-body focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />

        {showCcBcc ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="Cc"
              className="h-9 rounded-lg border border-divider bg-paper px-3 text-[12.5px] text-text-body focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            <input
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              placeholder="Bcc"
              className="h-9 rounded-lg border border-divider bg-paper px-3 text-[12.5px] text-text-body focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCcBcc(true)}
            className="mt-1.5 text-[12px] font-semibold text-text-muted hover:text-brand"
          >
            + Add Cc/Bcc
          </button>
        )}

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onSendReply}
            disabled={sending || !replyBody.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-[13px] font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Sending…" : "Send reply"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-0">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse border-b border-divider px-4 py-3">
          <div className="h-3.5 w-2/3 rounded bg-paper" />
          <div className="mt-2 h-3 w-1/2 rounded bg-paper" />
          <div className="mt-2 h-4 w-20 rounded-full bg-paper" />
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-5">
      <div className="h-5 w-2/3 rounded bg-paper" />
      <div className="h-3.5 w-1/2 rounded bg-paper" />
      <div className="h-24 w-full rounded-xl bg-paper" />
      <div className="h-32 w-full rounded-xl bg-paper" />
    </div>
  );
}
