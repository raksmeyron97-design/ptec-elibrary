const fs = require('fs');

const mappings = [
  { regex: /\btext-blue-(900|950)\b/g, replace: 'text-text-heading' },
  { regex: /\btext-gray-900\b/g, replace: 'text-text-heading' },
  { regex: /\btext-slate-900\b/g, replace: 'text-text-heading' },
  { regex: /\btext-(gray|slate)-(600|700)\b/g, replace: 'text-text-body' },
  { regex: /\btext-(gray|slate)-(400|500)\b/g, replace: 'text-text-muted' },
  { regex: /\btext-blue-(700|800)\b/g, replace: 'text-brand' },
  { regex: /\bbg-blue-(700|800)\b/g, replace: 'bg-brand' },
  { regex: /\bhover:bg-blue-(700|800)\b/g, replace: 'hover:bg-brand-hover' },
  { regex: /\bborder-(gray-200|blue-100|blue-200|slate-200|blue-300)\b/g, replace: 'border-divider' },
];

const filesToProcess = JSON.parse(fs.readFileSync('offenders.json', 'utf8'));

// Exceptions (intentional dark elements)
const exactExceptions = [
  'app/(public)/home/page.tsx', 
  'components/layout/Navbar.tsx', 
  'components/layout/Footer.tsx',
  'app/(auth)/auth/login/LoginContent.tsx',
  'app/(auth)/auth/signup/SignupContent.tsx'
];

let replacedCount = 0;

for (const file of Object.keys(filesToProcess)) {
  if (exactExceptions.includes(file)) continue; // skip files needing manual review

  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Safe to replace bg-white with bg-bg-surface in components?
  // Yes, most component backgrounds are surfaces.
  content = content.replace(/\bbg-white\b/g, 'bg-bg-surface');
  // Safe to replace bg-slate-950 with bg-bg-surface/5 or similar? The prompt didn't strictly say, but let's stick to mapped.
  
  for (const map of mappings) {
    content = content.replace(map.regex, map.replace);
  }

  // specific fixes for books page
  if (file === 'app/(public)/books/[slug]/page.tsx') {
    content = content.replace(/\bbg-blue-200\b/g, 'bg-brand/10');
  }

  if (content !== original) {
    fs.writeFileSync(file, content);
    replacedCount++;
  }
}

console.log('Automated replacements completed in ' + replacedCount + ' files.');
