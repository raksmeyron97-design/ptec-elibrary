/**
 * Koha credentials act with a staff user's permissions, so the integration's
 * boundary is structural: Koha is reached only from the server, only through
 * lib/koha, and only lib/koha/index.ts reads the environment.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
/** Source with comments removed — a comment saying "no process.env" is not a read of it. */
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const gitGrep = (args: string[]): string[] => {
  try {
    // --untracked: a new file must not slip past the scan (lib/invariant-scan-coverage.test.ts).
    return execFileSync("git", ["grep", "--untracked", ...args], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  } catch {
    return []; // git grep exits 1 when nothing matches
  }
};

const KOHA_FILES = readdirSync(join(ROOT, "lib/koha"))
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => `lib/koha/${f}`);

describe("Koha integration boundary", () => {
  it("no Koha setting is ever exposed to the browser", () => {
    // Code and env templates — not prose, which names the rule in order to state it.
    const where = ["*.ts", "*.tsx", "*.js", "*.mjs", "*.cjs", ".env*", "*.yml", "Dockerfile", ":!lib/koha/boundary.test.ts"];
    expect(gitGrep(["-n", "NEXT_PUBLIC_KOHA", "--", ...where])).toEqual([]);
  });

  it("only lib/koha/index.ts reads process.env, and it is server-only", () => {
    for (const f of KOHA_FILES) {
      if (f === "lib/koha/index.ts") continue;
      expect(code(f), f).not.toMatch(/process\.env/);
    }
    expect(read("lib/koha/index.ts")).toMatch(/^import "server-only";/m);
  });

  it("no client component imports the Koha integration", () => {
    const importers = gitGrep(["-l", "-E", "from [\"']@/lib/koha", "--", "*.ts", "*.tsx"]);
    for (const f of importers) {
      expect(read(f), f).not.toMatch(/^["']use client["']/m);
    }
  });

  it("the client writes records only (POST /biblios, PUT /biblios/{id}), never DELETE or PATCH, and retries nothing but GET", () => {
    const src = code("lib/koha/client.ts");
    expect(src).not.toMatch(/"(DELETE|PATCH)"/);
    expect(src).toMatch(/type KohaWriteMethod = "POST" \| "PUT";/);
    expect(src).toMatch(/POST: \/\^\\\/biblios\$\/, PUT: \/\^\\\/biblios\\\/\[1-9\]\\d\*\$\//);
    // write() sends once: the retry loop lives in get() alone.
    const write = src.slice(src.indexOf("async write<T>("));
    expect(write).not.toMatch(/RETRY_DELAYS_MS|sleep\(/);
    expect(write).toMatch(/cfg\.mode !== "write" && cfg\.mode !== "mock"/);
  });

  it("nothing in lib/koha logs a token or a secret", () => {
    for (const f of KOHA_FILES) {
      const logs = read(f).match(/console\.\w+\([^)]*\)/g) ?? [];
      for (const l of logs) expect(l, f).not.toMatch(/token|secret|authorization/i);
    }
  });
});
