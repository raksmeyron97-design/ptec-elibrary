// scripts/copy-pdf-assets.mjs
//
// Copies the pdf.js worker + cMaps + standard fonts into /public/pdf so the
// PDF viewer works fully OFFLINE and renders embedded fonts (incl. Khmer/CID).
//
// It resolves the pdfjs-dist that *react-pdf* actually uses, so the copied
// worker version always matches react-pdf's API version — no more
// "API version X does not match the Worker version Y".
//
// Run it once, and/or wire it into package.json:
//   "scripts": { "postinstall": "node scripts/copy-pdf-assets.mjs" }
//
// Re-run after upgrading react-pdf or pdfjs-dist.

import { createRequire } from "node:module";
import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);

function resolvePdfjsDir() {
  // Prefer the pdfjs-dist resolved *from react-pdf's location* so versions match.
  try {
    const reactPdfPkg = require.resolve("react-pdf/package.json");
    const pkg = require.resolve("pdfjs-dist/package.json", {
      paths: [path.dirname(reactPdfPkg)],
    });
    return path.dirname(pkg);
  } catch {
    // Fallback: top-level pdfjs-dist (may differ from react-pdf's version).
    return path.dirname(require.resolve("pdfjs-dist/package.json"));
  }
}

const pdfjsDir = resolvePdfjsDir();
const { version } = require(path.join(pdfjsDir, "package.json"));
console.log(`📦 pdfjs-dist@${version}`);
console.log(`   from: ${pdfjsDir}`);

const outDir = path.resolve("public", "pdf");
await mkdir(outDir, { recursive: true });

// 1) Worker — try the known v5/v4 filenames, copy the first that exists.
const workerCandidates = [
  "build/pdf.worker.min.mjs",
  "build/pdf.worker.mjs",
  "build/pdf.worker.min.js",
  "legacy/build/pdf.worker.min.mjs",
];
const worker = workerCandidates
  .map((p) => path.join(pdfjsDir, p))
  .find((p) => existsSync(p));

if (!worker) {
  console.error("❌ Could not find a pdf.worker file in pdfjs-dist.");
  process.exit(1);
}
// Always output as .mjs so the import path in PDFViewer.tsx stays stable.
await cp(worker, path.join(outDir, "pdf.worker.min.mjs"));
console.log(`   ✓ worker  ← ${path.relative(pdfjsDir, worker)}`);

// 2) cMaps + standard fonts (needed for many non-Latin / CID-keyed fonts).
for (const sub of ["cmaps", "standard_fonts"]) {
  const src = path.join(pdfjsDir, sub);
  if (existsSync(src)) {
    await cp(src, path.join(outDir, sub), { recursive: true });
    console.log(`   ✓ ${sub}/`);
  } else {
    console.warn(`   · ${sub}/ not found (skipped)`);
  }
}

console.log("✅ PDF assets copied to public/pdf/");
