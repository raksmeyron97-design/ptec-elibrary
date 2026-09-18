import { describe, it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseLanguageList,
  parsePdfInfoPages,
  parsePopplerVersion,
  parseTesseractVersion,
  renderPdfPage,
  runCommand,
  saysLanguageMissing,
} from "./tesseract";
import { isOcrError } from "./errors";

/**
 * The parsers, against the output real binaries actually print.
 *
 * Every fixture below is copied from a live invocation — Tesseract 5.3.0 and
 * Poppler 22.12.0 inside `infra/ocr/Dockerfile`, and Tesseract 4.x from an
 * older Debian, because the wording of both the version banner and the
 * language header has moved between releases and a parser tuned to one of them
 * silently reports "no languages installed" against the other.
 */

const TESSERACT_5_VERSION = `tesseract 5.3.0
 leptonica-1.82.0
  libgif 5.2.1 : libjpeg 6b (libjpeg-turbo 2.1.5) : libpng 1.6.39 : libtiff 4.5.0 : zlib 1.2.13
 Found AVX2
 Found AVX
 Found SSE4.1`;

const TESSERACT_4_VERSION = `tesseract 4.1.1
 leptonica-1.79.0`;

const TESSERACT_5_LANGS = `List of available languages in "/usr/share/tesseract-ocr/5/tessdata/" (3):
eng
khm
osd`;

const TESSERACT_4_LANGS = `List of available languages (2):
eng
khm`;

describe("parseTesseractVersion", () => {
  it("reads the version from a 5.x banner", () => {
    expect(parseTesseractVersion(TESSERACT_5_VERSION)).toBe("5.3.0");
  });

  it("reads the version from a 4.x banner", () => {
    expect(parseTesseractVersion(TESSERACT_4_VERSION)).toBe("4.1.1");
  });

  it("answers null rather than guessing when nothing looks like a version", () => {
    expect(parseTesseractVersion("command not found")).toBeNull();
    expect(parseTesseractVersion("")).toBeNull();
  });
});

describe("parseLanguageList", () => {
  /**
   * The header line is prose and must never be reported as a language: a
   * "language" called `List` would satisfy the preflight for any request and
   * let a run proceed with no model at all.
   */
  it("drops the 5.x header and keeps only the codes", () => {
    expect(parseLanguageList(TESSERACT_5_LANGS)).toEqual(["eng", "khm", "osd"]);
  });

  it("drops the 4.x header, which is worded differently", () => {
    expect(parseLanguageList(TESSERACT_4_LANGS)).toEqual(["eng", "khm"]);
  });

  it("keeps script and variant codes, which carry punctuation a code may hold", () => {
    expect(parseLanguageList("khm_script\nchi_sim\nfra-old")).toEqual([
      "khm_script",
      "chi_sim",
      "fra-old",
    ]);
  });

  it("answers an empty list for empty output rather than throwing", () => {
    expect(parseLanguageList("")).toEqual([]);
  });
});

describe("parsePopplerVersion / parsePdfInfoPages", () => {
  it("reads poppler's version, which it prints on stderr", () => {
    expect(parsePopplerVersion("pdftoppm version 22.12.0\nCopyright 2005-2022 ...")).toBe("22.12.0");
  });

  it("reads the page count out of pdfinfo's padded labels", () => {
    const output = `Title:          សៀវភៅណែនាំគ្រូ
Producer:       LibreOffice 7.4
Pages:          412
Encrypted:      no`;
    expect(parsePdfInfoPages(output)).toBe(412);
  });

  it("does not mistake another padded number for the page count", () => {
    expect(parsePdfInfoPages("Page size:      595 x 842 pts\nFile size:      1200 bytes")).toBeNull();
  });

  it("refuses a zero page count", () => {
    expect(parsePdfInfoPages("Pages:          0")).toBeNull();
  });
});

describe("saysLanguageMissing", () => {
  /**
   * This is the failure that does NOT announce itself: without khm.traineddata
   * tesseract can fall back to English and answer confidently, so the messages
   * that DO say it are worth recognising across every wording Tesseract has
   * shipped.
   */
  it("recognises the wordings tesseract has used for a missing model", () => {
    expect(saysLanguageMissing("Error opening data file /usr/share/tessdata/khm.traineddata")).toBe(true);
    expect(saysLanguageMissing("Failed loading language 'khm'")).toBe(true);
    expect(
      saysLanguageMissing("Please make sure the TESSDATA_PREFIX environment variable is set"),
    ).toBe(true);
  });

  it("does not read an ordinary warning as a missing model", () => {
    expect(saysLanguageMissing("Estimating resolution as 301")).toBe(false);
    expect(saysLanguageMissing("")).toBe(false);
  });
});

describe("runCommand", () => {
  it("returns a non-zero exit rather than throwing — the caller names the failure", async () => {
    const result = await runCommand("/bin/sh", ["-c", "exit 3"], {
      missingBinaryCode: "TESSERACT_UNAVAILABLE",
    });
    expect(result.code).toBe(3);
  });

  it("collects stdout and stderr separately", async () => {
    const result = await runCommand("/bin/sh", ["-c", "echo out; echo err 1>&2"], {
      missingBinaryCode: "TESSERACT_UNAVAILABLE",
    });
    expect(result.stdout.trim()).toBe("out");
    expect(result.stderr.trim()).toBe("err");
  });

  it("reports a missing binary with the code the caller chose", async () => {
    await expect(
      runCommand("/nonexistent/pdftoppm", ["-v"], { missingBinaryCode: "POPPLER_UNAVAILABLE" }),
    ).rejects.toSatisfy((err: unknown) => isOcrError(err) && err.code === "POPPLER_UNAVAILABLE");
  });

  /**
   * Arguments are passed as an ARRAY with no shell, so a book title is a file
   * name and never a command. This is the one property that makes it safe to
   * run an operator's queue over 1,916 librarian-entered titles.
   */
  it("never interprets an argument as shell syntax", async () => {
    const hostile = "; touch /tmp/ptec-ocr-should-not-exist; echo pwned";
    const result = await runCommand("/bin/echo", [hostile], {
      missingBinaryCode: "TESSERACT_UNAVAILABLE",
    });
    expect(result.stdout.trim()).toBe(hostile);
    expect(result.code).toBe(0);
  });

  /**
   * A clean exit is not proof that a page came out. `-singlefile` fixes the
   * output NAME, and poppler can still write nothing — a page outside the
   * document, a page it declines to rasterise — and exit 0. Handing the absent
   * path to tesseract would report that as an OCR failure, pointing the
   * operator at the wrong half of the pipeline.
   */
  it("reports a render that exited 0 and produced no image as a RENDER failure", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ptec-ocr-test-"));
    const previous = process.env.PDFTOPPM_BIN;
    // `true` exits 0 and writes nothing — poppler's own silent-success shape,
    // reproduced without needing a PDF that provokes it.
    process.env.PDFTOPPM_BIN = "/usr/bin/true";
    try {
      await expect(
        renderPdfPage({ pdfPath: join(dir, "absent.pdf"), pageNo: 1, outPrefix: join(dir, "p1") }),
      ).rejects.toSatisfy(
        (err: unknown) =>
          isOcrError(err) && err.code === "PDF_RENDER_FAILED" && /wrote no image/.test(err.message),
      );
    } finally {
      if (previous === undefined) delete process.env.PDFTOPPM_BIN;
      else process.env.PDFTOPPM_BIN = previous;
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("kills a process that will not finish and says so", async () => {
    await expect(
      runCommand("/bin/sh", ["-c", "sleep 30"], {
        timeoutMs: 150,
        missingBinaryCode: "TESSERACT_UNAVAILABLE",
      }),
    ).rejects.toSatisfy((err: unknown) => isOcrError(err) && err.code === "OCR_PROCESS_FAILED");
  });
});
