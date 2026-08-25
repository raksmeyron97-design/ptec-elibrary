/**
 * lib/pdf-client-utils.ts
 *
 * Client-side PDF utilities — lightweight helpers that run in the browser
 * using the same pdfjs-dist worker already shipped to /public/pdf for the
 * reader. Import only from "use client" components.
 *
 * Server-side PDF processing lives in lib/pdf-page-index.ts instead.
 */

/**
 * Reads a PDF File in the browser and returns its total page count
 * without uploading anything to the server. Uses the self-hosted
 * pdfjs worker at /public/pdf/pdf.worker.min.mjs so it works offline.
 *
 * Returns `null` when the count cannot be determined (corrupt file,
 * encrypted PDF, etc.) — callers should treat null as "unchanged"
 * rather than an error worth surfacing.
 */
export async function getPdfPageCount(file: File): Promise<number | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();

    // Dynamic import keeps the initial bundle lean — pdfjs is only
    // pulled in when an admin actually selects a PDF.
    const { pdfjs } = await import("react-pdf");

    // Re-use the same self-hosted worker the reader viewer uses.
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";
    }

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer),
      // Skip font/render work — we only need the page tree metadata.
      disableFontFace: true,
    });

    const doc = await loadingTask.promise;
    const count = doc.numPages;

    // Clean up worker memory.
    void loadingTask.destroy();

    return count > 0 ? count : null;
  } catch (err) {
    console.warn("[getPdfPageCount] Could not determine page count:", err);
    return null;
  }
}
