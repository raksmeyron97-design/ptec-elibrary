import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import km from "@/messages/km.json";

/**
 * Every English message must have a Khmer counterpart.
 *
 * The site is bilingual, and a missing Khmer string does not fail loudly — it
 * renders the raw key, or (worse) English text inside an otherwise Khmer
 * screen, which is how the Data Quality reconciliation panel shipped as an
 * untranslated block for months. A key added on one side only is the failure
 * mode; this is the check that names it at the point it happens.
 *
 * The reverse direction is deliberately NOT enforced: a leftover Khmer key
 * that English has dropped renders nothing and harms nobody.
 */
function flatten(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("message catalogue parity", () => {
  it("translates every English key into Khmer", () => {
    const khmerKeys = new Set(flatten(km));
    const missing = flatten(en).filter((key) => !khmerKeys.has(key));
    expect(missing, "keys present in messages/en.json but not in messages/km.json").toEqual([]);
  });

  it("leaves no message blank in either catalogue", () => {
    const blanks: string[] = [];
    for (const [locale, catalogue] of [["en", en], ["km", km]] as const) {
      const walk = (value: unknown, prefix: string) => {
        if (typeof value === "string") {
          if (value.trim() === "") blanks.push(`${locale}: ${prefix}`);
          return;
        }
        if (typeof value === "object" && value !== null) {
          for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
            walk(child, prefix ? `${prefix}.${key}` : key);
          }
        }
      };
      walk(catalogue, "");
    }
    expect(blanks).toEqual([]);
  });
});
