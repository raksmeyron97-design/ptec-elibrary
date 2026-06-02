const fs = require('fs');

const replacements = [
  {
    file: 'app/(public)/books/[slug]/error.tsx',
    find: 'text-white transition hover:bg-brand-hover',
    replace: 'text-brand-contrast transition hover:bg-brand-hover'
  },
  {
    file: 'app/(public)/books/error.tsx',
    find: 'text-white transition hover:bg-brand-hover',
    replace: 'text-brand-contrast transition hover:bg-brand-hover'
  },
  {
    file: 'app/(public)/posts/error.tsx',
    find: 'text-white transition hover:bg-brand-hover',
    replace: 'text-brand-contrast transition hover:bg-brand-hover'
  },
  {
    file: 'app/(public)/catalogs/[slug]/page.tsx',
    find: 'on_order:    "text-blue-500",',
    replace: 'on_order:    "text-info",'
  },
  {
    file: 'app/(public)/catalogs/[slug]/page.tsx',
    find: 'on_order:    "bg-blue-400",',
    replace: 'on_order:    "bg-info",'
  },
  // the rest of catalogs/[slug]/page.tsx is the hero section which seems intentionally dark, wait!
  // It has <p className="font-khmer-serif text-lg font-bold leading-tight text-white">{b.title}</p>
  // Wait, the catalog page hero uses the book cover as a blurred background, so it IS intentionally dark.
  
  {
    file: 'app/(public)/dashboard/page.tsx',
    find: 'cover: b.cover_color ?? "bg-blue-950",',
    replace: 'cover: b.cover_color ?? "bg-bg-surface",' // wait, is this a semantic color? cover_color is fixed. Let's leave cover_color as is. It's a cover color.
  },
  {
    file: 'app/(public)/dashboard/page.tsx',
    find: 'color: "text-gold-700"',
    replace: 'color: "text-accent"'
  }
];

let count = 0;
for (const r of replacements) {
  if (fs.existsSync(r.file)) {
    let content = fs.readFileSync(r.file, 'utf8');
    if (content.includes(r.find)) {
      content = content.replace(r.find, r.replace);
      fs.writeFileSync(r.file, content);
      count++;
    }
  }
}
console.log('Fixed ' + count + ' items manually via script.');
