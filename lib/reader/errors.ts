/* Reader error classification — pure, so every message-to-kind mapping the
   error state depends on is pinned by a unit test. */

export type PdfErrorKind =
  | "missing"
  | "permission"
  | "invalid"
  | "network"
  /** The proxy answered 429: the reader's own range budget ran out. Waits it out. */
  | "rateLimited"
  /** The proxy or storage answered 5xx: transient on their side, not the file's. */
  | "server"
  | "unknown";

const STATUS_RE = /\b(\d{3})\b/;

/** The HTTP status pdf.js embedded in the message ("Unexpected server response (429)"), if any. */
function statusOf(message: string): number | null {
  const m = STATUS_RE.exec(message);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 100 && n <= 599 ? n : null;
}

/** Which of the reader's error screens a pdf.js / fetch failure maps to.
    Deliberately conservative: an unrecognised message is "unknown", never a
    guess that would show the reader the wrong remedy. */
export function classifyPdfError(error: { message?: string; name?: string } | null | undefined): PdfErrorKind {
  const message = (error?.message ?? "").toLowerCase();
  const name = (error?.name ?? "").toLowerCase();
  const status = statusOf(message);
  if (status === 429 || message.includes("too many requests")) return "rateLimited";
  if (status !== null && status >= 500) return "server";
  if (name === "missingpdfexception" || status === 404 || message.includes("not found") || message.includes("missing")) {
    return "missing";
  }
  if (name === "unexpectedresponseexception" && (status === 401 || status === 403)) {
    return "permission";
  }
  if (status === 401 || status === 403 || message.includes("unauthorized") || message.includes("forbidden")) {
    return "permission";
  }
  if (name === "invalidpdfexception" || name === "passwordexception" || message.includes("invalid") || message.includes("corrupt") || message.includes("password")) {
    return "invalid";
  }
  if (
    name === "aborterror" ||
    message.includes("network") ||
    message.includes("failed to fetch") ||
    message.includes("load failed") ||
    message.includes("networkerror") ||
    message.includes("connection")
  ) {
    return "network";
  }
  return "unknown";
}

/** Which actions an error screen offers. `retry` is pointless for a file the
    server refused to serve; `back` only makes sense with somewhere to go. */
export function errorActions(kind: PdfErrorKind, offline: boolean): {
  retry: boolean;
  report: boolean;
  back: boolean;
} {
  if (offline) return { retry: true, report: false, back: true };
  switch (kind) {
    case "permission":
      return { retry: false, report: false, back: true };
    case "invalid":
      return { retry: false, report: true, back: true };
    case "missing":
      return { retry: true, report: true, back: true };
    case "network":
    case "rateLimited":
    case "server":
      // The file is fine; the link or the server is not. Reporting it as
      // broken would send the librarian after a document that works.
      return { retry: true, report: false, back: false };
    default:
      return { retry: true, report: true, back: true };
  }
}
