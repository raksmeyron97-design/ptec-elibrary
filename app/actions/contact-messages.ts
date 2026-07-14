"use server";

import { revalidateLocalizedPath as revalidatePath } from "@/lib/cache/revalidate";
import { requirePermission } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/server";
import { logAdminAction } from "@/app/actions/audit";
import { sendGmail, GmailSendError } from "@/lib/gmail";
import {
  adminNotificationEmail,
  adminReplyEmail,
  userConfirmationEmail,
} from "@/lib/email/contact-templates";
import type { ContactCategory } from "@/lib/contact/validate";

// NOTE: do not `export type { ContactCategory }` here - Next's Server
// Actions transform for "use server" files walks every export to build an
// action-reference table, and a bare type re-export breaks that. Consumers
// import ContactCategory directly from lib/contact/validate instead.

type ServiceClient = ReturnType<typeof createServiceClient>;
type JsonRecord = Record<string, unknown>;

export type ContactStatus =
  | "new"
  | "read"
  | "pending_reply"
  | "replied"
  | "email_failed"
  | "closed"
  | "spam";
export type ContactStatusFilter = ContactStatus | "needs_attention" | "all";
export type ContactPriority = "low" | "normal" | "high";
export type ContactEmailStatus = "pending" | "sent" | "failed";

export interface ContactMessage {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  category: ContactCategory;
  status: ContactStatus;
  priority: ContactPriority;
  source: string;
  ip_address: string | null;
  user_agent: string | null;
  confirmation_sent: boolean;
  admin_notification_status: ContactEmailStatus;
  user_confirmation_status: ContactEmailStatus;
  last_reply_status: ContactEmailStatus | null;
  last_email_error: string | null;
  last_email_attempt_at: string | null;
  last_reply_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactReply {
  id: string;
  contact_message_id: string;
  admin_id: string | null;
  admin_name: string;
  subject: string;
  reply_body: string;
  gmail_message_id: string | null;
  delivery_status: ContactEmailStatus;
  email_error: string | null;
  last_attempt_at: string | null;
  sent_to: string;
  cc: string | null;
  bcc: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ContactNote {
  id: string;
  contact_message_id: string;
  admin_id: string | null;
  admin_name: string;
  note_body: string;
  created_at: string;
}

export interface ContactReplyDraft {
  id: string;
  contact_message_id: string;
  admin_id: string;
  subject: string;
  reply_body: string;
  cc: string | null;
  bcc: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactDetail {
  message: ContactMessage;
  replies: ContactReply[];
  notes: ContactNote[];
  draft: ContactReplyDraft | null;
}

export interface ContactMessageCounts {
  all: number;
  new: number;
  read: number;
  pending_reply: number;
  replied: number;
  email_failed: number;
  closed: number;
  spam: number;
  needs_attention: number;
}

const STATUS_VALUES: ContactStatus[] = [
  "new",
  "read",
  "pending_reply",
  "replied",
  "email_failed",
  "closed",
  "spam",
];
const PRIORITY_VALUES: ContactPriority[] = ["low", "normal", "high"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_REPLY_LENGTH = 10_000;
const MAX_NOTE_LENGTH = 5_000;
const MAX_SUBJECT_LENGTH = 250;

const DELIVERY_FAILURE_FILTER =
  "status.eq.email_failed,admin_notification_status.eq.failed,user_confirmation_status.eq.failed,last_reply_status.eq.failed";
const NEEDS_ATTENTION_FILTER =
  "status.eq.new,status.eq.read,status.eq.pending_reply,status.eq.email_failed,admin_notification_status.eq.failed,user_confirmation_status.eq.failed,last_reply_status.eq.failed";

// Strip PostgREST .or()/.ilike() metacharacters before building filter
// strings from user input (same rule as sanitizeSearchTerm in app/api/chat
// and lib/admin/posts.ts - see CLAUDE.md).
function sanitizeSearchTerm(input: string): string {
  return input.replace(/[%,()\\*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

function sanitizeError(err: unknown): string {
  if (err instanceof GmailSendError) return err.message.slice(0, 1_000);
  if (err instanceof Error) return err.message.slice(0, 1_000);
  return "Unknown email error.";
}

function defaultReplySubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;
}

function normalizeEmailList(value: string | undefined, label: string): { value: string | null; error?: string } {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return { value: null };

  const emails = trimmed
    .split(/[;,]/)
    .map((email) => email.trim())
    .filter(Boolean);

  const invalid = emails.find((email) => !EMAIL_RE.test(email));
  if (invalid) return { value: null, error: `${label} contains an invalid email: ${invalid}` };
  return { value: emails.join(", ") };
}

function hasDeliveryFailure(message: Pick<ContactMessage, "admin_notification_status" | "user_confirmation_status" | "last_reply_status">): boolean {
  return (
    message.admin_notification_status === "failed" ||
    message.user_confirmation_status === "failed" ||
    message.last_reply_status === "failed"
  );
}

function deriveDeliveryStatus(message: Pick<ContactMessage, "status" | "admin_notification_status" | "user_confirmation_status" | "last_reply_status">): ContactStatus {
  if (message.status === "closed" || message.status === "spam") return message.status;
  if (message.last_reply_status === "pending") return "pending_reply";
  if (message.last_reply_status === "failed") return "email_failed";
  if (message.last_reply_status === "sent") return "replied";
  if (message.admin_notification_status === "failed" || message.user_confirmation_status === "failed") return "email_failed";
  return message.status === "email_failed" || message.status === "pending_reply" ? "read" : message.status;
}

function normalizeReplyInput(
  message: ContactMessage,
  input: ReplyInput,
): { subject: string; replyBody: string; cc: string | null; bcc: string | null } | { error: string } {
  if (!EMAIL_RE.test(message.email)) return { error: "Recipient email is invalid." };

  const replyBody = input.replyBody?.trim();
  if (!replyBody) return { error: "Reply body is required." };
  if (replyBody.length > MAX_REPLY_LENGTH) return { error: "Reply is too long." };

  const subject = (input.subject?.trim() || defaultReplySubject(message.subject)).slice(0, MAX_SUBJECT_LENGTH);
  if (!subject) return { error: "Subject is required." };

  const cc = normalizeEmailList(input.cc, "Cc");
  if (cc.error) return { error: cc.error };
  const bcc = normalizeEmailList(input.bcc, "Bcc");
  if (bcc.error) return { error: bcc.error };

  return { subject, replyBody, cc: cc.value, bcc: bcc.value };
}

async function getAdminName(supabase: ServiceClient, userId: string, fallbackEmail?: string | null): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  return profile?.full_name || fallbackEmail || "PTEC Library Team";
}

async function logContactAudit(
  supabase: ServiceClient,
  adminId: string,
  action: string,
  contactMessageId?: string,
  oldValue?: JsonRecord | null,
  newValue?: JsonRecord | null,
  metadata?: JsonRecord | null,
) {
  try {
    await supabase.from("contact_audit_logs").insert({
      contact_message_id: contactMessageId ?? null,
      admin_id: adminId,
      action,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
      metadata: metadata ?? null,
    });
  } catch (error) {
    console.error("[logContactAudit] Error:", error);
  }

  await logAdminAction(adminId, `contact.${action}`, "contact_messages", contactMessageId, {
    oldValue,
    newValue,
    metadata,
  });
}

async function getStatusCounts(supabase: ServiceClient): Promise<ContactMessageCounts> {
  const exactStatuses = STATUS_VALUES.filter((status) => status !== "email_failed");
  const [all, emailFailed, needsAttention, ...statusResults] = await Promise.all([
    supabase.from("contact_messages").select("id", { count: "exact", head: true }),
    supabase.from("contact_messages").select("id", { count: "exact", head: true }).or(DELIVERY_FAILURE_FILTER),
    supabase.from("contact_messages").select("id", { count: "exact", head: true }).or(NEEDS_ATTENTION_FILTER),
    ...exactStatuses.map((status) =>
      supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("status", status),
    ),
  ]);

  const counts: ContactMessageCounts = {
    all: all.count ?? 0,
    new: 0,
    read: 0,
    pending_reply: 0,
    replied: 0,
    email_failed: emailFailed.count ?? 0,
    closed: 0,
    spam: 0,
    needs_attention: needsAttention.count ?? 0,
  };

  exactStatuses.forEach((status, i) => {
    counts[status] = statusResults[i].count ?? 0;
  });

  return counts;
}

function applyStatusFilter(query: ReturnType<ServiceClient["from"]> extends { select: (...args: never[]) => infer Q } ? Q : never, status?: ContactStatusFilter) {
  if (!status || status === "all") return query;
  if (status === "needs_attention") return query.or(NEEDS_ATTENTION_FILTER);
  if (status === "email_failed") return query.or(DELIVERY_FAILURE_FILTER);
  return query.eq("status", status);
}

async function fetchContactDetail(supabase: ServiceClient, id: string, adminId?: string): Promise<ContactDetail | null> {
  const { data: message, error } = await supabase
    .from("contact_messages")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !message) return null;

  const [replies, notes, draft] = await Promise.all([
    supabase
      .from("contact_replies")
      .select("*")
      .eq("contact_message_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("contact_notes")
      .select("*")
      .eq("contact_message_id", id)
      .order("created_at", { ascending: true }),
    adminId
      ? supabase
          .from("contact_reply_drafts")
          .select("*")
          .eq("contact_message_id", id)
          .eq("admin_id", adminId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    message: message as ContactMessage,
    replies: (replies.data ?? []) as ContactReply[],
    notes: (notes.data ?? []) as ContactNote[],
    draft: (draft.data ?? null) as ContactReplyDraft | null,
  };
}

async function hasSuccessfulReply(supabase: ServiceClient, id: string): Promise<boolean> {
  const { count } = await supabase
    .from("contact_replies")
    .select("id", { count: "exact", head: true })
    .eq("contact_message_id", id)
    .eq("delivery_status", "sent");

  return (count ?? 0) > 0;
}

// ── Admin: list + search + filter + paginate ────────────────────────────
export interface ListContactMessagesParams {
  status?: ContactStatusFilter;
  category?: ContactCategory | "all";
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface ListContactMessagesResult {
  messages: ContactMessage[];
  total: number;
  page: number;
  pageSize: number;
  counts: ContactMessageCounts;
}

export async function adminListContactMessages(
  params: ListContactMessagesParams = {},
): Promise<ListContactMessagesResult> {
  const { supabase } = await requirePermission("contact", "read");

  const page = params.page && params.page > 0 ? Math.floor(params.page) : 1;
  const pageSize = params.pageSize && params.pageSize > 0 ? Math.min(Math.floor(params.pageSize), 100) : 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("contact_messages").select("*", { count: "exact" });

  query = applyStatusFilter(query, params.status);
  if (params.category && params.category !== "all") query = query.eq("category", params.category);

  const q = sanitizeSearchTerm(params.search ?? "");
  if (q) {
    query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,subject.ilike.%${q}%,message.ilike.%${q}%`);
  }

  query = query.order("created_at", { ascending: false }).range(from, to);

  const [{ data, count, error }, counts] = await Promise.all([query, getStatusCounts(supabase)]);

  if (error) {
    console.error("[adminListContactMessages] query failed:", error.message);
    return { messages: [], total: 0, page, pageSize, counts };
  }

  return { messages: (data ?? []) as ContactMessage[], total: count ?? 0, page, pageSize, counts };
}

// ── Admin: get a single message + its thread ─────────────────────────────
// Opening a "new" message auto-transitions it to "read" (Gmail-style).
export async function adminGetContactMessage(id: string): Promise<ContactDetail | null> {
  const { supabase, user } = await requirePermission("contact", "read");

  const detail = await fetchContactDetail(supabase, id, user.id);
  if (!detail) return null;

  if (detail.message.status === "new") {
    const { error } = await supabase.from("contact_messages").update({ status: "read" }).eq("id", id);
    if (!error) {
      detail.message.status = "read";
      await logContactAudit(supabase, user.id, "opened_message", id, { status: "new" }, { status: "read" });
    }
  }

  return detail;
}

// ── Admin: reply to a message via Gmail ──────────────────────────────────
export interface ReplyInput {
  subject?: string;
  replyBody: string;
  cc?: string;
  bcc?: string;
  sendAndClose?: boolean;
}

export interface ReplyResult {
  success: boolean;
  warning?: string;
  error?: string;
  reply?: ContactReply;
  message?: ContactMessage;
  detail?: ContactDetail | null;
}

export async function adminReplyToContactMessage(id: string, input: ReplyInput): Promise<ReplyResult> {
  const { supabase, user } = await requirePermission("contact", "write");

  const detail = await fetchContactDetail(supabase, id, user.id);
  if (!detail) return { success: false, error: "Message not found." };

  const normalized = normalizeReplyInput(detail.message, input);
  if ("error" in normalized) return { success: false, error: normalized.error };

  const adminName = await getAdminName(supabase, user.id, user.email);
  const attemptAt = new Date().toISOString();

  const { data: pendingReply, error: replyError } = await supabase
    .from("contact_replies")
    .insert({
      contact_message_id: id,
      admin_id: user.id,
      admin_name: adminName,
      subject: normalized.subject,
      reply_body: normalized.replyBody,
      delivery_status: "pending",
      last_attempt_at: attemptAt,
      sent_to: detail.message.email,
      cc: normalized.cc,
      bcc: normalized.bcc,
    })
    .select("*")
    .single();

  if (replyError || !pendingReply) {
    return { success: false, error: "Failed to save the reply. Please try again." };
  }

  await supabase
    .from("contact_messages")
    .update({
      status: "pending_reply",
      last_reply_status: "pending",
      last_email_attempt_at: attemptAt,
      last_email_error: null,
    })
    .eq("id", id);

  try {
    const template = adminReplyEmail({
      name: detail.message.name,
      subject: normalized.subject.replace(/^re:\s*/i, "") || detail.message.subject,
      replyBody: normalized.replyBody,
      originalMessage: detail.message.message,
    });
    const result = await sendGmail({
      to: detail.message.email,
      cc: normalized.cc ?? undefined,
      bcc: normalized.bcc ?? undefined,
      subject: normalized.subject,
      html: template.html,
      text: template.text,
    });

    const sentAt = new Date().toISOString();
    const finalStatus: ContactStatus = input.sendAndClose ? "closed" : "replied";

    const { data: sentReply } = await supabase
      .from("contact_replies")
      .update({
        gmail_message_id: result.id,
        delivery_status: "sent",
        email_error: null,
        sent_at: sentAt,
        last_attempt_at: attemptAt,
      })
      .eq("id", pendingReply.id)
      .select("*")
      .single();

    const { data: updatedMessage } = await supabase
      .from("contact_messages")
      .update({
        status: finalStatus,
        last_reply_status: "sent",
        last_reply_at: sentAt,
        last_email_attempt_at: attemptAt,
        last_email_error: hasDeliveryFailure({
          ...detail.message,
          last_reply_status: "sent",
        })
          ? detail.message.last_email_error
          : null,
      })
      .eq("id", id)
      .select("*")
      .single();

    await supabase.from("contact_reply_drafts").delete().eq("contact_message_id", id).eq("admin_id", user.id);

    await logContactAudit(supabase, user.id, "sent_reply", id, null, {
      replyId: pendingReply.id,
      gmailMessageId: result.id,
      status: finalStatus,
    });

    if (input.sendAndClose) {
      await logContactAudit(supabase, user.id, "closed_message", id, { status: "pending_reply" }, { status: "closed" });
    }

    revalidatePath("/admin/inbox");
    return {
      success: true,
      reply: (sentReply ?? pendingReply) as ContactReply,
      message: updatedMessage as ContactMessage,
      detail: await fetchContactDetail(supabase, id, user.id),
    };
  } catch (err) {
    const errorMessage = sanitizeError(err);
    const failedAt = new Date().toISOString();

    const { data: failedReply } = await supabase
      .from("contact_replies")
      .update({
        delivery_status: "failed",
        email_error: errorMessage,
        last_attempt_at: failedAt,
      })
      .eq("id", pendingReply.id)
      .select("*")
      .single();

    const { data: updatedMessage } = await supabase
      .from("contact_messages")
      .update({
        status: "email_failed",
        last_reply_status: "failed",
        last_email_error: errorMessage,
        last_email_attempt_at: failedAt,
      })
      .eq("id", id)
      .select("*")
      .single();

    await logContactAudit(supabase, user.id, "reply_failed", id, null, {
      replyId: pendingReply.id,
      error: errorMessage,
    });

    revalidatePath("/admin/inbox");
    return {
      success: true,
      warning: `Reply saved, but the email failed to send: ${errorMessage}`,
      reply: (failedReply ?? pendingReply) as ContactReply,
      message: updatedMessage as ContactMessage,
      detail: await fetchContactDetail(supabase, id, user.id),
    };
  }
}

// ── Admin: retry failed emails ───────────────────────────────────────────
export type RetryEmailKind = "admin_notification" | "user_confirmation" | "last_reply" | "all_failed";

interface RetryAttempt {
  kind: Exclude<RetryEmailKind, "all_failed">;
  success: boolean;
  skipped?: boolean;
  error?: string;
}

async function retryAdminNotification(supabase: ServiceClient, message: ContactMessage): Promise<RetryAttempt> {
  if (message.admin_notification_status !== "failed") {
    return { kind: "admin_notification", success: true, skipped: true };
  }

  const attemptAt = new Date().toISOString();
  await supabase
    .from("contact_messages")
    .update({ admin_notification_status: "pending", last_email_attempt_at: attemptAt })
    .eq("id", message.id);

  try {
    const notification = adminNotificationEmail({
      name: message.name,
      email: message.email,
      phone: message.phone,
      category: message.category,
      subject: message.subject,
      message: message.message,
      contactMessageId: message.id,
    });
    await sendGmail({
      to: process.env.ADMIN_GMAIL_ADDRESS ?? "",
      replyTo: message.email,
      ...notification,
    });

    const snapshot = { ...message, admin_notification_status: "sent" as ContactEmailStatus };
    await supabase
      .from("contact_messages")
      .update({
        admin_notification_status: "sent",
        status: deriveDeliveryStatus(snapshot),
        last_email_attempt_at: attemptAt,
        last_email_error: hasDeliveryFailure(snapshot) ? message.last_email_error : null,
      })
      .eq("id", message.id);

    return { kind: "admin_notification", success: true };
  } catch (err) {
    const error = sanitizeError(err);
    await supabase
      .from("contact_messages")
      .update({
        admin_notification_status: "failed",
        status: "email_failed",
        last_email_error: error,
        last_email_attempt_at: new Date().toISOString(),
      })
      .eq("id", message.id);
    return { kind: "admin_notification", success: false, error };
  }
}

async function retryUserConfirmation(supabase: ServiceClient, message: ContactMessage): Promise<RetryAttempt> {
  if (message.user_confirmation_status !== "failed") {
    return { kind: "user_confirmation", success: true, skipped: true };
  }

  const attemptAt = new Date().toISOString();
  await supabase
    .from("contact_messages")
    .update({ user_confirmation_status: "pending", last_email_attempt_at: attemptAt })
    .eq("id", message.id);

  try {
    const confirmation = userConfirmationEmail({
      name: message.name,
      category: message.category,
      subject: message.subject,
      message: message.message,
    });
    await sendGmail({ to: message.email, ...confirmation });

    const snapshot = { ...message, user_confirmation_status: "sent" as ContactEmailStatus };
    await supabase
      .from("contact_messages")
      .update({
        user_confirmation_status: "sent",
        confirmation_sent: true,
        status: deriveDeliveryStatus(snapshot),
        last_email_attempt_at: attemptAt,
        last_email_error: hasDeliveryFailure(snapshot) ? message.last_email_error : null,
      })
      .eq("id", message.id);

    return { kind: "user_confirmation", success: true };
  } catch (err) {
    const error = sanitizeError(err);
    await supabase
      .from("contact_messages")
      .update({
        user_confirmation_status: "failed",
        confirmation_sent: false,
        status: "email_failed",
        last_email_error: error,
        last_email_attempt_at: new Date().toISOString(),
      })
      .eq("id", message.id);
    return { kind: "user_confirmation", success: false, error };
  }
}

async function retryLastReply(supabase: ServiceClient, message: ContactMessage): Promise<RetryAttempt> {
  const { data: reply } = await supabase
    .from("contact_replies")
    .select("*")
    .eq("contact_message_id", message.id)
    .eq("delivery_status", "failed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!reply) return { kind: "last_reply", success: true, skipped: true };

  const failedReply = reply as ContactReply;
  const attemptAt = new Date().toISOString();

  await Promise.all([
    supabase
      .from("contact_replies")
      .update({ delivery_status: "pending", email_error: null, last_attempt_at: attemptAt })
      .eq("id", failedReply.id),
    supabase
      .from("contact_messages")
      .update({
        status: "pending_reply",
        last_reply_status: "pending",
        last_email_error: null,
        last_email_attempt_at: attemptAt,
      })
      .eq("id", message.id),
  ]);

  try {
    const template = adminReplyEmail({
      name: message.name,
      subject: failedReply.subject.replace(/^re:\s*/i, "") || message.subject,
      replyBody: failedReply.reply_body,
      originalMessage: message.message,
    });
    const result = await sendGmail({
      to: failedReply.sent_to,
      cc: failedReply.cc ?? undefined,
      bcc: failedReply.bcc ?? undefined,
      subject: failedReply.subject || defaultReplySubject(message.subject),
      html: template.html,
      text: template.text,
    });

    const sentAt = new Date().toISOString();
    const finalStatus: ContactStatus = message.status === "closed" ? "closed" : "replied";

    await Promise.all([
      supabase
        .from("contact_replies")
        .update({
          gmail_message_id: result.id,
          delivery_status: "sent",
          email_error: null,
          sent_at: sentAt,
          last_attempt_at: attemptAt,
        })
        .eq("id", failedReply.id),
      supabase
        .from("contact_messages")
        .update({
          status: finalStatus,
          last_reply_status: "sent",
          last_reply_at: sentAt,
          last_email_attempt_at: attemptAt,
          last_email_error: null,
        })
        .eq("id", message.id),
    ]);

    return { kind: "last_reply", success: true };
  } catch (err) {
    const error = sanitizeError(err);
    await Promise.all([
      supabase
        .from("contact_replies")
        .update({ delivery_status: "failed", email_error: error, last_attempt_at: new Date().toISOString() })
        .eq("id", failedReply.id),
      supabase
        .from("contact_messages")
        .update({
          status: "email_failed",
          last_reply_status: "failed",
          last_email_error: error,
          last_email_attempt_at: new Date().toISOString(),
        })
        .eq("id", message.id),
    ]);
    return { kind: "last_reply", success: false, error };
  }
}

export async function adminRetryContactEmail(
  id: string,
  kind: RetryEmailKind,
): Promise<{ success: boolean; error?: string; attempts: RetryAttempt[]; detail?: ContactDetail | null }> {
  const { supabase, user } = await requirePermission("contact", "write");
  const detail = await fetchContactDetail(supabase, id, user.id);
  if (!detail) return { success: false, error: "Message not found.", attempts: [] };

  const attempts: RetryAttempt[] = [];

  if (kind === "admin_notification" || kind === "all_failed") {
    attempts.push(await retryAdminNotification(supabase, detail.message));
  }
  const afterAdmin = await fetchContactDetail(supabase, id, user.id);
  const currentAfterAdmin = afterAdmin?.message ?? detail.message;

  if (kind === "user_confirmation" || kind === "all_failed") {
    attempts.push(await retryUserConfirmation(supabase, currentAfterAdmin));
  }
  const afterConfirmation = await fetchContactDetail(supabase, id, user.id);
  const currentAfterConfirmation = afterConfirmation?.message ?? currentAfterAdmin;

  if (kind === "last_reply" || kind === "all_failed") {
    attempts.push(await retryLastReply(supabase, currentAfterConfirmation));
  }

  const failed = attempts.find((attempt) => !attempt.success);
  await logContactAudit(supabase, user.id, "retried_email", id, null, {
    kind,
    success: !failed,
    attempts,
  });

  revalidatePath("/admin/inbox");
  return {
    success: !failed,
    error: failed?.error,
    attempts,
    detail: await fetchContactDetail(supabase, id, user.id),
  };
}

// ── Admin: status / priority updates ─────────────────────────────────────
export async function adminUpdateContactMessageStatus(id: string, status: ContactStatus) {
  const { supabase, user } = await requirePermission("contact", "write");
  if (!STATUS_VALUES.includes(status)) return { error: "Invalid status." };

  if (status === "replied" && !(await hasSuccessfulReply(supabase, id))) {
    return { error: "Cannot mark as replied until an admin reply has been sent successfully." };
  }

  const { data: existing } = await supabase
    .from("contact_messages")
    .select("status")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("contact_messages").update({ status }).eq("id", id);
  if (error) return { error: error.message };

  const action = status === "spam" ? "marked_spam" : status === "closed" ? "closed_message" : "changed_status";
  await logContactAudit(supabase, user.id, action, id, existing ?? null, { status });
  revalidatePath("/admin/inbox");
  return { success: true };
}

export async function adminUpdateContactMessagePriority(id: string, priority: ContactPriority) {
  const { supabase, user } = await requirePermission("contact", "write");
  if (!PRIORITY_VALUES.includes(priority)) return { error: "Invalid priority." };

  const { data: existing } = await supabase
    .from("contact_messages")
    .select("priority")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("contact_messages").update({ priority }).eq("id", id);
  if (error) return { error: error.message };

  await logContactAudit(supabase, user.id, "changed_priority", id, existing ?? null, { priority });
  revalidatePath("/admin/inbox");
  return { success: true };
}

// ── Admin: notes and drafts ──────────────────────────────────────────────
export async function adminAddContactNote(id: string, noteBody: string) {
  const { supabase, user } = await requirePermission("contact", "write");
  const body = noteBody.trim();
  if (!body) return { success: false, error: "Note cannot be empty." };
  if (body.length > MAX_NOTE_LENGTH) return { success: false, error: "Note is too long." };

  const adminName = await getAdminName(supabase, user.id, user.email);

  const { data: note, error } = await supabase
    .from("contact_notes")
    .insert({
      contact_message_id: id,
      admin_id: user.id,
      admin_name: adminName,
      note_body: body,
    })
    .select("*")
    .single();

  if (error || !note) return { success: false, error: "Failed to add note." };

  await logContactAudit(supabase, user.id, "added_internal_note", id, null, { noteId: note.id });
  revalidatePath("/admin/inbox");
  return { success: true, note: note as ContactNote };
}

export async function adminSaveContactReplyDraft(id: string, input: Omit<ReplyInput, "sendAndClose">) {
  const { supabase, user } = await requirePermission("contact", "write");

  const subject = (input.subject?.trim() ?? "").slice(0, MAX_SUBJECT_LENGTH);
  const replyBody = (input.replyBody?.trim() ?? "").slice(0, MAX_REPLY_LENGTH);
  const cc = normalizeEmailList(input.cc, "Cc");
  if (cc.error) return { success: false, error: cc.error };
  const bcc = normalizeEmailList(input.bcc, "Bcc");
  if (bcc.error) return { success: false, error: bcc.error };

  if (!subject && !replyBody && !cc.value && !bcc.value) {
    await supabase.from("contact_reply_drafts").delete().eq("contact_message_id", id).eq("admin_id", user.id);
    return { success: true, draft: null };
  }

  const { data: draft, error } = await supabase
    .from("contact_reply_drafts")
    .upsert(
      {
        contact_message_id: id,
        admin_id: user.id,
        subject,
        reply_body: replyBody,
        cc: cc.value,
        bcc: bcc.value,
      },
      { onConflict: "contact_message_id,admin_id" },
    )
    .select("*")
    .single();

  if (error || !draft) return { success: false, error: "Failed to save draft." };

  await logContactAudit(supabase, user.id, "saved_draft", id, null, { draftId: draft.id });
  revalidatePath("/admin/inbox");
  return { success: true, draft: draft as ContactReplyDraft };
}

// ── Admin: delete ─────────────────────────────────────────────────────────
export async function adminDeleteContactMessage(id: string) {
  const { supabase, user } = await requirePermission("contact", "write");

  const { data: existing } = await supabase
    .from("contact_messages")
    .select("name, email, subject, status")
    .eq("id", id)
    .maybeSingle();

  await logContactAudit(supabase, user.id, "deleted_message", id, existing ?? null, null);

  const { error } = await supabase.from("contact_messages").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/inbox");
  return { success: true };
}
