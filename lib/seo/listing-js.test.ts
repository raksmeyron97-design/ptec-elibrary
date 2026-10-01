import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// SEO Phase 6 (F15): /books and /catalogs carried 45 KB of JavaScript no other
// page did — the Supabase browser client (realtime, storage, WebAuthn; 161 KB
// uncompressed), pulled in by the "Request a book" button to ask whether its
// dialog should show a sign-in prompt. <SessionProvider> answers that from one
// shared /api/me read. This walks each listing page's STATIC import graph and
// fails if it reaches the browser client again. A `import()` inside a handler
// is not a static import and is allowed — that is the way to load it lazily.

const ROOT = path.resolve(__dirname, "../..");
const BROWSER_CLIENT = path.join(ROOT, "lib/supabase/client.ts");

function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null; // a package
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(candidate) && !candidate.endsWith(path.sep) && /\.(ts|tsx)$/.test(candidate)) return candidate;
  }
  return null;
}

function staticImports(file: string): string[] {
  // No comment stripping: a line comment reading "/auth/* lives…" opened a
  // fake block comment that swallowed every import after it. The patterns
  // only match a statement that STARTS a line, which a comment line cannot.
  const src = readFileSync(file, "utf8");
  const specs: string[] = [];
  for (const m of src.matchAll(/^\s*(import|export)\s+(?!type\b)[^;]*?\sfrom\s+["']([^"']+)["']/gm)) specs.push(m[2]);
  for (const m of src.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) specs.push(m[1]);
  return specs;
}

/** The chain of files from `entry` to `target`, or null when none exists. */
function pathTo(entry: string, target: string): string[] | null {
  const seen = new Set<string>();
  const stack: { file: string; chain: string[] }[] = [{ file: entry, chain: [entry] }];
  while (stack.length) {
    const { file, chain } = stack.pop()!;
    if (file === target) return chain;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of staticImports(file)) {
      const next = resolve(file, spec);
      if (next && !seen.has(next)) stack.push({ file: next, chain: [...chain, next] });
    }
  }
  return null;
}

describe("listing pages do not ship the Supabase browser client", () => {
  it.each(["app/[locale]/(public)/books/page.tsx", "app/[locale]/(public)/catalogs/page.tsx"])("%s", (page) => {
    const chain = pathTo(path.join(ROOT, page), BROWSER_CLIENT);
    expect(chain?.map((f) => path.relative(ROOT, f))).toBeUndefined();
  });

  it("the walker finds the client where a page does ship it (negative control)", () => {
    // The post page's like/comment bar uses the browser client on purpose.
    const chain = pathTo(path.join(ROOT, "app/[locale]/(public)/posts/[slug]/page.tsx"), BROWSER_CLIENT);
    expect(chain?.map((f) => path.relative(ROOT, f)).at(-1)).toBe("lib/supabase/client.ts");
  });
});
