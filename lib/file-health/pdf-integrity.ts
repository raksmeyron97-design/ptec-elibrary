/**
 * Is a stored PDF the whole file, or only the start of one?
 *
 * The file-health sweep next door answers "does storage still serve this
 * file?" — a 200 settles it. That question cannot catch a file that IS served,
 * with a 200 and a valid `%PDF-` header, and is simply incomplete. Two
 * published books were in exactly that state and nothing in the system noticed
 * until a reader-side parse was attempted:
 *
 *   0c04dfc4  APA Publication Manual (7th ed.)   recorded 30,915 KB
 *                                                stored   10,485,051 B  (33%)
 *   488aa1b1  Data Analysis with MS Excel (3rd)  recorded 10,675 KB
 *                                                stored   10,483,690 B  (96%)
 *
 * Both open with `%PDF-1.x` and both fail in pdf.js with InvalidPDFException,
 * because a PDF is read from its tail: no `startxref`, no cross-reference
 * table, no document. So the reader shows a book that cannot be opened, the
 * indexer records `failed/permanent`, and the catalogue keeps advertising it.
 *
 * Two independent signals, deliberately kept separate — they cost different
 * things and fail differently:
 *
 *   SIZE     free. The sweep and the storage audit already know both numbers,
 *            so this costs no extra request. Catches truncation whenever the
 *            recorded size survived, which is the common case because the size
 *            is recorded from the file the admin selected, before upload.
 *   TRAILER  authoritative but costs a ranged read of the file's tail. Catches
 *            truncation even when the recorded size is missing or was written
 *            from the truncated bytes.
 *
 * Neither is a substitute for the other: a file truncated *before* its size
 * was recorded passes the size check and fails the trailer check.
 *
 * No I/O here on purpose — the callers do the fetching, these rules are
 * unit-tested offline against the real numbers above.
 */

/**
 * How much smaller than its recorded size a file may be before we call it
 * truncated.
 *
 * `file_size_kb` is a rounded kilobyte count, so a large file can legitimately
 * differ from `bytes / 1024` by a fraction of a percent. 3% is far outside
 * that rounding and far inside the real cases (the closest genuine truncation
 * measured is 4.1% short; the healthiest control is 0.009% short).
 */
export const TRUNCATION_TOLERANCE = 0.97;

/**
 * Is the stored object materially smaller than the size recorded for it?
 *
 * Returns false when either number is missing or non-positive — an absent
 * record is not evidence of truncation, and this must never manufacture a
 * verdict from a gap. A file LARGER than recorded is not truncated either;
 * that is rounding, or a re-upload whose row lagged.
 */
export function isSizeTruncated(declaredKb: number | null | undefined, actualBytes: number | null | undefined): boolean {
  if (!declaredKb || !actualBytes || declaredKb <= 0 || actualBytes <= 0) return false;
  return actualBytes / (declaredKb * 1024) < TRUNCATION_TOLERANCE;
}

/** Ratio of stored bytes to recorded bytes, or null when either is unknown. */
export function sizeRatio(declaredKb: number | null | undefined, actualBytes: number | null | undefined): number | null {
  if (!declaredKb || !actualBytes || declaredKb <= 0 || actualBytes <= 0) return null;
  return actualBytes / (declaredKb * 1024);
}

/**
 * Does this tail carry a usable PDF trailer?
 *
 * A complete PDF ends with `startxref`, the byte offset of its cross-reference
 * table, and `%%EOF`. `trailer` is deliberately NOT required: a file using a
 * cross-reference STREAM (PDF 1.5+) has no `trailer` keyword and is perfectly
 * valid — the healthy control in this collection is exactly that shape, so
 * requiring it would report 268 good books as broken.
 *
 * Pass the last few KB; the trailer is small but a linearised file can carry
 * padding after it, so read more tail than you think you need.
 */
export function hasPdfTrailer(tail: string): boolean {
  return tail.includes("startxref") && tail.includes("%%EOF");
}

/** Does this look like a PDF at all? */
export function hasPdfHeader(head: string): boolean {
  return head.startsWith("%PDF-");
}

export type PdfIntegrity =
  | { ok: true }
  | { ok: false; reason: "not-a-pdf" | "truncated-size" | "truncated-tail" };

/**
 * Combine what the caller managed to gather. Anything unknown is skipped
 * rather than guessed, so a caller that only has sizes still gets the size
 * verdict and never a false "intact".
 */
export function classifyPdfIntegrity(input: {
  head?: string | null;
  tail?: string | null;
  declaredKb?: number | null;
  actualBytes?: number | null;
}): PdfIntegrity {
  if (input.head != null && !hasPdfHeader(input.head)) return { ok: false, reason: "not-a-pdf" };
  if (isSizeTruncated(input.declaredKb, input.actualBytes)) return { ok: false, reason: "truncated-size" };
  if (input.tail != null && !hasPdfTrailer(input.tail)) return { ok: false, reason: "truncated-tail" };
  return { ok: true };
}
