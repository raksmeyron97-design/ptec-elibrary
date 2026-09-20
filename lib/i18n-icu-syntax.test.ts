import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import km from "@/messages/km.json";

/**
 * Every message must PARSE as ICU, because next-intl's failure mode is to
 * render the key.
 *
 * `<slug>` in prose is not prose. next-intl parses messages as ICU, where
 * `<name>` opens a rich-text tag, so a message documenting a URL shape —
 * "One URL segment: /journals/<slug>." — throws `INVALID_MESSAGE:
 * UNCLOSED_TAG` and the field hint renders as the literal string
 * `adminJournals.fieldSlugHint` to the librarian. Three keys shipped that way
 * (`adminJournals.fieldSlugHint`, `adminJournals.fieldPublishedHint`,
 * `adminUpload.bulk.folderFallback`), in both locales, and the last of them
 * only renders inside a plural branch — which is exactly why this is a
 * catalogue-wide scan and not a test of the three pages that happened to show
 * it. The convention that replaced them is `[slug]` / `[id]`, which is also
 * how this repo writes route parameters everywhere else.
 *
 * A tag is legitimate when the code supplies a handler for it via `t.rich`, so
 * the rule is BALANCE, not absence: `<command>…</command>` is fine,
 * `<command>` alone is not.
 */
function flattenEntries(value: unknown, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") return [[prefix, value]];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenEntries(child, prefix ? `${prefix}.${key}` : key),
  );
}

/** `<name>` / `</name>`, the two forms ICU treats as a rich-text tag. */
const TAG = /<\/?([A-Za-z][A-Za-z0-9_-]*)>/g;

/** Tag names that are opened without being closed, or closed without opening. */
function unbalancedTags(message: string): string[] {
  const open = new Map<string, number>();
  const bad = new Set<string>();
  for (const match of message.matchAll(TAG)) {
    const [token, name] = match;
    if (token.startsWith("</")) {
      const depth = open.get(name) ?? 0;
      if (depth === 0) bad.add(name);
      else open.set(name, depth - 1);
    } else {
      open.set(name, (open.get(name) ?? 0) + 1);
    }
  }
  for (const [name, depth] of open) if (depth > 0) bad.add(name);
  return [...bad];
}

const CATALOGUES: Array<[string, unknown]> = [
  ["messages/en.json", en],
  ["messages/km.json", km],
];

describe("ICU message syntax", () => {
  it.each(CATALOGUES)("leaves no unbalanced rich-text tag in %s", (_name, catalogue) => {
    const offenders = flattenEntries(catalogue)
      .map(([key, message]) => [key, unbalancedTags(message)] as const)
      .filter(([, tags]) => tags.length > 0)
      .map(([key, tags]) => `${key}: ${tags.map((t) => `<${t}>`).join(", ")}`);

    expect(
      offenders,
      "next-intl parses <name> as a rich-text tag — an unclosed one throws " +
        "INVALID_MESSAGE and renders the key to the user. Write [name] for a " +
        "placeholder, or close the tag and supply a handler via t.rich().",
    ).toEqual([]);
  });

  it("detects the exact strings that shipped broken", () => {
    // Negative control: the scan must fail on the real defect, or a green run
    // proves nothing. These are the pre-fix values, verbatim.
    expect(unbalancedTags("One URL segment: /journals/<slug>. Changing it breaks existing links."))
      .toEqual(["slug"]);
    expect(unbalancedTags("its storage folder is named book-<id>.")).toEqual(["id"]);
    // ...and must stay silent on a properly closed tag and on ICU arguments.
    expect(unbalancedTags("run <command>npx tsx scripts/embed-library.ts</command> to close it"))
      .toEqual([]);
    expect(unbalancedTags("One URL segment: /journals/[slug].")).toEqual([]);
    expect(unbalancedTags("{count, plural, one {# title} other {# titles}}")).toEqual([]);
  });
});
