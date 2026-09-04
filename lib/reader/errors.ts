/* Reader error classification — pure, so every message-to-kind mapping the
   error state depends on is pinned by a unit test. */

export type PdfErrorKind = "missing" | "permission" | "invalid" | "network" | "unknown";

/** Which of the reader's error screens a pdf.js / fetch failure maps to.
    Deliberately conservative: an unrecognised message is "unknown", never a
    guess that would show the reader the wrong remedy. */
export function classifyPdfError(error: { message?: string; name?: string } | null | undefined): PdfErrorKind {
  const message = (error?.message ?? "").toLowerCase();
  const name = (error?.name ?? "").toLowerCase();
  if (name === "missingpdfexception" || message.includes("404") || message.includes("not found") || message.includes("missing")) {
    return "missing";
  }
  if (name === "unexpectedresponseexception" && (message.includes("401") || message.includes("403"))) {
    return "permission";
  }
  if (message.includes("401") || message.includes("403") || message.includes("unauthorized") || message.includes("forbidden")) {
    return "permission";
  }
  if (name === "invalidpdfexception" || name === "passwordexception" || message.includes("invalid") || message.includes("corrupt") || message.includes("password")) {
    return "invalid";
  }
  if (message.includes("network") || message.includes("failed to fetch") || message.includes("load failed")) {
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
      return { retry: true, report: false, back: false };
    default:
      return { retry: true, report: true, back: true };
  }
}
