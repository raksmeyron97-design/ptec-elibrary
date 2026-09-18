/* lib/ocr/tesseract.ts
 *
 * The two child processes this pipeline runs — `pdftoppm` to raster a page and
 * `tesseract` to read it — plus the preflight that refuses to start when
 * either is missing the piece that matters.
 *
 * ── Argument arrays, never a shell ──────────────────────────────────────────
 *
 * Every value that reaches these commands comes from the database (a slug, a
 * title, a storage path) or from a CLI flag. `spawn` is called with an
 * argument ARRAY and no shell, so a book titled `; rm -rf /` is a file name
 * and not a command. There is no string interpolation into a command line
 * anywhere in this file, and there must never be one: that is the single rule
 * that makes running an operator's queue over 1,916 librarian-entered titles
 * safe.
 *
 * ── Why the preflight checks the LANGUAGE and not just the binary ───────────
 *
 * `tesseract --version` succeeding proves nothing about Khmer. Without
 * `khm.traineddata` the binary does not fail — it falls back to `eng` and
 * returns confident Latin gibberish for every Khmer page, which then passes a
 * character count, passes an exit code, and only fails at
 * `analyzeTextHealth`, page by page, after the whole book has been rastered.
 * So the model is verified once, before any work, and a missing one is its own
 * error code (`KHMER_MODEL_MISSING`) rather than a run that looks broken in an
 * unrelated place.
 *
 * ── Why the parsers are exported ────────────────────────────────────────────
 *
 * `tesseract --list-langs` writes to stdout on 4.x/5.x and to stderr on 3.x,
 * with a header line that has changed wording between releases; `pdfinfo`
 * pads its labels. Those are the parts worth testing offline, and they are
 * pure functions here rather than inline regexes at a call site.
 */

import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { OcrError, type OcrErrorCode } from "./errors";

/**
 * Binary paths, resolved at CALL time rather than at module load.
 *
 * `process.env` is read per invocation so an operator can point a single run at
 * a non-standard install without the value being frozen by whichever import
 * happened first — and so a test can substitute a stand-in binary to exercise a
 * failure shape that needs no PDF.
 */
export const tesseractBin = () => process.env.TESSERACT_BIN ?? "tesseract";
export const pdftoppmBin = () => process.env.PDFTOPPM_BIN ?? "pdftoppm";
export const pdfinfoBin = () => process.env.PDFINFO_BIN ?? "pdfinfo";

/** Default rasterisation density. 300 DPI is Tesseract's documented sweet
 *  spot for 10–12 pt body text and is what every measurement in
 *  docs/TESSERACT_KHMER_OCR_SETUP.md was taken at. */
export const DEFAULT_DPI = 300;
/** Page segmentation mode 3 — fully automatic, no orientation detection.
 *  OSD (mode 1) needs `osd.traineddata` and costs a second pass per page. */
export const DEFAULT_PSM = 3;
export const DEFAULT_LANG = "khm";

/** A page of a scanned textbook takes 1–4 s; ten times that is a hang. */
const RENDER_TIMEOUT_MS = 120_000;
const OCR_TIMEOUT_MS = 180_000;
const PROBE_TIMEOUT_MS = 20_000;

export type CommandResult = { code: number; stdout: string; stderr: string };

/**
 * Run a command with an argument array and collect its output.
 *
 * `shell: false` is the default and is never overridden. A non-zero exit is
 * returned rather than thrown — the caller knows which error code the failure
 * deserves, and this function does not.
 */
export async function runCommand(
  bin: string,
  args: readonly string[],
  opts: { timeoutMs?: number; missingBinaryCode: OcrErrorCode },
): Promise<CommandResult> {
  const timeoutMs = opts.timeoutMs ?? OCR_TIMEOUT_MS;

  return new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(bin, [...args], { shell: false });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(
        new OcrError(
          "OCR_PROCESS_FAILED",
          `${bin} did not finish within ${Math.round(timeoutMs / 1000)}s and was killed`,
        ),
      );
    }, timeoutMs);

    child.stdout.on("data", (b: Buffer) => stdout.push(b));
    child.stderr.on("data", (b: Buffer) => stderr.push(b));

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(
          new OcrError(
            opts.missingBinaryCode,
            `${bin} is not installed or not on PATH. See docs/TESSERACT_KHMER_OCR_SETUP.md.`,
            err,
          ),
        );
        return;
      }
      reject(new OcrError("OCR_PROCESS_FAILED", `${bin} could not be started: ${err.message}`, err));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code: code ?? -1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

// ── Pure parsers ────────────────────────────────────────────────────────────

/** `tesseract 5.5.0\n leptonica-1.85.0` → `5.5.0`. */
export function parseTesseractVersion(output: string): string | null {
  const match = /^\s*tesseract\s+v?([0-9][^\s]*)/im.exec(output ?? "");
  return match ? match[1] : null;
}

/** `pdftoppm version 25.02.0` → `25.02.0`. Poppler prints it on stderr. */
export function parsePopplerVersion(output: string): string | null {
  const match = /pdftoppm\s+version\s+([0-9][^\s]*)/i.exec(output ?? "");
  return match ? match[1] : null;
}

/**
 * The language list, without the header line.
 *
 * Tesseract prints `List of available languages (N):` (3.x/4.x) or
 * `List of available languages in "...":` (5.x) and then one code per line.
 * Anything containing a space or a colon is prose, not a language code.
 */
export function parseLanguageList(output: string): string[] {
  return (output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.includes(" ") && !line.includes(":"))
    .filter((line) => /^[A-Za-z0-9_+-]+$/.test(line));
}

/** `Pages:           412` → 412. */
export function parsePdfInfoPages(output: string): number | null {
  const match = /^Pages:\s*(\d+)\s*$/im.exec(output ?? "");
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Does this stderr say the language pack is missing?
 *
 * Tesseract's wording has moved between releases ("Failed loading language",
 * "Error opening data file", "Could not initialize tesseract"), so the match
 * is on the stable half of each message.
 */
export function saysLanguageMissing(stderr: string): boolean {
  const text = stderr ?? "";
  return (
    /failed loading language/i.test(text) ||
    /error opening data file/i.test(text) ||
    // "Please make sure the TESSDATA_PREFIX environment variable is set to
    // your \"tessdata\" directory." — the stable half is the variable name.
    /tessdata_prefix/i.test(text)
  );
}

// ── Preflight ───────────────────────────────────────────────────────────────

export type OcrEnvironment = {
  tesseractVersion: string;
  popplerVersion: string | null;
  languages: string[];
  tessdataPrefix: string | null;
};

/**
 * Verify the tools and the models BEFORE any page is touched.
 *
 * Every language the run will ask for is checked, not just the first: `khm+eng`
 * silently degrades to whichever half is installed.
 */
export async function probeOcrEnvironment(langs: readonly string[]): Promise<OcrEnvironment> {
  const version = await runCommand(tesseractBin(), ["--version"], {
    timeoutMs: PROBE_TIMEOUT_MS,
    missingBinaryCode: "TESSERACT_UNAVAILABLE",
  });
  const tesseractVersion = parseTesseractVersion(`${version.stdout}\n${version.stderr}`);
  if (!tesseractVersion) {
    throw new OcrError(
      "TESSERACT_UNAVAILABLE",
      `${tesseractBin()} did not report a version. Output: ${(version.stderr || version.stdout).slice(0, 200)}`,
    );
  }

  const list = await runCommand(tesseractBin(), ["--list-langs"], {
    timeoutMs: PROBE_TIMEOUT_MS,
    missingBinaryCode: "TESSERACT_UNAVAILABLE",
  });
  const languages = parseLanguageList(`${list.stdout}\n${list.stderr}`);
  const missing = langs.filter((l) => !languages.includes(l));
  if (missing.length > 0) {
    throw new OcrError(
      "KHMER_MODEL_MISSING",
      `tesseract ${tesseractVersion} has no traineddata for: ${missing.join(", ")}. ` +
        `Installed: ${languages.join(", ") || "(none)"}. ` +
        `Install the language pack (brew install tesseract-lang, or the container image) ` +
        `— without it tesseract falls back to English and returns Latin gibberish for Khmer pages.`,
    );
  }

  // Poppler's version goes to stderr and older builds exit non-zero for `-v`.
  // Its absence is discovered here rather than on the first page.
  const poppler = await runCommand(pdftoppmBin(), ["-v"], {
    timeoutMs: PROBE_TIMEOUT_MS,
    missingBinaryCode: "POPPLER_UNAVAILABLE",
  });

  return {
    tesseractVersion,
    popplerVersion: parsePopplerVersion(`${poppler.stderr}\n${poppler.stdout}`),
    languages,
    tessdataPrefix: process.env.TESSDATA_PREFIX ?? null,
  };
}

// ── Rendering and recognition ───────────────────────────────────────────────

/** How many pages does this PDF have? */
export async function pdfPageCount(pdfPath: string): Promise<number> {
  const result = await runCommand(pdfinfoBin(), [pdfPath], {
    timeoutMs: PROBE_TIMEOUT_MS,
    missingBinaryCode: "POPPLER_UNAVAILABLE",
  });
  if (result.code !== 0) {
    throw new OcrError(
      "PDF_RENDER_FAILED",
      `pdfinfo exited ${result.code}: ${result.stderr.trim().slice(0, 200)}`,
    );
  }
  const pages = parsePdfInfoPages(result.stdout);
  if (pages === null) {
    throw new OcrError("PDF_RENDER_FAILED", "pdfinfo reported no page count");
  }
  return pages;
}

/**
 * Raster ONE page to a PNG and return its path.
 *
 * One page per invocation, deliberately. A 500-page textbook at 300 DPI is
 * several gigabytes of PNG; rendering the whole document up front is how a
 * batch job fills a container's disk before it recognizes anything. The caller
 * deletes each image after reading it, so peak disk is one page.
 *
 * `-gray` is asked of poppler rather than of a post-processing step: the
 * rasteriser already knows the page is not colour art, and converting after
 * the fact costs a full decode/encode round trip per page for the same pixels.
 */
export async function renderPdfPage(opts: {
  pdfPath: string;
  pageNo: number;
  outPrefix: string;
  dpi?: number;
  gray?: boolean;
}): Promise<string> {
  const dpi = opts.dpi ?? DEFAULT_DPI;
  const args = [
    "-f",
    String(opts.pageNo),
    "-l",
    String(opts.pageNo),
    "-r",
    String(dpi),
    "-png",
    "-singlefile",
    ...(opts.gray === false ? [] : ["-gray"]),
    opts.pdfPath,
    opts.outPrefix,
  ];

  const result = await runCommand(pdftoppmBin(), args, {
    timeoutMs: RENDER_TIMEOUT_MS,
    missingBinaryCode: "POPPLER_UNAVAILABLE",
  });
  if (result.code !== 0) {
    throw new OcrError(
      "PDF_RENDER_FAILED",
      `pdftoppm exited ${result.code} on page ${opts.pageNo}: ${result.stderr.trim().slice(0, 200)}`,
    );
  }

  /* An exit code of 0 is not proof that a page came out. `-singlefile` fixes
     the NAME, and poppler can still write nothing — a page number outside the
     document, a page it declines to rasterise — and then exit cleanly. Handing
     the absent path to tesseract turns that into an OCR_PROCESS_FAILED about a
     missing input file, which points the operator at the wrong half of the
     pipeline. Zero bytes is checked too: a truncated write is not an image. */
  const imagePath = `${opts.outPrefix}.png`;
  let bytes: number;
  try {
    bytes = (await stat(imagePath)).size;
  } catch {
    throw new OcrError(
      "PDF_RENDER_FAILED",
      `pdftoppm exited 0 but wrote no image for page ${opts.pageNo}` +
        `${result.stderr.trim() ? `: ${result.stderr.trim().slice(0, 200)}` : ""}`,
    );
  }
  if (bytes === 0) {
    throw new OcrError("PDF_RENDER_FAILED", `page ${opts.pageNo} rendered to an empty file`);
  }
  return imagePath;
}

/**
 * Read one page image. Returns raw stdout — post-processing is
 * `lib/ocr/text.ts`'s job, and keeping them apart is what lets the text rules
 * be tested without a binary.
 *
 * `--dpi` is passed explicitly because tesseract otherwise guesses from the
 * image header and logs "Estimating resolution as N"; a wrong guess changes
 * the segmentation, so the value that produced the pixels is the value that
 * reads them.
 */
export async function recognizePage(opts: {
  imagePath: string;
  lang?: string;
  psm?: number;
  dpi?: number;
}): Promise<string> {
  const args = [
    opts.imagePath,
    "stdout",
    "-l",
    opts.lang ?? DEFAULT_LANG,
    "--psm",
    String(opts.psm ?? DEFAULT_PSM),
    "--dpi",
    String(opts.dpi ?? DEFAULT_DPI),
  ];

  const result = await runCommand(tesseractBin(), args, {
    timeoutMs: OCR_TIMEOUT_MS,
    missingBinaryCode: "TESSERACT_UNAVAILABLE",
  });

  if (result.code !== 0) {
    if (saysLanguageMissing(result.stderr)) {
      throw new OcrError(
        "KHMER_MODEL_MISSING",
        `tesseract cannot load "${opts.lang ?? DEFAULT_LANG}": ${result.stderr.trim().slice(0, 200)}`,
      );
    }
    throw new OcrError(
      "OCR_PROCESS_FAILED",
      `tesseract exited ${result.code}: ${result.stderr.trim().slice(0, 200)}`,
    );
  }

  return result.stdout;
}

export type PreprocessMode = "none" | "normalize" | "threshold";

/**
 * Optional pixel work between poppler and tesseract.
 *
 * Deliberately small. A photocopied Cambodian textbook carries grey
 * background, faded ink, stamps, handwriting and illustrations, and an
 * aggressive pipeline damages Khmer before it helps it: the script's
 * diacritics — a coeng, a `ុ`, a `ំ` — are one or two pixels tall at body size,
 * and a threshold tuned for clean black text erases them. So:
 *
 *   none       trust poppler's grayscale. The right default for a PDF whose
 *              pages were rendered from vector text.
 *   normalize  stretch the histogram. Recovers faded photocopies without
 *              deciding anything about a pixel.
 *   threshold  binarise. Strongest, and the one that can destroy diacritics —
 *              opt-in, measured per book, never the default.
 *
 * Returns the path actually to be read, so a `none` run costs no decode.
 */
export async function preprocessImage(
  imagePath: string,
  mode: PreprocessMode,
): Promise<string> {
  if (mode === "none") return imagePath;

  // Lazy: sharp is a native module, and a unit test importing this file for
  // its parsers should not have to load it.
  const sharp = (await import("sharp")).default;
  const outPath = imagePath.replace(/\.png$/i, `.${mode}.png`);

  let pipeline = sharp(imagePath).grayscale().normalize();
  if (mode === "threshold") pipeline = pipeline.median(1).threshold(160);

  await pipeline.png({ compressionLevel: 6 }).toFile(outPath);
  return outPath;
}
