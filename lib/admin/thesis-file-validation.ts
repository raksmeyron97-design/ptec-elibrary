/**
 * Client-usable file constraints for the Files & Cover step (spec §12).
 * This is a fast client-side pre-check for UX only — it is NOT the security
 * boundary. The real boundary is server-side: `/api/admin/upload` sniffs
 * magic bytes via `validateMimeType()` (lib/mime-validation.ts) regardless
 * of what a client claims, sanitizes the storage key, and rejects path
 * traversal. Never trust this module's checks as authorization.
 */

export const MAX_PDF_BYTES = 100 * 1024 * 1024; // matches /api/admin/upload's global cap
export const MAX_COVER_BYTES = 5 * 1024 * 1024;
export const MAX_SUPPLEMENTARY_BYTES = 20 * 1024 * 1024;

export const ALLOWED_COVER_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * PDF/DOCX/XLSX/PPTX are verified server-side by real magic-byte signatures
 * (lib/mime-validation.ts). CSV has no such signature (it's plain text), so
 * it's verified by a weaker heuristic instead (`isPlausibleTextFile()` —
 * rejects NUL bytes and known binary/executable prefixes). Raw ZIP stays
 * excluded per spec §12 ("ZIP only if explicitly allowed and scanned" — no
 * malware-scanning infra beyond the hash-reputation check in
 * lib/virus-scan.ts exists in this codebase).
 */
export const ALLOWED_SUPPLEMENTARY_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
] as const;

export const SUPPLEMENTARY_EXTENSION_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
  "text/csv": "CSV",
};

export type SupplementaryFile = {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  description?: string;
};

/** Strips path separators/control characters so a stored filename can never traverse or hide a payload. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "file";
  return base.replace(/[^\w.\- ]+/g, "_").slice(0, 150) || "file";
}

export function validateClientFile(
  file: File,
  kind: "pdf" | "cover" | "supplementary",
): { ok: true } | { ok: false; error: string } {
  if (kind === "pdf") {
    if (file.type !== "application/pdf") return { ok: false, error: "Only PDF files are allowed." };
    if (file.size > MAX_PDF_BYTES) return { ok: false, error: "PDF is larger than the 100 MB limit." };
  } else if (kind === "cover") {
    if (!(ALLOWED_COVER_MIMES as readonly string[]).includes(file.type)) {
      return { ok: false, error: "Cover must be a JPEG, PNG, or WebP image." };
    }
    if (file.size > MAX_COVER_BYTES) return { ok: false, error: "Cover image is larger than the 5 MB limit." };
  } else {
    if (!(ALLOWED_SUPPLEMENTARY_MIMES as readonly string[]).includes(file.type)) {
      return { ok: false, error: "Only PDF, Word, Excel, PowerPoint, or CSV files are allowed." };
    }
    if (file.size > MAX_SUPPLEMENTARY_BYTES) return { ok: false, error: "File is larger than the 20 MB limit." };
  }
  return { ok: true };
}
