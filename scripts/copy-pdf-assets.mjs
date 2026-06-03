import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const reactPdfPath = path.dirname(require.resolve("react-pdf/package.json"));
const pdfjsDistPath = path.dirname(require.resolve("pdfjs-dist/package.json", { paths: [reactPdfPath] }));
const targetDir = path.join(process.cwd(), "public", "pdf");

fs.mkdirSync(targetDir, { recursive: true });

// Copy worker
fs.copyFileSync(
  path.join(pdfjsDistPath, "build", "pdf.worker.min.mjs"),
  path.join(targetDir, "pdf.worker.min.mjs")
);

// Copy cmaps
fs.cpSync(
  path.join(pdfjsDistPath, "cmaps"),
  path.join(targetDir, "cmaps"),
  { recursive: true }
);

// Copy standard fonts
fs.cpSync(
  path.join(pdfjsDistPath, "standard_fonts"),
  path.join(targetDir, "standard_fonts"),
  { recursive: true }
);

const { version } = require(path.join(pdfjsDistPath, "package.json"));
console.log(`📦 pdfjs-dist@${version} … ✅ PDF assets copied`);
