// lib/i18n-parity.test.ts
//
// The build-time gate for bilingual coverage: every message key must exist in
// BOTH messages/en.json and messages/km.json, with the same shape.
//
// A missing key does not throw. next-intl falls back to the key path, so the
// symptom in production is an English page fragment inside a Khmer one, or a
// raw `home.trustNoAccount` where a sentence should be — on whichever page
// nobody happened to open in Khmer before shipping. This site is bilingual by
// mandate, not as a nicety, so that is a build failure rather than a warning.
//
// Complements lib/i18n-namespaces.test.ts, which checks that each namespace is
// listed in the right pickMessages() bundle. That one asks "is this namespace
// shipped to the client?"; this one asks "does this string exist in Khmer?".
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");

type Messages = { [k: string]: string | Messages };

function load(locale: string): Messages {
  return JSON.parse(readFileSync(path.join(ROOT, `messages/${locale}.json`), "utf8")) as Messages;
}

/** Every leaf key path, dot-joined. */
function leaves(messages: Messages, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [full] : leaves(value, full);
  });
}

/** Every key path, leaf or branch, with the kind of node it is. */
function shape(messages: Messages, prefix = ""): Map<string, "string" | "object"> {
  const out = new Map<string, "string" | "object">();
  for (const [key, value] of Object.entries(messages)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out.set(full, "string");
    } else {
      out.set(full, "object");
      for (const [k, v] of shape(value, full)) out.set(k, v);
    }
  }
  return out;
}

/**
 * ICU argument names used by a message — `{count}`, `{count, plural, ...}`.
 *
 * Plural and select OPTION BODIES are excluded: in
 * `{window, plural, =1 {bucket} other {# buckets}}`, "bucket" is literal text
 * that happens to be brace-wrapped, not a variable. Counting it made this
 * check fire on a correct string.
 */
function placeholders(message: string): Set<string> {
  const optionBodies = new Set(
    [...message.matchAll(/(?:=\d+|zero|one|two|few|many|other)\s*\{\s*([a-zA-Z0-9_]+)\s*\}/g)].map(
      (m) => m[1],
    ),
  );
  const names = [...message.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*[,}]/g)].map((m) => m[1]);
  return new Set(names.filter((n) => !optionBodies.has(n)));
}

function get(messages: Messages, keyPath: string): string | Messages | undefined {
  return keyPath.split(".").reduce<string | Messages | undefined>((node, part) => {
    if (node === undefined || typeof node === "string") return undefined;
    return node[part];
  }, messages);
}

const en = load("en");
const km = load("km");

describe("message catalogue parity", () => {
  it("every English key exists in Khmer", () => {
    const missing = leaves(en).filter((k) => typeof get(km, k) !== "string");
    expect(missing).toEqual([]);
  });

  it("every Khmer key exists in English", () => {
    // The reverse direction matters too: a Khmer-only key is a string nobody
    // can see in English, and usually means a namespace was copied rather than
    // translated. `reader.bookCard` was exactly that.
    const extra = leaves(km).filter((k) => typeof get(en, k) !== "string");
    expect(extra).toEqual([]);
  });

  it("the two catalogues have the same shape, not just the same leaves", () => {
    // A key that is a string in one locale and an object in the other renders
    // "[object Object]" rather than failing loudly.
    const a = shape(en);
    const b = shape(km);
    const mismatched = [...a].filter(([k, kind]) => b.has(k) && b.get(k) !== kind).map(([k]) => k);
    expect(mismatched).toEqual([]);
  });

  it("no message is left as an untranslated placeholder", () => {
    const offenders = leaves(km).filter((k) => {
      const value = get(km, k);
      return typeof value === "string" && /^\s*(TODO|TBD|FIXME|\?\?\?)\b/i.test(value);
    });
    expect(offenders).toEqual([]);
  });

  it("no message in either catalogue is empty", () => {
    for (const [locale, messages] of [["en", en], ["km", km]] as const) {
      const empty = leaves(messages).filter((k) => (get(messages, k) as string).trim() === "");
      expect(empty, locale).toEqual([]);
    }
  });

  it("no Khmer message references a value English does not", () => {
    // The check is DIRECTIONAL, and the direction is the whole point.
    //
    // Call sites pass one set of values for both locales. A placeholder that
    // exists only in Khmer therefore names something nobody supplies, and
    // next-intl renders the failure into the page.
    //
    // The reverse is legitimate and common here: Khmer has no grammatical
    // plural, so an English `{count, plural, one {copy} other {copies}}` is
    // correctly translated as one invariant noun. Asserting symmetry would
    // flag every such string and train people to ignore this test.
    const orphaned: string[] = [];
    for (const key of leaves(km)) {
      const kmValue = get(km, key);
      const enValue = get(en, key);
      if (typeof kmValue !== "string" || typeof enValue !== "string") continue;
      const enNames = placeholders(enValue);
      const extra = [...placeholders(kmValue)].filter((n) => !enNames.has(n));
      if (extra.length > 0) orphaned.push(`${key}: km references ${extra.join(", ")}`);
    }
    expect(orphaned).toEqual([]);
  });
});
