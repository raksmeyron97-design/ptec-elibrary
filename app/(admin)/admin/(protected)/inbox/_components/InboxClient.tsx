"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  Loader2,
  Mail,
  MailOpen,
  Phone,
  RotateCcw,
  Save,
  Search,
  Send,
  StickyNote,
  Trash2,
} from "lucide-react";
import {
  adminAddContactNote,
  adminDeleteContactMessage,
  adminGetContactMessage,
  adminListContactMessages,
  adminReplyToContactMessage,
  adminRetryContactEmail,
  adminSaveContactReplyDraft,
  adminUpdateContactMessagePriority,
  adminUpdateContactMessageStatus,
  type ContactDetail,
  type ContactEmailStatus,
  type ContactMessage,
  type ContactMessageCounts,
  type ContactPriority,
  type ContactStatus,
  type ContactStatusFilter,
  type RetryEmailKind,
} from "@/app/actions/contact-messages";
import { CONTACT_CATEGORIES, CONTACT_CATEGORY_LABELS, type ContactCategory } from "@/lib/contact/validate";
import ConfirmDialog from "@/components/admin/inbox/ConfirmDialog";
import { useToast } from "@/components/admin/kit";

const STATUS_FILTERS: { label: string; value: ContactStatusFilter; icon: React.ElementType }[] = [
  { label: "All", value: "all", icon: Mail },
  { label: "Needs Attention", value: "needs_attention", icon: AlertTriangle },
  { label: "New", value: "new", icon: Mail },
  { label: "Read", value: "read", icon: MailOpen },
  { label: "Pending Reply", value: "pending_reply", icon: Clock3 },
  { label: "Replied", value: "replied", icon: CheckCircle2 },
  { label: "Email Failed", value: "email_failed", icon: AlertTriangle },
  { label: "Closed", value: "closed", icon: CheckCircle2 },
  { label: "Spam", value: "spam", icon: Ban },
];

const STATUS_LABEL: Record<ContactStatus, string> = {
  new: "New",
  read: "Read",
  pending_reply: "Pending Reply",
  replied: "Replied",
  email_failed: "Email Failed",
  closed: "Closed",
  spam: "Spam",
};

const STATUS_BADGE: Record<ContactStatus, string> = {
  new: "bg-blue-100 text-blue-800",
  read: "bg-slate-100 text-slate-700",
  pending_reply: "bg-sky-100 text-sky-800",
  replied: "bg-green-100 text-green-800",
  email_failed: "bg-red-100 text-red-800",
  closed: "bg-gray-200 text-gray-700",
  spam: "bg-red-100 text-red-800",
};

const PRIORITY_BADGE: Record<ContactPriority, string> = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-blue-50 text-blue-700",
  high: "bg-red-100 text-red-700",
};

const PRIORITY_LABEL: Record<ContactPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

type DeliveryDisplay = ContactEmailStatus | "not_sent";

const DELIVERY_LABEL: Record<DeliveryDisplay, string> = {
  sent: "Sent",
  pending: "Pending",
  failed: "Failed",
  not_sent: "Not sent",
};

const DELIVERY_BADGE: Record<DeliveryDisplay, string> = {
  sent: "bg-green-100 text-green-800",
  pending: "bg-sky-100 text-sky-800",
  failed: "bg-red-100 text-red-800",
  not_sent: "bg-slate-100 text-slate-600",
};

const REPLY_TEMPLATES = [
  {
    key: "general",
    label: "General reply",
    body: "Hello {name},\n\nThank you for contacting PTEC Library. We have reviewed your message and will be happy to help.\n\nBest regards,\nPTEC Library Team",
  },
  {
    key: "book_request",
    label: "Book request reply",
    body: "Hello {name},\n\nThank you for your book request. We will check the library catalog and let you know about availability or possible alternatives.\n\nBest regards,\nPTEC Library Team",
  },
  {
    key: "thesis_support",
    label: "Thesis support reply",
    body: "Hello {name},\n\nThank you for contacting us about thesis or research support. Please share any additional details, such as title, author, program, or year, so we can help locate the material.\n\nBest regards,\nPTEC Library Team",
  },
  {
    key: "account_problem",
    label: "Account problem reply",
    body: "Hello {name},\n\nThank you for reporting this account issue. We are checking your library account and will follow up with the next step shortly.\n\nBest regards,\nPTEC Library Team",
  },
  {
    key: "technical_problem",
    label: "Technical problem reply",
    body: "Hello {name},\n\nThank you for reporting the technical problem. Please send any screenshots, device details, or browser information that may help us reproduce the issue.\n\nBest regards,\nPTEC Library Team",
  },
  {
    key: "follow_up",
    label: "Follow-up request",
    body: "Hello {name},\n\nThank you for your message. Could you please send a few more details so we can assist you more accurately?\n\nBest regards,\nPTEC Library Team",
  },
  {
    key: "closing",
    label: "Closing message",
    body: "Hello {name},\n\nWe believe this request has been resolved. Thank you for contacting PTEC Library, and please reach out again if you need more help.\n\nBest regards,\nPTEC Library Team",
  },
] as const;

type ConfirmAction = { type: "delete" | "spam"; id: string; subject: string };

const PAGE_SIZE = 20;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function defaultReplySubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;
}

function messagePreview(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 130);
}

function hasFailedDelivery(message: ContactMessage): boolean {
  return (
    message.admin_notification_status === "failed" ||
    message.user_confirmation_status === "failed" ||
    message.last_reply_status === "failed" ||
    message.status === "email_failed"
  );
}

function failedDeliveryCount(message: ContactMessage): number {
  return [
    message.admin_notification_status === "failed",
    message.user_confirmation_status === "failed",
    message.last_reply_status === "failed",
  ].filter(Boolean).length;
}

function deliveryWarnings(message: ContactMessage): string[] {
  const warnings: string[] = [];
  if (message.admin_notification_status === "failed") warnings.push("Admin notification failed");
  if (message.user_confirmation_status === "failed") warnings.push("Confirmation email failed");
  if (message.last_reply_status === "failed") warnings.push("Last reply failed");
  return warnings;
}

function validateEmailList(raw: string, label: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const invalid = trimmed
    .split(/[;,]/)
    .flatMap((item) => {
      const email = item.trim();
      return email ? [email] : [];
    })
    .find((email) => !EMAIL_RE.test(email));
  return invalid ? `${label} contains an invalid email: ${invalid}` : null;
}

function filterCount(counts: ContactMessageCounts, filter: ContactStatusFilter): number {
  return filter === "all" ? counts.all : counts[filter];
}

function emptyListCopy(statusFilter: ContactStatusFilter, categoryFilter: ContactCategory | "all", search: string) {
  if (search.trim()) {
    return {
      title: "No messages match your search.",
      body: "Try a sender name, email, phone number, subject, or message text.",
    };
  }
  if (statusFilter === "spam") {
    return { title: "No spam messages found.", body: "Try changing the status or category filter." };
  }
  if (statusFilter === "needs_attention") {
    return { title: "No messages need attention.", body: "New, unreplied, and failed email conversations will appear here." };
  }
  if (statusFilter !== "all") {
    return { title: `No ${STATUS_LABEL[statusFilter].toLowerCase()} messages found.`, body: "Try changing the status or category filter." };
  }
  if (categoryFilter !== "all") {
    return { title: `No ${CONTACT_CATEGORY_LABELS[categoryFilter].toLowerCase()} messages found.`, body: "Try changing the category filter." };
  }
  return { title: "No messages found.", body: "Messages from the public contact form will appear here." };
}

function renderTemplate(templateKey: string, name: string): string {
  return REPLY_TEMPLATES.find((template) => template.key === templateKey)?.body.replaceAll("{name}", name) ?? "";
}

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

  const [statusFilter, setStatusFilter] = useState<ContactStatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<ContactCategory | "all">("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const [replySubject, setReplySubject] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [sendingMode, setSendingMode] = useState<"reply" | "close" | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);

  const [noteBody, setNoteBody] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [retryingKind, setRetryingKind] = useState<RetryEmailKind | null>(null);

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const toast = useToast();
  const skipNextFetch = useRef(true);

  const emptyCopy = useMemo(
    () => emptyListCopy(statusFilter, categoryFilter, debouncedSearch),
    [categoryFilter, debouncedSearch, statusFilter],
  );

  const clearComposer = useCallback((message?: ContactMessage) => {
    setReplySubject(message ? defaultReplySubject(message.subject) : "");
    setReplyBody("");
    setCc("");
    setBcc("");
    setTemplateKey("");
    setComposerError(null);
  }, []);

  const applyDetail = useCallback(
    (nextDetail: ContactDetail | null) => {
      setDetail(nextDetail);
      if (!nextDetail) {
        setSelectedId(null);
        clearComposer();
        return;
      }

      setSelectedId(nextDetail.message.id);
      setReplySubject(nextDetail.draft?.subject || defaultReplySubject(nextDetail.message.subject));
      setReplyBody(nextDetail.draft?.reply_body ?? "");
      setCc(nextDetail.draft?.cc ?? "");
      setBcc(nextDetail.draft?.bcc ?? "");
      setTemplateKey("");
      setComposerError(null);
    },
    [clearComposer],
  );

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
        if (selectedId && !res.messages.some((message) => message.id === selectedId)) {
          applyDetail(null);
          setMobileView("list");
        }
      } catch {
        toast.error("Failed to load messages.");
      } finally {
        setLoadingList(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statusFilter, categoryFilter, debouncedSearch, selectedId, applyDetail],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

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
    clearComposer();
    try {
      const res = await adminGetContactMessage(id);
      if (!res) {
        toast.error("Message not found.");
        applyDetail(null);
        return;
      }
      applyDetail(res);
      setMessages((prev) => prev.map((m) => (m.id === id ? res.message : m)));
      if (messages.find((m) => m.id === id)?.status === "new") await fetchList(page);
    } catch {
      toast.error("Failed to load message.");
    } finally {
      setLoadingDetail(false);
    }
  }

  function validateComposer(): boolean {
    if (!detail) return false;
    if (!EMAIL_RE.test(detail.message.email)) {
      setComposerError("Recipient email is invalid.");
      return false;
    }
    if (!replySubject.trim()) {
      setComposerError("Subject is required.");
      return false;
    }
    if (!replyBody.trim()) {
      setComposerError("Reply body is required.");
      return false;
    }
    const ccError = validateEmailList(cc, "Cc");
    if (ccError) {
      setComposerError(ccError);
      return false;
    }
    const bccError = validateEmailList(bcc, "Bcc");
    if (bccError) {
      setComposerError(bccError);
      return false;
    }
    setComposerError(null);
    return true;
  }

  async function handleSendReply(sendAndClose = false) {
    if (!selectedId || !detail || !validateComposer()) return;
    setSendingMode(sendAndClose ? "close" : "reply");
    try {
      const res = await adminReplyToContactMessage(selectedId, {
        subject: replySubject,
        replyBody,
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        sendAndClose,
      });
      if (!res.success) {
        toast.error(res.error ?? "Failed to send reply.");
        return;
      }

      if (res.detail) applyDetail(res.detail);
      if (res.message) {
        setMessages((prev) => prev.map((m) => (m.id === selectedId ? res.message! : m)));
      }
      await fetchList(page);

      if (res.warning) toast.warning("Reply saved, but email delivery failed.");
      else toast.success(sendAndClose ? "Reply sent and conversation closed." : "Reply sent.");

      if (!res.warning && res.detail) clearComposer(res.detail.message);
    } catch {
      toast.error("Failed to send reply.");
    } finally {
      setSendingMode(null);
    }
  }

  async function handleSaveDraft() {
    if (!selectedId) return;
    const ccError = validateEmailList(cc, "Cc");
    const bccError = validateEmailList(bcc, "Bcc");
    if (ccError || bccError) {
      setComposerError(ccError ?? bccError);
      return;
    }

    setSavingDraft(true);
    try {
      const res = await adminSaveContactReplyDraft(selectedId, {
        subject: replySubject,
        replyBody,
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
      });
      if (!res.success) {
        toast.error(res.error ?? "Failed to save draft.");
        return;
      }
      setComposerError(null);
      toast.success(res.draft ? "Draft saved." : "Draft cleared.");
    } catch {
      toast.error("Failed to save draft.");
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleAddNote() {
    if (!selectedId || !noteBody.trim()) return;
    setAddingNote(true);
    try {
      const res = await adminAddContactNote(selectedId, noteBody);
      if (!res.success || !res.note) {
        toast.error(res.error ?? "Failed to add note.");
        return;
      }
      setDetail((prev) => (prev ? { ...prev, notes: [...prev.notes, res.note!] } : prev));
      setNoteBody("");
      toast.success("Internal note added.");
    } catch {
      toast.error("Failed to add note.");
    } finally {
      setAddingNote(false);
    }
  }

  async function handleRetry(kind: RetryEmailKind) {
    if (!selectedId) return;
    setRetryingKind(kind);
    try {
      const res = await adminRetryContactEmail(selectedId, kind);
      if (res.detail) {
        setDetail(res.detail);
        setMessages((prev) => prev.map((m) => (m.id === selectedId ? res.detail!.message : m)));
      }
      await fetchList(page);
      if (!res.success) {
        toast.error(res.error ?? "Retry failed.");
        return;
      }
      const attempted = res.attempts.filter((attempt) => !attempt.skipped).length;
      toast.success(attempted > 1 ? "Failed emails retried." : "Email retried.");
    } catch {
      toast.error("Retry failed.");
    } finally {
      setRetryingKind(null);
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
      await fetchList(page);
      toast.success(`Marked as ${STATUS_LABEL[status].toLowerCase()}.`);
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
      toast.success("Priority updated.");
    } catch {
      toast.error("Failed to update priority.");
    }
  }

  async function handleCopyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Email copied.");
    } catch {
      toast.error("Could not copy email.");
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
          applyDetail(null);
          setMobileView("list");
        }
        await fetchList(page);
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
  const isDetailEmptyFromFilter = !loadingList && messages.length === 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_390px_minmax(0,1fr)]">
      <aside className={`${mobileView === "detail" ? "hidden lg:block" : ""} space-y-5`}>
        <div>
          <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">Status</p>
          <div className="flex flex-col gap-1">
            {STATUS_FILTERS.map((filter) => {
              const Icon = filter.icon;
              const active = statusFilter === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatusFilter(filter.value)}
                  className={`flex min-h-10 items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-brand/30 ${
                    active ? "bg-brand text-white shadow-sm" : "text-text-body hover:bg-paper"
                  }`}
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{filter.label}</span>
                  </span>
                  <span className={active ? "text-white/80" : "text-text-muted"}>{filterCount(counts, filter.value)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor="inbox-category" className="mb-2 block px-1 text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Category
          </label>
          <select
            id="inbox-category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as ContactCategory | "all")}
            className="w-full rounded-lg border border-divider bg-bg-surface px-3 py-2 text-[13px] text-text-body focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          >
            <option value="all">All categories</option>
            {CONTACT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CONTACT_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>
      </aside>

      <section className={`${mobileView === "detail" ? "hidden lg:flex" : "flex"} min-h-[70vh] flex-col rounded-2xl border border-divider bg-bg-surface`}>
        <div className="border-b border-divider p-3">
          <label htmlFor="inbox-search" className="sr-only">
            Search contact messages
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              id="inbox-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, email, phone, subject..."
              className="h-10 w-full rounded-lg border border-divider bg-paper pl-9 pr-3 text-[13px] text-text-body focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ maxHeight: "72vh" }}>
          {loadingList ? (
            <ListSkeleton />
          ) : messages.length === 0 ? (
            <EmptyState icon={Mail} title={emptyCopy.title} body={emptyCopy.body} />
          ) : (
            <ul role="list" className="divide-y divide-divider">
              {messages.map((message) => (
                <MessageListItem
                  key={message.id}
                  message={message}
                  selected={selectedId === message.id}
                  onSelect={() => selectMessage(message.id)}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-divider px-4 py-2.5">
          <p className="text-[11.5px] text-text-muted">
            {total === 0 ? "0 results" : `${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} of ${total}`}
          </p>
          <div className="flex items-center gap-1">
            <IconButton
              label="Previous page"
              disabled={page <= 1 || loadingList}
              onClick={() => fetchList(page - 1)}
              icon={ChevronLeft}
            />
            <span className="min-w-12 text-center text-[11.5px] text-text-muted">
              {page} / {totalPages}
            </span>
            <IconButton
              label="Next page"
              disabled={page >= totalPages || loadingList}
              onClick={() => fetchList(page + 1)}
              icon={ChevronRight}
            />
          </div>
        </div>
      </section>

      <section className={`${mobileView === "list" ? "hidden lg:block" : ""} min-w-0 rounded-2xl border border-divider bg-bg-surface`}>
        {!selectedId || !detail ? (
          loadingDetail ? (
            <DetailSkeleton />
          ) : (
            <EmptyState
              icon={MailOpen}
              title={isDetailEmptyFromFilter ? emptyCopy.title : "No message selected"}
              body={isDetailEmptyFromFilter ? emptyCopy.body : "Choose a message from the inbox to view and reply."}
              minHeightClass="min-h-[520px]"
            />
          )
        ) : loadingDetail ? (
          <DetailSkeleton />
        ) : (
          <MessageDetail
            detail={detail}
            onBack={() => setMobileView("list")}
            onStatusChange={(status) => handleStatusChange(detail.message.id, status)}
            onPriorityChange={(priority) => handlePriorityChange(detail.message.id, priority)}
            onRequestSpam={() => setConfirmAction({ type: "spam", id: detail.message.id, subject: detail.message.subject })}
            onRequestDelete={() => setConfirmAction({ type: "delete", id: detail.message.id, subject: detail.message.subject })}
            onCopyEmail={() => handleCopyEmail(detail.message.email)}
            onRetry={handleRetry}
            retryingKind={retryingKind}
            replySubject={replySubject}
            setReplySubject={setReplySubject}
            replyBody={replyBody}
            setReplyBody={setReplyBody}
            cc={cc}
            setCc={setCc}
            bcc={bcc}
            setBcc={setBcc}
            templateKey={templateKey}
            onTemplateChange={(key) => {
              setTemplateKey(key);
              const text = renderTemplate(key, detail.message.name);
              if (!text) return;
              setReplyBody((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
            }}
            composerError={composerError}
            sendingMode={sendingMode}
            savingDraft={savingDraft}
            onSendReply={() => handleSendReply(false)}
            onSendAndClose={() => handleSendReply(true)}
            onSaveDraft={handleSaveDraft}
            noteBody={noteBody}
            setNoteBody={setNoteBody}
            addingNote={addingNote}
            onAddNote={handleAddNote}
          />
        )}
      </section>

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.type === "delete" ? "Delete this message?" : "Mark as spam?"}
          description={
            confirmAction.type === "delete" ? (
              <>
                You are about to permanently delete <strong>{confirmAction.subject}</strong> and its reply history. This cannot be undone.
              </>
            ) : (
              <>
                Marking <strong>{confirmAction.subject}</strong> as spam moves it out of the active queue. You can change its status back later.
              </>
            )
          }
          confirmLabel={confirmAction.type === "delete" ? "Delete message" : "Mark as spam"}
          busyLabel={confirmAction.type === "delete" ? "Deleting..." : "Updating..."}
          tone={confirmAction.type === "delete" ? "danger" : "warning"}
          busy={confirmBusy}
          onCancel={() => setConfirmAction(null)}
          onConfirm={handleConfirmedAction}
        />
      )}
    </div>
  );
}

function MessageListItem({
  message,
  selected,
  onSelect,
}: {
  message: ContactMessage;
  selected: boolean;
  onSelect: () => void;
}) {
  const unread = message.status === "new";

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`block w-full px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand/30 hover:bg-paper ${
          selected ? "bg-brand/5" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
              <span className={`truncate text-[13.5px] ${unread ? "font-bold text-text-heading" : "font-semibold text-text-body"}`}>
                {message.name}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[12px] text-text-muted">{message.email}</p>
          </div>
          <span className="shrink-0 text-[11px] text-text-muted">{timeAgo(message.created_at)}</span>
        </div>
        <p className={`mt-1.5 truncate text-[13px] ${unread ? "font-semibold text-text-heading" : "font-medium text-text-body"}`}>
          {message.subject}
        </p>
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-5 text-text-muted">{messagePreview(message.message)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={message.status} />
          <span className="rounded-full border border-divider px-2 py-0.5 text-[10px] font-medium text-text-muted">
            {CONTACT_CATEGORY_LABELS[message.category]}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${PRIORITY_BADGE[message.priority]}`}>
            {PRIORITY_LABEL[message.priority]}
          </span>
          {hasFailedDelivery(message) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
              <AlertTriangle className="h-3 w-3" /> Email warning
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

function MessageDetail({
  detail,
  onBack,
  onStatusChange,
  onPriorityChange,
  onRequestSpam,
  onRequestDelete,
  onCopyEmail,
  onRetry,
  retryingKind,
  replySubject,
  setReplySubject,
  replyBody,
  setReplyBody,
  cc,
  setCc,
  bcc,
  setBcc,
  templateKey,
  onTemplateChange,
  composerError,
  sendingMode,
  savingDraft,
  onSendReply,
  onSendAndClose,
  onSaveDraft,
  noteBody,
  setNoteBody,
  addingNote,
  onAddNote,
}: {
  detail: ContactDetail;
  onBack: () => void;
  onStatusChange: (status: ContactStatus) => void;
  onPriorityChange: (priority: ContactPriority) => void;
  onRequestSpam: () => void;
  onRequestDelete: () => void;
  onCopyEmail: () => void;
  onRetry: (kind: RetryEmailKind) => void;
  retryingKind: RetryEmailKind | null;
  replySubject: string;
  setReplySubject: (v: string) => void;
  replyBody: string;
  setReplyBody: (v: string) => void;
  cc: string;
  setCc: (v: string) => void;
  bcc: string;
  setBcc: (v: string) => void;
  templateKey: string;
  onTemplateChange: (key: string) => void;
  composerError: string | null;
  sendingMode: "reply" | "close" | null;
  savingDraft: boolean;
  onSendReply: () => void;
  onSendAndClose: () => void;
  onSaveDraft: () => void;
  noteBody: string;
  setNoteBody: (v: string) => void;
  addingNote: boolean;
  onAddNote: () => void;
}) {
  const { message } = detail;
  const warnings = deliveryWarnings(message);
  const failedCount = failedDeliveryCount(message);

  return (
    <div className="flex min-h-[70vh] flex-col">
      <header className="border-b border-divider p-4 md:p-5">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/30 lg:hidden"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to inbox
        </button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="break-words text-[18px] font-bold leading-snug text-text-heading">{message.subject}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-text-body">
              <span className="font-semibold">{message.name}</span>
              <a href={`mailto:${message.email}`} className="text-brand hover:underline">
                {message.email}
              </a>
              {message.phone && (
                <span className="inline-flex items-center gap-1 text-text-muted">
                  <Phone className="h-3 w-3" /> {message.phone}
                </span>
              )}
              <span className="text-text-muted">{new Date(message.created_at).toLocaleString()}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <IconButton label="Mark as unread" icon={Mail} onClick={() => onStatusChange("new")} />
            <IconButton label="Mark as read" icon={MailOpen} onClick={() => onStatusChange("read")} />
            <IconButton label="Close conversation" icon={CheckCircle2} onClick={() => onStatusChange("closed")} />
            <IconButton label="Copy email" icon={Copy} onClick={onCopyEmail} />
            <IconButton label="Mark as spam" icon={Ban} onClick={onRequestSpam} tone="danger" />
            <IconButton label="Delete" icon={Trash2} onClick={onRequestDelete} tone="danger" />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-divider px-2.5 py-0.5 text-[11px] font-medium text-text-muted">
            {CONTACT_CATEGORY_LABELS[message.category]}
          </span>
          <select
            value={message.status}
            onChange={(e) => onStatusChange(e.target.value as ContactStatus)}
            className={`rounded-full border-0 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-brand/30 ${STATUS_BADGE[message.status]}`}
            aria-label="Message status"
          >
            {Object.keys(STATUS_LABEL).map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status as ContactStatus]}
              </option>
            ))}
          </select>
          <select
            value={message.priority}
            onChange={(e) => onPriorityChange(e.target.value as ContactPriority)}
            className={`rounded-full border-0 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide focus:outline-none focus:ring-2 focus:ring-brand/30 ${PRIORITY_BADGE[message.priority]}`}
            aria-label="Message priority"
          >
            {(["low", "normal", "high"] as ContactPriority[]).map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABEL[priority]}
              </option>
            ))}
          </select>
          {warnings.map((warning) => (
            <span key={warning} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
              <AlertTriangle className="h-3 w-3" /> {warning}
            </span>
          ))}
        </div>

        <DeliverySummary message={message} onRetry={onRetry} retryingKind={retryingKind} failedCount={failedCount} />
      </header>

      <ThreadView detail={detail} />

      <section className="border-t border-divider p-4 md:p-5">
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-amber-800">
            <StickyNote className="h-3.5 w-3.5" /> Internal note - only visible to admins
          </div>
          <label htmlFor="internal-note" className="sr-only">
            Internal note
          </label>
          <textarea
            id="internal-note"
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            rows={2}
            placeholder="Add context for the team. This will not be emailed."
            className="w-full resize-none rounded-lg border border-amber-200 bg-white px-3 py-2 text-[13px] text-text-body focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={onAddNote}
              disabled={addingNote || !noteBody.trim()}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[12px] font-bold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StickyNote className="h-3.5 w-3.5" />}
              Add note
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-divider bg-paper p-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <div>
              <label htmlFor="reply-subject" className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
                Subject
              </label>
              <input
                id="reply-subject"
                value={replySubject}
                onChange={(e) => setReplySubject(e.target.value)}
                className="h-10 w-full rounded-lg border border-divider bg-white px-3 text-[13px] text-text-body focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <div>
              <label htmlFor="reply-template" className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
                Template
              </label>
              <select
                id="reply-template"
                value={templateKey}
                onChange={(e) => onTemplateChange(e.target.value)}
                className="h-10 w-full rounded-lg border border-divider bg-white px-3 text-[13px] text-text-body focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              >
                <option value="">Choose template</option>
                {REPLY_TEMPLATES.map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="reply-cc" className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
                Cc
              </label>
              <input
                id="reply-cc"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="name@example.com"
                className="h-9 w-full rounded-lg border border-divider bg-white px-3 text-[12.5px] text-text-body focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <div>
              <label htmlFor="reply-bcc" className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
                Bcc
              </label>
              <input
                id="reply-bcc"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="name@example.com"
                className="h-9 w-full rounded-lg border border-divider bg-white px-3 text-[12.5px] text-text-body focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
          </div>

          <div className="mt-3">
            <label htmlFor="reply-body" className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
              Reply body
            </label>
            <textarea
              id="reply-body"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder={`Reply to ${message.name}`}
              rows={5}
              className="w-full resize-y rounded-xl border border-divider bg-white px-3.5 py-2.5 text-[13.5px] leading-6 text-text-body focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>

          {composerError && (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" /> {composerError}
            </p>
          )}

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={savingDraft || Boolean(sendingMode)}
              className="inline-flex items-center gap-2 rounded-lg border border-divider bg-white px-3.5 py-2 text-[12.5px] font-bold text-text-body transition hover:bg-bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save draft
            </button>
            <button
              type="button"
              onClick={onSendReply}
              disabled={Boolean(sendingMode) || !replyBody.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[12.5px] font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendingMode === "reply" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sendingMode === "reply" ? "Sending..." : "Send reply"}
            </button>
            <button
              type="button"
              onClick={onSendAndClose}
              disabled={Boolean(sendingMode) || !replyBody.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-[12.5px] font-bold text-white shadow-sm transition hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sendingMode === "close" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {sendingMode === "close" ? "Sending..." : "Send & close"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function DeliverySummary({
  message,
  onRetry,
  retryingKind,
  failedCount,
}: {
  message: ContactMessage;
  onRetry: (kind: RetryEmailKind) => void;
  retryingKind: RetryEmailKind | null;
  failedCount: number;
}) {
  return (
    <div className="mt-4 rounded-xl border border-divider bg-paper p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Email Delivery</p>
        {failedCount > 1 && (
          <RetryButton
            label="Retry all failed emails"
            kind="all_failed"
            onRetry={onRetry}
            retryingKind={retryingKind}
          />
        )}
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <DeliveryRow
          label="Admin notification"
          status={message.admin_notification_status}
          retryKind="admin_notification"
          onRetry={onRetry}
          retryingKind={retryingKind}
        />
        <DeliveryRow
          label="User confirmation"
          status={message.user_confirmation_status}
          retryKind="user_confirmation"
          onRetry={onRetry}
          retryingKind={retryingKind}
        />
        <DeliveryRow
          label="Last admin reply"
          status={message.last_reply_status ?? "not_sent"}
          retryKind="last_reply"
          onRetry={onRetry}
          retryingKind={retryingKind}
        />
      </div>
      {message.last_email_error && (
        <p className="mt-2 line-clamp-2 text-[11.5px] text-amber-800">Last error: {message.last_email_error}</p>
      )}
    </div>
  );
}

function DeliveryRow({
  label,
  status,
  retryKind,
  onRetry,
  retryingKind,
}: {
  label: string;
  status: DeliveryDisplay;
  retryKind: Exclude<RetryEmailKind, "all_failed">;
  onRetry: (kind: RetryEmailKind) => void;
  retryingKind: RetryEmailKind | null;
}) {
  return (
    <div className="rounded-lg border border-divider bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-text-body">{label}</span>
        <DeliveryBadge status={status} />
      </div>
      {status === "failed" && (
        <div className="mt-1.5">
          <RetryButton label={`Retry ${label.toLowerCase()}`} kind={retryKind} onRetry={onRetry} retryingKind={retryingKind} />
        </div>
      )}
    </div>
  );
}

function RetryButton({
  label,
  kind,
  onRetry,
  retryingKind,
}: {
  label: string;
  kind: RetryEmailKind;
  onRetry: (kind: RetryEmailKind) => void;
  retryingKind: RetryEmailKind | null;
}) {
  const busy = retryingKind === kind;
  return (
    <button
      type="button"
      onClick={() => onRetry(kind)}
      disabled={Boolean(retryingKind)}
      className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
      {busy ? "Retrying..." : label}
    </button>
  );
}

function ThreadView({ detail }: { detail: ContactDetail }) {
  const { message, replies, notes } = detail;
  const items = [
    ...replies.map((reply) => ({ type: "reply" as const, at: reply.created_at, reply })),
    ...notes.map((note) => ({ type: "note" as const, at: note.created_at, note })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-5" style={{ maxHeight: "52vh" }}>
      <div className="flex justify-start">
        <div className="max-w-[88%] rounded-xl rounded-tl-sm border border-divider bg-white p-4">
          <ThreadMeta label="USER MESSAGE" name={message.name} time={timeAgo(message.created_at)} />
          <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-text-body">{message.message}</p>
        </div>
      </div>

      <SystemEvents message={message} />

      {items.map((item) =>
        item.type === "reply" ? (
          <div key={`reply-${item.reply.id}`} className="flex justify-end">
            <div className="max-w-[88%] rounded-xl rounded-tr-sm border border-brand/20 bg-brand/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ThreadMeta label="ADMIN REPLY" name={item.reply.admin_name} time={timeAgo(item.reply.created_at)} />
                <DeliveryBadge status={item.reply.delivery_status} />
              </div>
              <p className="mt-1 text-[12px] font-semibold text-text-muted">{item.reply.subject}</p>
              <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-text-body">{item.reply.reply_body}</p>
              {item.reply.email_error && (
                <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11.5px] font-medium text-amber-800">
                  {item.reply.email_error}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div key={`note-${item.note.id}`} className="flex justify-start">
            <div className="max-w-[88%] rounded-xl border border-amber-200 bg-amber-50 p-4">
              <ThreadMeta label="INTERNAL NOTE" name={item.note.admin_name} time={timeAgo(item.note.created_at)} />
              <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-amber-950">{item.note.note_body}</p>
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function SystemEvents({ message }: { message: ContactMessage }) {
  const events = [
    {
      key: "admin_notification",
      show: message.admin_notification_status !== "sent",
      text: `Admin notification email ${DELIVERY_LABEL[message.admin_notification_status].toLowerCase()}.`,
      status: message.admin_notification_status,
    },
    {
      key: "user_confirmation",
      show: message.user_confirmation_status !== "sent",
      text: `User confirmation email ${DELIVERY_LABEL[message.user_confirmation_status].toLowerCase()}.`,
      status: message.user_confirmation_status,
    },
  ].filter((event) => event.show);

  if (events.length === 0) return null;

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <div key={event.key} className="mx-auto max-w-[88%] rounded-lg border border-divider bg-paper px-3 py-2 text-[12px] text-text-muted">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wide">
              <FileText className="h-3 w-3" /> SYSTEM EVENT
            </span>
            <DeliveryBadge status={event.status} />
          </div>
          <p className="mt-1">{event.text}</p>
        </div>
      ))}
    </div>
  );
}

function ThreadMeta({ label, name, time }: { label: string; name: string; time: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <span className="font-bold uppercase tracking-wide text-text-muted">{label}</span>
      <span className="font-semibold text-text-heading">{name}</span>
      <span className="text-text-muted">{time}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: ContactStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_BADGE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function DeliveryBadge({ status }: { status: DeliveryDisplay }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${DELIVERY_BADGE[status]}`}>
      {DELIVERY_LABEL[status]}
    </span>
  );
}

function IconButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  tone = "neutral",
}: {
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-text-muted hover:border-red-200 hover:bg-red-50 hover:text-red-600"
      : "text-text-muted hover:border-brand/30 hover:bg-brand/5 hover:text-brand";

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-divider transition focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function EmptyState({
  icon: Icon,
  title,
  body,
  minHeightClass = "min-h-[360px]",
}: {
  icon: React.ElementType;
  title: string;
  body: string;
  minHeightClass?: string;
}) {
  return (
    <div className={`flex ${minHeightClass} flex-col items-center justify-center gap-2 px-6 py-16 text-center`}>
      <Icon className="h-10 w-10 text-text-muted/30" />
      <p className="text-[13.5px] font-bold text-text-heading">{title}</p>
      <p className="max-w-xs text-[12.5px] leading-5 text-text-muted">{body}</p>
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
          <div className="mt-2 h-10 w-full rounded bg-paper" />
          <div className="mt-2 h-4 w-28 rounded-full bg-paper" />
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
      <div className="grid gap-2 md:grid-cols-3">
        <div className="h-16 rounded-xl bg-paper" />
        <div className="h-16 rounded-xl bg-paper" />
        <div className="h-16 rounded-xl bg-paper" />
      </div>
      <div className="h-28 w-full rounded-xl bg-paper" />
      <div className="h-36 w-full rounded-xl bg-paper" />
    </div>
  );
}
