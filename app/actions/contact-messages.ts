"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/requireAdmin";
import { createServiceClient } from "@/lib/supabase/server";
import { logAdminAction } from "@/app/actions/audit";
import { sendGmail, GmailSendError } from "@/lib/gmail";
import { adminReplyEmail } from "@/lib/email/contact-templates";
import type { ContactCategory } from "@/lib/contact/validate";

// NOTE: do not `export type { ContactCategory }` here — Next's Server
// Actions transform for "use server" files walks every export to build an
// action-reference table, and a bare type re-export breaks that (it looks
// for a function to reference and finds none). Consumers import
// ContactCategory directly from lib/contact/validate instead.

type ServiceClient = ReturnType<typeof createServiceClient>;

export type ContactStatus = "new" | "read" | "replied" | "closed" | "spam";
export type ContactPriority = "low" | "normal" | "high";

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
  last_reply_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactReply {
  id: string;
  contact_message_id: string;
  admin_id: string | null;
  admin_name: string;
  reply_body: string;
  gmail_message_id: string | null;
  sent_to: string;
  cc: string | null;
  bcc: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface ContactMessageCounts {
  all: number;
  new: number;
  read: number;
  replied: number;
  closed: number;
  spam: number;
}

const STATUS_VALUES: ContactStatus[] = ["new", "read", "replied", "closed", "spam"];
const PRIORITY_VALUES: ContactPriority[] = ["low", "normal", "high"];

// Strip PostgREST .or()/.ilike() metacharacters before building filter
// strings from user input (same rule as sanitizeSearchTerm in app/api/chat
// and lib/admin/posts.ts — see CLAUDE.md).
function sanitizeSearchTerm(input: string): string {
  return input.replace(/[%,()\\*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
}

async function getStatusCounts(supabase: ServiceClient): Promise<ContactMessageCounts> {
  const results = await Promise.all(
    STATUS_VALUES.map((status) =>
      supabase.from("contact_messages").select("id", { count: "exact", head: true }).eq("status", status),
    ),
  );
  const counts: ContactMessageCounts = { all: 0, new: 0, read: 0, replied: 0, closed: 0, spam: 0 };
  STATUS_VALUES.forEach((status, i) => {
    const n = results[i].count ?? 0;
    counts[status] = n;
    counts.all += n;
  });
  return counts;
}

// ── Admin: list + search + filter + paginate ────────────────────────────
export interface ListContactMessagesParams {
  status?: ContactStatus | "all";
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

  if (params.status && params.status !== "all") query = query.eq("status", params.status);
  if (params.category && params.category !== "all") query = query.eq("category", params.category);

  const q = sanitizeSearchTerm(params.search ?? "");
  if (q) {
    query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,subject.ilike.%${q}%,message.ilike.%${q}%`);
  }

  query = query.order("created_at", { ascending: false }).range(from, to);

  const [{ data, count, error }, counts] = await Promise.all([query, getStatusCounts(supabase)]);

  if (error) {
    console.error("[adminListContactMessages] query failed:", error.message);
    return { messages: [], total: 0, page, pageSize, counts };
  }

  return { messages: (data ?? []) as ContactMessage[], total: count ?? 0, page, pageSize, counts };
}

// ── Admin: get a single message + its reply history ─────────────────────
// Opening a "new" message auto-transitions it to "read" (Gmail-style),
// independent of the explicit mark-as-* actions below.
export async function adminGetContactMessage(
  id: string,
): Promise<{ message: ContactMessage; replies: ContactReply[] } | null> {
  const { supabase } = await requirePermission("contact", "read");

  const { data: message, error } = await supabase
    .from("contact_messages")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !message) return null;

  if (message.status === "new") {
    await supabase.from("contact_messages").update({ status: "read" }).eq("id", id);
    message.status = "read";
  }

  const { data: replies } = await supabase
    .from("contact_replies")
    .select("*")
    .eq("contact_message_id", id)
    .order("created_at", { ascending: true });

  return { message: message as ContactMessage, replies: (replies ?? []) as ContactReply[] };
}

// ── Admin: reply to a message via Gmail ──────────────────────────────────
export interface ReplyInput {
  replyBody: string;
  cc?: string;
  bcc?: string;
}

export interface ReplyResult {
  success: boolean;
  warning?: string;
  error?: string;
  reply?: ContactReply;
}

const MAX_REPLY_LENGTH = 10_000;

export async function adminReplyToContactMessage(id: string, input: ReplyInput): Promise<ReplyResult> {
  const { supabase, user } = await requirePermission("contact", "write");

  const replyBody = input.replyBody?.trim();
  if (!replyBody) return { success: false, error: "Reply cannot be empty." };
  if (replyBody.length > MAX_REPLY_LENGTH) return { success: false, error: "Reply is too long." };

  const { data: message, error: msgError } = await supabase
    .from("contact_messages")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (msgError || !message) return { success: false, error: "Message not found." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const adminName = profile?.full_name || user.email || "PTEC Library Team";

  let gmailMessageId: string | null = null;
  let warning: string | undefined;

  try {
    const template = adminReplyEmail({
      name: message.name,
      subject: message.subject,
      replyBody,
      originalMessage: message.message,
    });
    const result = await sendGmail({
      to: message.email,
      cc: input.cc?.trim() || undefined,
      bcc: input.bcc?.trim() || undefined,
      ...template,
    });
    gmailMessageId = result.id;
  } catch (err) {
    // Never lose the drafted reply — save it below even if Gmail failed.
    console.error("[adminReplyToContactMessage] Gmail send failed:", err instanceof Error ? err.message : err);
    warning =
      err instanceof GmailSendError
        ? `Reply saved, but the email failed to send: ${err.message}`
        : "Reply saved, but the email failed to send.";
  }

  const { data: reply, error: replyError } = await supabase
    .from("contact_replies")
    .insert({
      contact_message_id: id,
      admin_id: user.id,
      admin_name: adminName,
      reply_body: replyBody,
      gmail_message_id: gmailMessageId,
      sent_to: message.email,
      cc: input.cc?.trim() || null,
      bcc: input.bcc?.trim() || null,
      sent_at: gmailMessageId ? new Date().toISOString() : null,
    })
    .select("*")
    .single();

  if (replyError || !reply) {
    return { success: false, error: "Failed to save the reply. Please try again." };
  }

  await supabase
    .from("contact_messages")
    .update({ status: "replied", last_reply_at: new Date().toISOString() })
    .eq("id", id);

  await logAdminAction(user.id, "contact.reply", "contact_messages", id, {
    gmailSent: Boolean(gmailMessageId),
  });

  revalidatePath("/admin/inbox");

  return { success: true, warning, reply: reply as ContactReply };
}

// ── Admin: status / priority updates ─────────────────────────────────────
export async function adminUpdateContactMessageStatus(id: string, status: ContactStatus) {
  const { supabase, user } = await requirePermission("contact", "write");
  if (!STATUS_VALUES.includes(status)) return { error: "Invalid status." };

  const { error } = await supabase.from("contact_messages").update({ status }).eq("id", id);
  if (error) return { error: error.message };

  await logAdminAction(user.id, "contact.status_update", "contact_messages", id, { status });
  revalidatePath("/admin/inbox");
  return { success: true };
}

export async function adminUpdateContactMessagePriority(id: string, priority: ContactPriority) {
  const { supabase, user } = await requirePermission("contact", "write");
  if (!PRIORITY_VALUES.includes(priority)) return { error: "Invalid priority." };

  const { error } = await supabase.from("contact_messages").update({ priority }).eq("id", id);
  if (error) return { error: error.message };

  await logAdminAction(user.id, "contact.priority_update", "contact_messages", id, { priority });
  revalidatePath("/admin/inbox");
  return { success: true };
}

// ── Admin: delete ─────────────────────────────────────────────────────────
export async function adminDeleteContactMessage(id: string) {
  const { supabase, user } = await requirePermission("contact", "write");

  const { data: existing } = await supabase
    .from("contact_messages")
    .select("name, email, subject")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("contact_messages").delete().eq("id", id);
  if (error) return { error: error.message };

  await logAdminAction(user.id, "contact.delete", "contact_messages", id, existing ?? undefined);
  revalidatePath("/admin/inbox");
  return { success: true };
}
