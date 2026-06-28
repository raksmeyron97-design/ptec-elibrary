// Compiles app/globals.css (Tailwind v4) to .design-sync/compiled-globals.css
// using the project's own postcss + @tailwindcss/postcss plugin.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const postcss = require(resolve(repoRoot, 'node_modules/postcss/lib/postcss.js'));
const tailwindPlugin = require(resolve(repoRoot, 'node_modules/@tailwindcss/postcss/dist/index.js'));

const inputPath = resolve(repoRoot, 'app/globals.css');
const outputDir = resolve(repoRoot, '.design-sync');
const outputPath = resolve(outputDir, 'compiled-globals.css');

mkdirSync(outputDir, { recursive: true });

const css = readFileSync(inputPath, 'utf8');
console.log('Compiling Tailwind v4 CSS…');

const result = await postcss([tailwindPlugin]).process(css, {
  from: inputPath,
  to: outputPath,
});

writeFileSync(outputPath, result.css);
console.log(`Written to: ${outputPath}`);
console.log(`Size: ${(result.css.length / 1024).toFixed(1)} KB`);
