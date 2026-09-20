import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import km from "@/messages/km.json";

/**
 * A `t.rich` handler names a TAG, not an argument — and the two fail
 * differently.
 *
 * The Data Quality reconciliation hints were written as ICU arguments,
 * `run {command} to close the gap`, while the component passed
 * `command: () => <code>…</code>`. next-intl's `RichTranslationValues` admits
 * `string | number | Date | ((chunks) => ReactNode)`, so a function is a legal
 * value for `{command}` — it is substituted as-is, React refuses to render a
 * function as a child, and the sentence renders as "run  to close the gap."
 * with the command silently missing. The page still looked fine; only the one
 * piece of information the hint exists to convey was gone, on the page whose
 * whole job is telling a librarian which backfill to run.
 *
 * So the invariant is the pairing, checked against the source rather than
 * against a rendered page: every tag a hint handler supplies must exist as a
 * balanced tag in BOTH catalogues, and must not survive as a bare `{tag}`
 * argument in either.
 */
const SOURCE = join(process.cwd(), "components/admin/ResourceCountAudit.tsx");

/** `t.rich("fullText.hint", { command: …` → ["fullText.hint", "command"]. */
function richCalls(source: string): Array<{ key: string; tag: string }> {
  return [...source.matchAll(/t\.rich\(\s*"([^"]+)"\s*,\s*\{\s*([A-Za-z][A-Za-z0-9_]*)\s*:/g)].map(
    ([, key, tag]) => ({ key, tag }),
  );
}

function message(catalogue: unknown, path: string): string | undefined {
  const value = path
    .split(".")
    .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], catalogue);
  return typeof value === "string" ? value : undefined;
}

/** The namespace `ResourceCountAudit` resolves its keys against. */
const NAMESPACE = "adminDataQuality.reconcile";

describe("Data Quality reconciliation hints", () => {
  const calls = richCalls(readFileSync(SOURCE, "utf8"));

  it("finds the rich hints it is meant to police", () => {
    // Guards against the scan silently matching nothing after a refactor,
    // which would turn every assertion below into a vacuous pass.
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ["messages/en.json", en],
    ["messages/km.json", km],
  ])("pairs every handler with a real tag in %s", (_file, catalogue) => {
    const problems = calls.flatMap(({ key, tag }) => {
      const text = message(catalogue, `${NAMESPACE}.${key}`);
      if (text === undefined) return [`${key}: no such message`];
      const found: string[] = [];
      if (text.includes(`{${tag}}`)) {
        found.push(
          `${key}: uses the ICU argument {${tag}} but the code passes a tag handler — ` +
            `the function renders as nothing. Write <${tag}>…</${tag}>.`,
        );
      }
      if (!text.includes(`<${tag}>`) || !text.includes(`</${tag}>`)) {
        found.push(`${key}: handler supplies <${tag}> but the message has no balanced <${tag}> tag`);
      }
      return found;
    });
    expect(problems).toEqual([]);
  });

  it("keeps the command name inside the tag, where the reader can see it", () => {
    // The point of the hint is the command; an empty tag would satisfy the
    // pairing rule above while still telling the librarian nothing.
    for (const { key } of calls) {
      const text = message(en, `${NAMESPACE}.${key}`) ?? "";
      const inner = text.match(/<command>([\s\S]*?)<\/command>/)?.[1]?.trim() ?? "";
      expect(inner, `${key} renders an empty <command> tag`).toMatch(/\S/);
    }
  });
});
