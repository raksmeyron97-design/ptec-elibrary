const fs = require('fs');
const file = '/Users/mac/Desktop/e-library-ptec/app/(admin)/admin/(protected)/catalogs/actions.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'import { redirect } from "next/navigation";',
  'import { redirect } from "next/navigation";\nimport { headers } from "next/headers";'
);

content = content.replace(
  '  // ✅ Go straight to copy-adding step\n  redirect(`/admin/catalogs/add-copies/${book.id}`);',
  `  // ✅ Go straight to copy-adding step
  const headersList = await headers();
  const host = headersList.get("host") || "admin.localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  redirect(\`\${protocol}://\${host}/admin/catalogs/add-copies/\${book.id}\`);`
);

fs.writeFileSync(file, content);
