import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ROOT_NAMESPACES,
  PUBLIC_NAMESPACES,
  AUTH_NAMESPACES,
  ADMIN_NAMESPACES,
} from "@/i18n/pick-messages";
import enMessages from "@/messages/en.json";
import kmMessages from "@/messages/km.json";

// ──────────────────────────────────────────────────────────────────
// Guards the per-route-group message split (i18n/pick-messages.ts).
//
// Each route-group layout serializes only its declared namespaces to the
// client. A client component calling useTranslations("x") under a tree
// whose provider doesn't include "x" renders raw keys in production. This
// test statically walks each tree's import graph and fails when a client
// component consumes a namespace the group doesn't provide.
// ──────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..");

type FileInfo = {
  imports: string[];
  namespaces: string[];
  isClient: boolean;
};

const IMPORT_RE = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
const NS_RE = /useTranslations\(\s*["']([a-zA-Z0-9_.]+)["']\s*\)/g;
// A bare useTranslations() call (no namespace) needs the ENTIRE catalogue —
// disallowed under the split.
const BARE_NS_RE = /useTranslations\(\s*\)/;

const fileCache = new Map<string, FileInfo | null>();

function readInfo(absPath: string): FileInfo | null {
  const cached = fileCache.get(absPath);
  if (cached !== undefined) return cached;
  let src: string;
  try {
    src = fs.readFileSync(absPath, "utf8");
  } catch {
    fileCache.set(absPath, null);
    return null;
  }
  const imports = [...src.matchAll(IMPORT_RE)].map((m) => m[1]);
  const namespaces = [...src.matchAll(NS_RE)].map((m) => m[1].split(".")[0]);
  if (BARE_NS_RE.test(src) && absPath.includes(`${path.sep}components${path.sep}`)) {
    namespaces.push("<entire catalogue via bare useTranslations()>");
  }
  const info: FileInfo = {
    imports,
    namespaces,
    isClient: /^\s*["']use client["']/m.test(src),
  };
  fileCache.set(absPath, info);
  return info;
}

function resolveSpec(spec: string, fromDir: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(fromDir, spec);
  else return null; // package import
  for (const cand of [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    path.join(base, "index.tsx"),
    path.join(base, "index.ts"),
  ]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
  }
  return null;
}

function listTreeFiles(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const p = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (/\.(tsx|ts)$/.test(entry.name) && !/\.test\.(tsx|ts)$/.test(entry.name))
        out.push(p);
    }
  }
  return out;
}

/** All namespaces used by client components reachable from the entry files. */
function clientNamespacesFor(entryFiles: string[]): Map<string, string[]> {
  const found = new Map<string, string[]>(); // ns -> example files
  const seen = new Set<string>();
  const stack = [...entryFiles];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const info = readInfo(file);
    if (!info) continue;
    if (info.isClient) {
      for (const ns of info.namespaces) {
        const arr = found.get(ns) ?? [];
        if (arr.length < 3) arr.push(path.relative(ROOT, file));
        found.set(ns, arr);
      }
    }
    for (const spec of info.imports) {
      const resolved = resolveSpec(spec, path.dirname(file));
      if (resolved) stack.push(resolved);
    }
  }
  return found;
}

function assertCovered(entryDirsOrFiles: string[], provided: readonly string[]) {
  const entries = entryDirsOrFiles.flatMap((p) =>
    fs.statSync(p).isDirectory() ? listTreeFiles(p) : [p],
  );
  const used = clientNamespacesFor(entries);
  const missing = [...used.entries()].filter(([ns]) => !provided.includes(ns));
  expect(
    missing,
    `client components use namespaces the route group does not provide:\n` +
      missing.map(([ns, files]) => `  "${ns}" used by ${files.join(", ")}`).join("\n"),
  ).toEqual([]);
}

describe("i18n namespace split coverage", () => {
  it("declared namespaces all exist in both catalogues", () => {
    for (const ns of [
      ...ROOT_NAMESPACES,
      ...PUBLIC_NAMESPACES,
      ...AUTH_NAMESPACES,
      ...ADMIN_NAMESPACES,
    ]) {
      expect(enMessages, `messages/en.json is missing "${ns}"`).toHaveProperty(ns);
      expect(kmMessages, `messages/km.json is missing "${ns}"`).toHaveProperty(ns);
    }
  });

  it("root layout tree is covered by ROOT ∪ PUBLIC (public provider nests inside root)", () => {
    // Root-level client components sit outside every group provider, so they
    // may only use ROOT_NAMESPACES. (PUBLIC included here because the root
    // layout renders group children whose own providers take over.)
    assertCovered([path.join(ROOT, "app/layout.tsx")], [
      ...ROOT_NAMESPACES,
      ...PUBLIC_NAMESPACES,
    ]);
  });

  it("public tree is covered by PUBLIC_NAMESPACES", () => {
    assertCovered([path.join(ROOT, "app/[locale]/(public)")], PUBLIC_NAMESPACES);
  });

  it("auth tree is covered by AUTH_NAMESPACES", () => {
    assertCovered([path.join(ROOT, "app/(auth)")], AUTH_NAMESPACES);
  });

  it("protected admin tree is covered by ADMIN_NAMESPACES", () => {
    assertCovered(
      [path.join(ROOT, "app/(admin)/admin/(protected)")],
      ADMIN_NAMESPACES,
    );
  });

  it("admin login/mfa pages use no client translations at all", () => {
    assertCovered(
      [
        path.join(ROOT, "app/(admin)/admin/login"),
        path.join(ROOT, "app/(admin)/admin/mfa"),
        path.join(ROOT, "app/(admin)/layout.tsx"),
      ],
      [],
    );
  });
});
