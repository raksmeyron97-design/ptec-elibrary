/* lib/ocr/errors.ts
 *
 * The vocabulary of ways an OCR run can stop, as values.
 *
 * Every one of these is a DIFFERENT thing for an operator to do, which is the
 * whole reason they are not one `ERROR`:
 *
 *   ENVIRONMENT_MISMATCH  fix the shell, not the library — the storage config
 *                         in this process cannot describe the files in that
 *                         database (lib/indexing/environment.ts, and the
 *                         incident that module exists for)
 *   TESSERACT_UNAVAILABLE install the binary / run in the container
 *   KHMER_MODEL_MISSING   the binary is there and `khm` is not — a different
 *                         package, and a run that proceeds without it produces
 *                         confident Latin transliteration of Khmer script
 *   PDF_FETCH_FAILED      the world was briefly unavailable — retry
 *   STORAGE_UNRESOLVABLE  OUR allow-list refused the URL — see above, it is a
 *                         statement about this machine
 *   OCR_EMPTY             tesseract succeeded and returned nothing: the page
 *                         really may be blank, so it is not a failure of the
 *                         run, only of the page
 *   TEXT_HEALTH_FAILED    tesseract returned text and the text is not Khmer a
 *                         reader could use — the one outcome that a zero exit
 *                         code cannot rule out
 *
 * `PARTIAL_WRITE_CLEANED` is deliberately an outcome rather than a silent
 * recovery: a record whose pages were removed after a half-finished insert is
 * a fact the next run needs, and `lib/pdf-page-index.ts` already establishes
 * that absent beats truncated.
 *
 * Pure — no I/O, no Node built-ins — so the CLI, the container and the unit
 * tests all name failures with the same words.
 */

export const OCR_ERROR_CODES = [
  "ENVIRONMENT_MISMATCH",
  "BOOK_NOT_FOUND",
  "NO_PDF_FILE",
  "STORAGE_UNRESOLVABLE",
  "PDF_FETCH_FAILED",
  "PDF_RENDER_FAILED",
  "POPPLER_UNAVAILABLE",
  "TESSERACT_UNAVAILABLE",
  "KHMER_MODEL_MISSING",
  "OCR_PROCESS_FAILED",
  "OCR_EMPTY",
  "TEXT_HEALTH_FAILED",
  "EXISTING_TEXT_HEALTHY",
  "DB_WRITE_FAILED",
  "PARTIAL_WRITE_CLEANED",
] as const;

export type OcrErrorCode = (typeof OCR_ERROR_CODES)[number];

/** A stop with a name, a sentence, and optionally the thing that caused it. */
export class OcrError extends Error {
  readonly code: OcrErrorCode;
  readonly cause?: unknown;

  constructor(code: OcrErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "OcrError";
    this.code = code;
    this.cause = cause;
  }
}

export function isOcrError(err: unknown): err is OcrError {
  return err instanceof OcrError;
}

/**
 * Codes that describe US or the world rather than the document.
 *
 * The distinction is the same one `lib/indexing/retry.ts` draws and it is
 * load-bearing in the same way: a book skipped because this machine has no
 * `khm` traineddata has learned nothing about that book, and must not be
 * written down as one OCR cannot help.
 */
export const ENVIRONMENTAL_CODES: ReadonlySet<OcrErrorCode> = new Set<OcrErrorCode>([
  "ENVIRONMENT_MISMATCH",
  "STORAGE_UNRESOLVABLE",
  "POPPLER_UNAVAILABLE",
  "TESSERACT_UNAVAILABLE",
  "KHMER_MODEL_MISSING",
]);

/** Is this a fact about the machine rather than about the resource? */
export function isEnvironmental(code: OcrErrorCode): boolean {
  return ENVIRONMENTAL_CODES.has(code);
}
