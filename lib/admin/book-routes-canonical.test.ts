import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Source scan: no runtime code may link to a legacy book-management route.
 *
 * /admin/manage, /admin/manage/duplicates and /admin/upload were consolidated
 * into the /admin/books family. The legacy paths still resolve — they are
 * redirect pages, and bookmarks must keep working — but nothing the app renders
 * or revalidates may point at them, because a link through a redirect costs an
 * extra round trip and a `revalidatePath("/admin/manage")` busts a cache entry
 * that no longer exists.
 *
 * This is a source scan for the same reason the other invariant tests in this
 * repo are: a stale href is valid TypeScript, renders fine, and only shows up
 * as a slow click or a stale page in production.
 *
 * When this fails, the fix is in the file it names — import the constant from
 * lib/admin/ebooks-url.ts rather than spelling the path out again.
 */

const ROOTS = ["app", "components", "lib"];
const EXTENSIONS = [".ts", ".tsx"];

/** The redirect pages are the one place the legacy paths legitimately appear —
 *  and even there only as a folder name, never as a string. */
const ALLOWED = new Set([
  "app/(admin)/admin/(protected)/manage/page.tsx",
  "app/(admin)/admin/(protected)/manage/duplicates/page.tsx",
  "app/(admin)/admin/(protected)/upload/page.tsx",
  // These two quote the legacy paths on purpose: this file to forbid them,
  // ebooks-url.test.ts to assert the redirects still carry their query state.
  "lib/admin/book-routes-canonical.test.ts",
  "lib/admin/ebooks-url.test.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

const FILES = ROOTS.flatMap((root) => walk(root)).filter(
  (file) => !ALLOWED.has(relative(process.cwd(), file).split("\\").join("/")),
);

describe("book-management routes are canonical in source", () => {
  it("nothing references /admin/manage", () => {
    const offenders = FILES.filter((file) => readFileSync(file, "utf8").includes("/admin/manage"));
    expect(offenders.map((f) => relative(process.cwd(), f))).toEqual([]);
  });

  it("nothing references the /admin/upload page", () => {
    // `/api/admin/upload` is the upload API route and is NOT affected by this
    // migration — the negative lookbehind is what keeps it out of the results.
    const legacyUploadPage = /(?<!\/api)\/admin\/upload/;
    const offenders = FILES.filter((file) => legacyUploadPage.test(readFileSync(file, "utf8")));
    expect(offenders.map((f) => relative(process.cwd(), f))).toEqual([]);
  });

  it("the API upload route is untouched by the rule above", () => {
    const routeFile = "app/api/admin/upload/route.ts";
    const source = readFileSync(routeFile, "utf8");
    expect(source).toContain("/api/admin/upload");
    expect(/(?<!\/api)\/admin\/upload/.test(source)).toBe(false);
  });
});
