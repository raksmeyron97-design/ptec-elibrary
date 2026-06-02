const fs = require('fs');
const path = require('path');

const dirs = ['app/(public)', 'components', 'app/(auth)'];
const regex = /(bg|text|border)-(white|black|blue-[0-9]+|gold-[0-9]+|gray-[0-9]+|slate-[0-9]+)|style=\{\{.*?(color|background)/g;

function walk(dir, filelist = []) {
  if (!fs.existsSync(dir)) return filelist;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filepath = path.join(dir, file);
    if (fs.statSync(filepath).isDirectory()) {
      if (filepath !== 'components/admin' && filepath !== 'app/(admin)') {
        walk(filepath, filelist);
      }
    } else {
      if (filepath.endsWith('.tsx') || filepath.endsWith('.ts')) {
        filelist.push(filepath);
      }
    }
  }
  return filelist;
}

const allFiles = dirs.flatMap(d => walk(d));
const offenders = {};

allFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    let match;
    while ((match = regex.exec(line)) !== null) {
      if (!offenders[file]) offenders[file] = [];
      offenders[file].push({ line: i + 1, match: match[0], content: line.trim() });
    }
  });
});

fs.writeFileSync('offenders.json', JSON.stringify(offenders, null, 2));
console.log('Found offenders in', Object.keys(offenders).length, 'files');
