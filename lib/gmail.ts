import "server-only";

import { google } from "googleapis";

/**
 * Thrown on any Gmail send failure. Callers must catch this explicitly and
 * keep whatever DB record they already wrote — a Gmail outage must never
 * lose a saved contact message or a drafted admin reply.
 */
export class GmailSendError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "GmailSendError";
  }
}

export interface SendGmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
}

export interface SendGmailResult {
  id: string;
  threadId: string | null;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new GmailSendError(`Missing required env var: ${name}`);
  return value;
}

/** Strips CR/LF so user-influenced values can never inject extra MIME headers. */
export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** RFC 2047 encoded-word for non-ASCII header values (e.g. Khmer subjects). Exported for unit tests. */
export function encodeHeader(value: string): string {
  const clean = sanitizeHeaderValue(value);
  if (/^[\x00-\x7F]*$/.test(clean)) return clean;
  return `=?UTF-8?B?${Buffer.from(clean, "utf-8").toString("base64")}?=`;
}

/** Wraps a base64 string into RFC 2045-compliant 76-char lines. */
function wrapBase64(b64: string): string {
  return b64.replace(/(.{76})/g, "$1\r\n");
}

function base64Part(content: string): string {
  return wrapBase64(Buffer.from(content, "utf-8").toString("base64"));
}

/**
 * googleapis/gaxios errors carry the real reason (e.g. "invalid_grant" /
 * "Token has been expired or revoked") several layers deep and don't
 * flatten to a useful `.message`. Pull the most specific string available
 * so failures are actually debuggable instead of a generic "failed" log.
 */
function extractGoogleErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = err as any;
    const data = e.response?.data;
    if (data?.error_description) return `${data.error ?? "error"}: ${data.error_description}`;
    if (typeof data?.error === "string") return data.error;
    if (typeof e.message === "string" && e.message) return e.message;
  }
  return String(err);
}

function getOAuthClient() {
  const clientId = requiredEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requiredEnv("GOOGLE_CLIENT_SECRET");
  const refreshToken = requiredEnv("GOOGLE_REFRESH_TOKEN");

  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

/** Exported for unit tests — builds the RFC 2822 message (pre-base64url). */
export function buildRawMessage(input: SendGmailInput & { from: string }): string {
  const boundary = `ptec_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const headers = [
    `From: ${sanitizeHeaderValue(input.from)}`,
    `To: ${sanitizeHeaderValue(input.to)}`,
    input.cc ? `Cc: ${sanitizeHeaderValue(input.cc)}` : null,
    input.bcc ? `Bcc: ${sanitizeHeaderValue(input.bcc)}` : null,
    input.replyTo ? `Reply-To: ${sanitizeHeaderValue(input.replyTo)}` : null,
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter((line): line is string => line !== null);

  const body = [
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Part(input.text),
    "",
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Part(input.html),
    "",
    `--${boundary}--`,
  ];

  return [...headers, "", ...body].join("\r\n");
}

function base64url(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Sends an email through the Gmail API using an OAuth2 refresh token
 * (least-privilege `gmail.send` scope — see scripts/get-gmail-refresh-token.mjs
 * for the one-time credential setup). Server-only: never import from a
 * Client Component.
 */
export async function sendGmail(input: SendGmailInput): Promise<SendGmailResult> {
  const fromName = process.env.CONTACT_FROM_NAME || "PTEC Digital Library";
  const fromAddress = requiredEnv("ADMIN_GMAIL_ADDRESS");
  const from = `${encodeHeader(fromName)} <${fromAddress}>`;

  const raw = base64url(buildRawMessage({ ...input, from }));

  try {
    const auth = getOAuthClient();
    const gmail = google.gmail({ version: "v1", auth });
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    if (!res.data.id) {
      throw new GmailSendError("Gmail API returned no message id");
    }

    return { id: res.data.id, threadId: res.data.threadId ?? null };
  } catch (err) {
    if (err instanceof GmailSendError) throw err;
    const detail = extractGoogleErrorMessage(err);
    console.error("[gmail] send failed:", detail);
    throw new GmailSendError(`Failed to send email via Gmail API: ${detail}`, err);
  }
}
