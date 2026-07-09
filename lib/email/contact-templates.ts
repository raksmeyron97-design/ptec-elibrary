import { PTEC } from "@/lib/ptec";
import { SITE_URL, PTEC_LIBRARY_NAME } from "@/lib/seo/site";
import { CONTACT_CATEGORY_LABELS, type ContactCategory } from "@/lib/contact/validate";

/**
 * Escapes plain user-supplied text before interpolating it into a hand-built
 * HTML email string. Distinct from lib/sanitize.ts's sanitizeHtml (which
 * sanitizes *already-HTML* markdown output) — this is for raw text fields
 * (name, subject, message body) that must never be able to inject markup
 * into an outbound email.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Preserves line breaks from a plain-text field when rendered as HTML. */
function escapeHtmlMultiline(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

export function categoryLabel(category: string): string {
  return CONTACT_CATEGORY_LABELS[category as ContactCategory] ?? category;
}

const BRAND_NAVY = "#1E3A8A";
const BRAND_GOLD = "#DDB022";

function layout(opts: { preheader: string; bodyHtml: string }): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(PTEC_LIBRARY_NAME)}</title>
  </head>
  <body style="margin:0;padding:0;background:#F4F5F7;font-family:Arial,Helvetica,sans-serif;">
    <span style="display:none;font-size:1px;color:#F4F5F7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
      ${escapeHtml(opts.preheader)}
    </span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:linear-gradient(135deg,${BRAND_NAVY} 0%,#122251 100%);padding:28px 32px;">
                <p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;">${escapeHtml(PTEC_LIBRARY_NAME)}</p>
                <p style="margin:4px 0 0;color:${BRAND_GOLD};font-size:12px;letter-spacing:.08em;text-transform:uppercase;">Contact Notification</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1F2430;font-size:14px;line-height:1.6;">
                ${opts.bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#F9FAFB;border-top:1px solid #E5E7EB;">
                <p style="margin:0;color:#6B7280;font-size:12px;">
                  ${escapeHtml(PTEC_LIBRARY_NAME)} ·
                  <a href="${SITE_URL}" style="color:${BRAND_NAVY};text-decoration:none;">${SITE_URL.replace(/^https?:\/\//, "")}</a>
                  · ${escapeHtml(PTEC.email)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function fieldRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:4px 0;color:#6B7280;font-size:12px;width:100px;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:4px 0;color:#1F2430;font-size:13px;">${escapeHtml(value)}</td>
  </tr>`;
}

export interface AdminNotificationInput {
  name: string;
  email: string;
  phone?: string | null;
  category: string;
  subject: string;
  message: string;
  contactMessageId: string;
}

export function adminNotificationEmail(input: AdminNotificationInput): {
  subject: string;
  html: string;
  text: string;
} {
  const dashboardUrl = `${SITE_URL}/admin/inbox?id=${input.contactMessageId}`;
  const subject = `[Contact] ${input.subject}`;

  const bodyHtml = `
    <p style="margin:0 0 16px;">A new message was submitted on the contact form.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:16px;">
      ${fieldRow("Name", input.name)}
      ${fieldRow("Email", input.email)}
      ${input.phone ? fieldRow("Phone", input.phone) : ""}
      ${fieldRow("Category", categoryLabel(input.category))}
      ${fieldRow("Subject", input.subject)}
    </table>
    <div style="padding:14px 16px;background:#F9FAFB;border-radius:10px;border:1px solid #E5E7EB;margin-bottom:20px;">
      <p style="margin:0;white-space:normal;">${escapeHtmlMultiline(input.message)}</p>
    </div>
    <a href="${dashboardUrl}" style="display:inline-block;padding:10px 20px;background:${BRAND_GOLD};color:#1F2430;font-weight:bold;font-size:13px;text-decoration:none;border-radius:10px;">
      Open in Admin Inbox
    </a>
  `;

  const text = [
    `New contact message: ${input.subject}`,
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    input.phone ? `Phone: ${input.phone}` : null,
    `Category: ${categoryLabel(input.category)}`,
    "",
    input.message,
    "",
    `Open in Admin Inbox: ${dashboardUrl}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  return { subject, html: layout({ preheader: input.subject, bodyHtml }), text };
}

export interface UserConfirmationInput {
  name: string;
  subject: string;
  category: string;
  message: string;
}

export function userConfirmationEmail(input: UserConfirmationInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `We received your message: ${input.subject}`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(input.name)},</p>
    <p style="margin:0 0 16px;">
      Thank you for contacting the ${escapeHtml(PTEC_LIBRARY_NAME)}. We've received your message
      and a member of our team will get back to you as soon as possible.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:16px;">
      ${fieldRow("Category", categoryLabel(input.category))}
      ${fieldRow("Subject", input.subject)}
    </table>
    <div style="padding:14px 16px;background:#F9FAFB;border-radius:10px;border:1px solid #E5E7EB;">
      <p style="margin:0;">${escapeHtmlMultiline(input.message)}</p>
    </div>
  `;

  const text = [
    `Hi ${input.name},`,
    "",
    `Thank you for contacting the ${PTEC_LIBRARY_NAME}. We've received your message and a member of our team will get back to you as soon as possible.`,
    "",
    `Category: ${categoryLabel(input.category)}`,
    `Subject: ${input.subject}`,
    "",
    input.message,
  ].join("\n");

  return { subject, html: layout({ preheader: subject, bodyHtml }), text };
}

export interface AdminReplyInput {
  name: string;
  subject: string;
  replyBody: string;
  originalMessage: string;
}

export function adminReplyEmail(input: AdminReplyInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Re: ${input.subject}`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(input.name)},</p>
    <div style="margin:0 0 20px;">${escapeHtmlMultiline(input.replyBody)}</div>
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #E5E7EB;">
      <p style="margin:0 0 6px;color:#9CA3AF;font-size:11px;text-transform:uppercase;letter-spacing:.06em;">Your original message</p>
      <div style="padding:12px 14px;background:#F9FAFB;border-radius:10px;border:1px solid #E5E7EB;color:#6B7280;font-size:12.5px;">
        ${escapeHtmlMultiline(input.originalMessage)}
      </div>
    </div>
  `;

  const text = [
    `Hi ${input.name},`,
    "",
    input.replyBody,
    "",
    "--- Your original message ---",
    input.originalMessage,
  ].join("\n");

  return { subject, html: layout({ preheader: input.replyBody.slice(0, 120), bodyHtml }), text };
}
