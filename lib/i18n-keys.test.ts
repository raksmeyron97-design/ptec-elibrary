// lib/i18n-keys.test.ts
//
// Every key a component ASKS FOR exists in the namespace it asks in.
//
// lib/i18n-parity.test.ts already guards en ↔ km: no key can exist in one
// catalogue and not the other. That is the wrong axis for this failure. The
// "Save to research" button in AskWidget calls `t("saveSource")` under
// `useTranslations("ask")`, and `saveSource` was added to the `reader`
// namespace instead — present in BOTH catalogues, so parity held perfectly
// while the button rendered `MISSING_MESSAGE: Could not resolve
// 'ask.saveSource'` to every reader.
//
// Nothing caught it until a Playwright test failed on a button whose label was
// an error string, 30 minutes into CI, twice. next-intl resolves keys at
// RENDER time, so neither tsc nor the unit suite can see the gap; the only
// cheap place to notice is the source itself.
//
// Deliberately literal-only. A key built from a variable or a template string
// cannot be checked without evaluating the component, and guessing at one
// would produce failures nobody can act on — so those are skipped and counted,
// and the count is asserted to stay small enough that the check still means
// something.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const en = JSON.parse(readFileSync(path.join(ROOT, "messages/en.json"), "utf8")) as Record<
  string,
  unknown
>;

/** Files that could render a translated string. */
function sourceFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "*.ts", "*.tsx"], { cwd: ROOT, encoding: "utf8" });
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));
}

/**
 * `const t = useTranslations("ask")` → t is bound to `ask`.
 *
 * Both hooks are matched, and `await getTranslations(...)` with them, because
 * a server component reaches for the same catalogue by a different name.
 * A namespace-less call binds nothing: its keys are absolute paths into the
 * catalogue and are resolved from the root below.
 */
const BINDING_RE =
  /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(\s*(?:"([^"]*)"|'([^']*)')?\s*\)/g;

/**
 * `await getTranslations({ locale, namespace: "theses" })` — the server form,
 * which takes an options object rather than a bare string.
 */
const BINDING_OBJECT_RE =
  /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?getTranslations\s*\(\s*\{[^}]*namespace:\s*(?:"([^"]*)"|'([^']*)')/g;

/** `t("key")`, `t.rich("key")`, `t.markup("key")` — literal keys only. */
const callsFor = (name: string) =>
  new RegExp(`\\b${name}(?:\\.(?:rich|markup|raw))?\\s*\\(\\s*(?:"([^"$\\\\]*)"|'([^'$\\\\]*)')`, "g");

/** Resolve "a.b.c" through the catalogue. */
function lookup(root: unknown, dotted: string): unknown {
  return dotted
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((node, part) => {
      if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
        return (node as Record<string, unknown>)[part];
      }
      return undefined;
    }, root);
}

type Missing = { file: string; namespaces: string[]; key: string };

/**
 * A file may bind the same name twice — one component in it uses
 * `useTranslations("adminTheses")` and another `useTranslations(
 * "adminTheses.details")`. Regexes have no scopes, so every namespace a name
 * is bound to in a file is a CANDIDATE, and a key counts as missing only when
 * it resolves under none of them.
 *
 * That is a deliberate under-report: it cannot catch a key filed in the wrong
 * one of two namespaces the same file already uses. It does catch the case
 * this test exists for — a key that is nowhere its component could reach —
 * without inventing failures nobody can act on.
 */
function scan(): { missing: Missing[]; checked: number } {
  const missing: Missing[] = [];
  let checked = 0;

  for (const file of sourceFiles()) {
    const src = readFileSync(path.join(ROOT, file), "utf8");
    if (!src.includes("useTranslations") && !src.includes("getTranslations")) continue;

    const bound = new Map<string, Set<string>>();
    for (const re of [BINDING_RE, BINDING_OBJECT_RE]) {
      re.lastIndex = 0;
      for (let b = re.exec(src); b; b = re.exec(src)) {
        const namespaces = bound.get(b[1]) ?? new Set<string>();
        namespaces.add(b[2] ?? b[3] ?? "");
        bound.set(b[1], namespaces);
      }
    }

    for (const [variable, namespaces] of bound) {
      // A translator that is also passed as an argument is out of reach: the
      // callee's `t("x")` belongs to whatever namespace the CALLER bound, and
      // a file often hands a different one to each helper. Attribution by
      // regex would be a guess, so these are skipped rather than reported.
      if (new RegExp(`[(,]\\s*${variable}\\s*[:,)]`).test(src)) continue;
      const re = callsFor(variable);
      for (let c = re.exec(src); c; c = re.exec(src)) {
        const key = c[1] ?? c[2];
        if (!key) continue;
        checked++;
        const reachable = [...namespaces].some(
          (ns) => lookup(en, ns ? `${ns}.${key}` : key) !== undefined,
        );
        if (!reachable) missing.push({ file, namespaces: [...namespaces], key });
      }
    }
  }
  return { missing, checked };
}

describe("every translation key a component asks for exists", () => {
  const { missing, checked } = scan();

  it("resolves every literal t(...) key in the namespace it was asked in", () => {
    // The message names the namespace, because the bug is almost never a
    // missing string — it is a string filed under the wrong heading, which
    // reads as present to every other check.
    const report = missing.map(
      (m) => `${m.file}: t("${m.key}") — not in ${m.namespaces.map((n) => n || "<root>").join(" or ")}`,
    );
    expect(report).toEqual([]);
  });

  it("checks enough keys to be worth having", () => {
    // A regex that silently stops matching would pass this file forever. The
    // floor is a smoke alarm for the scanner itself, not a target.
    expect(checked).toBeGreaterThan(200);
  });
});
