/**
 * lib/pdf-client-utils.ts
 *
 * Ultra-fast, zero-dependency PDF page count extraction running directly in
 * the browser. Works offline, handles all PDF versions, and requires zero
 * external Web Workers or heavy packages.
 */

/**
 * Validates whether a given File or Blob is a PDF document by checking its
 * MIME type or filename extension.
 */
export function isPdfFile(file: File | null | undefined): boolean {
  if (!file) return false;
  const name = file.name ? file.name.toLowerCase() : "";
  if (name.endsWith(".pdf")) return true;
  const type = file.type ? file.type.toLowerCase() : "";
  if (type === "application/pdf" || type === "application/x-pdf" || type.includes("pdf")) return true;
  return false;
}

/**
 * Extracts page count from raw PDF bytes in memory using multi-strategy parsing.
 */
export function extractPageCountFromBuffer(buffer: ArrayBuffer): number | null {
  try {
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 16) return null;

    // Check PDF Magic Bytes %PDF-
    const header = String.fromCharCode(...bytes.slice(0, 8));
    if (!header.includes("%PDF-")) return null;

    // Decode as latin1 (1 byte = 1 char, preserves all binary structure)
    const decoder = new TextDecoder("latin1");
    const text = decoder.decode(bytes);

    let maxCount = 0;
    let match: RegExpExecArray | null;

    // Strategy 1: Forward search in /Pages dictionary for /Count N
    // Handles /Type /Pages ... /Count 123, /Type/Pages ... /Count 123, etc.
    const forwardPagesRegex = /\/Type\s*\/\s*Pages\b[\s\S]{1,2000}?\/Count\s*(\d+)/g;
    while ((match = forwardPagesRegex.exec(text)) !== null) {
      const count = parseInt(match[1], 10);
      if (!isNaN(count) && count > maxCount) {
        maxCount = count;
      }
    }

    // Strategy 2: Backward search for /Count N ... /Type /Pages
    const backwardPagesRegex = /\/Count\s*(\d+)[\s\S]{1,2000}?\/Type\s*\/\s*Pages\b/g;
    while ((match = backwardPagesRegex.exec(text)) !== null) {
      const count = parseInt(match[1], 10);
      if (!isNaN(count) && count > maxCount) {
        maxCount = count;
      }
    }

    if (maxCount > 0) return maxCount;

    // Strategy 3: Count distinct /Type /Page (singular) object definitions
    const pageRegex = /\/Type\s*\/\s*Page\b(?!\s*s)/g;
    const pageMatches = text.match(pageRegex);
    if (pageMatches && pageMatches.length > 0) {
      return pageMatches.length;
    }

    // Strategy 4: General /Count N in dictionary objects
    const generalCountRegex = /\/Count\s+(\d+)/g;
    while ((match = generalCountRegex.exec(text)) !== null) {
      const count = parseInt(match[1], 10);
      if (!isNaN(count) && count > maxCount) {
        maxCount = count;
      }
    }

    if (maxCount > 0) return maxCount;

    return null;
  } catch (err) {
    console.warn("[extractPageCountFromBuffer] Parse error:", err);
    return null;
  }
}

/**
 * Reads a PDF File in the browser and returns its total page count.
 */
export async function getPdfPageCount(file: File): Promise<number | null> {
  if (!isPdfFile(file)) return null;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const count = extractPageCountFromBuffer(arrayBuffer);
    if (count && count > 0) return count;

    // Fallback for PDF 1.5+ compressed object streams (/Type /ObjStm)
    if (typeof DecompressionStream !== "undefined") {
      const bytes = new Uint8Array(arrayBuffer);
      const decoder = new TextDecoder("latin1");
      const text = decoder.decode(bytes);

      const objStmRegex = /<<[^>]*\/Type\s*\/\s*ObjStm[\s\S]*?>>\s*stream[\r\n]{1,2}([\s\S]*?)endstream/g;
      let objMatch: RegExpExecArray | null;
      let totalObjPages = 0;

      while ((objMatch = objStmRegex.exec(text)) !== null) {
        try {
          const rawStream = objMatch[1];
          const streamBytes = new Uint8Array(rawStream.length);
          for (let i = 0; i < rawStream.length; i++) {
            streamBytes[i] = rawStream.charCodeAt(i);
          }

          const ds = new DecompressionStream("deflate");
          const writer = ds.writable.getWriter();
          await writer.write(streamBytes);
          await writer.close();

          const reader = ds.readable.getReader();
          const chunks: Uint8Array[] = [];
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
          }

          const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
          const decompressed = new Uint8Array(totalLen);
          let offset = 0;
          for (const c of chunks) {
            decompressed.set(c, offset);
            offset += c.length;
          }

          const decompressedText = decoder.decode(decompressed);
          const pageMatches = decompressedText.match(/\/Type\s*\/\s*Page\b(?!\s*s)/g);
          if (pageMatches) totalObjPages += pageMatches.length;

          const countMatch =
            /\/Type\s*\/\s*Pages[\s\S]{1,500}?\/Count\s*(\d+)/.exec(decompressedText) ||
            /\/Count\s*(\d+)[\s\S]{1,500}?\/Type\s*\/\s*Pages/.exec(decompressedText);
          if (countMatch) {
            const parsed = parseInt(countMatch[1], 10);
            if (!isNaN(parsed) && parsed > 0) return parsed;
          }
        } catch {
          // Ignore individual stream decompression errors
        }
      }

      if (totalObjPages > 0) return totalObjPages;
    }

    return null;
  } catch (err) {
    console.warn("[getPdfPageCount] Error reading PDF:", err);
    return null;
  }
}
