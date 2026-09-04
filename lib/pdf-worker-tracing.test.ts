/* lib/pdf-worker-tracing.test.ts
 *
 * The PDF text extractor needs TWO files from pdfjs-dist, and Next's file
 * tracer can only see one of them.
 *
 * `lib/pdf-page-index.ts` imports `pdfjs-dist/legacy/build/pdf.mjs` by string
 * literal, so that file is traced into `.next/standalone/node_modules/`. Its
 * worker is not imported — it is *named* at runtime by a mutable global,
 * `GlobalWorkerOptions.workerSrc ||= "./pdf.worker.mjs"`, which static
 * analysis cannot follow. The standalone bundle therefore shipped `pdf.mjs`
 * alone, and in the container every extraction threw on its first statement:
 *
 *     Setting up fake worker failed: "Cannot find module .../pdf.worker.mjs"
 *
 * `indexPdfPagesSafe()` catches everything by contract, so the throw became a
 * log line in a container nobody tails. Production ran five weeks with 120
 * books and zero `book_pages` rows: no phrase search inside any book, and no
 * page an AI answer could cite. Every local run passed the whole time, because
 * a development `node_modules` has the worker sitting next to `pdf.mjs`.
 *
 * This test reads the real dependency rather than a fixture, so it fails for
 * each way the arrangement can break: the tracing entry being dropped, pdfjs
 * renaming or moving the worker in an upgrade, or the extractor switching to a
 * build whose worker is a different file.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const ROOT = process.cwd();
const require_ = createRequire(import.meta.url);

/** The pdfjs entry point lib/pdf-page-index.ts actually loads. */
const PDFJS_ENTRY = "pdfjs-dist/legacy/build/pdf.mjs";

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("pdfjs worker is shipped to the standalone server", () => {
  it("the extractor still loads the legacy build this test reasons about", () => {
    // If the import specifier changes, the worker path below may no longer be
    // the right one — fail here rather than shipping a mismatched pair.
    expect(read("lib/pdf-page-index.ts")).toContain(PDFJS_ENTRY);
  });

  it("pdf.mjs resolves its worker by a runtime specifier, not an import", () => {
    const entry = require_.resolve(PDFJS_ENTRY);
    const source = readFileSync(entry, "utf8");

    // The exact line that defeats tracing. If a future pdfjs replaces it with
    // a real static import, this test's premise is gone and the
    // outputFileTracingIncludes entry can be reconsidered — so assert it.
    expect(source).toMatch(/workerSrc\s*\|\|=\s*["']\.\/pdf\.worker\.mjs["']/);
  });

  it("the worker file pdf.mjs asks for exists in node_modules", () => {
    const entry = require_.resolve(PDFJS_ENTRY);
    const worker = path.join(path.dirname(entry), "pdf.worker.mjs");
    expect(existsSync(worker)).toBe(true);
  });

  it("next.config.ts adds that worker to outputFileTracingIncludes", () => {
    const config = read("next.config.ts");

    expect(config).toContain("outputFileTracingIncludes");
    // The path is matched exactly, not by a loose /pdf\.worker/ — a typo in
    // the directory is the failure this guards, and a loose match would pass
    // through one.
    expect(config).toContain("./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
  });

  it("the traced path points at the same file pdf.mjs would load", () => {
    // Belt and braces: resolve the config's literal against the repo root and
    // check it is byte-identical in location to the worker beside the entry.
    const configured = path.join(ROOT, "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
    const beside = path.join(path.dirname(require_.resolve(PDFJS_ENTRY)), "pdf.worker.mjs");
    expect(path.resolve(configured)).toBe(path.resolve(beside));
  });
});
