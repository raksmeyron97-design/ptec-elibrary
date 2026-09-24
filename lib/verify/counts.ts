// lib/verify/counts.ts
//
// Reading a number a page PRINTS, out of its HTML.
//
// PURE, and separate from the verifiers that use it, because getting this
// wrong does not make a check fail — it makes the check vacuous, which reads
// exactly like a pass.
//
// ── The trap ────────────────────────────────────────────────────────────────
//
// The obvious pattern for "256 items" is /(\d+)\s+items?\b/. A word boundary
// matches between "s" and "-", so that pattern also matches Tailwind's
//
//   class="… shrink-0 items-center …"
//
// as the number 0. Measured against production on 2026-09-23: every one of the
// homepage's seven subject tiles parsed as "0 items", the parity verifier
// reported "7 values, sum 0", and its clipped-read check passed on a number
// that came out of a CSS class name.
//
// This repository has met the same trap before, in robots.txt (`Disallow:
// /auth` matching /authors) and in its own crawl policy. The rule that came
// out of it: never assert on \b — assert on what may actually follow the
// token.

/** What a count is counting, as it is printed: "items", "works", "e-books". */
export type CountNoun = string;

/**
 * The number printed immediately before `noun` in `html`, or null.
 *
 * The noun may be singular or plural ("1 work" / "12 works"), may carry an
 * internal hyphen ("e-books"), and may be written with thousands separators.
 * What it may NOT be followed by is another word character or a hyphen —
 * that is a longer token that happens to start with the same letters.
 */
export function printedCount(html: string, noun: CountNoun): number | null {
  const stem = noun.replace(/s$/, "");
  const pattern = new RegExp(
    String.raw`(\d[\d,]*)\s+${escape(stem)}s?(?![-\w])`,
    "i",
  );
  const m = html.match(pattern);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/** "24 of 1956 e-books" → 24. Null when the page prints no such phrase. */
export function printedOfCount(html: string, noun: CountNoun): number | null {
  const stem = noun.replace(/s$/, "");
  const pattern = new RegExp(
    String.raw`(\d[\d,]*)\s+of\s+(\d[\d,]*)\s+${escape(stem)}s?(?![-\w])`,
    "i",
  );
  const m = html.match(pattern);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/** The TOTAL of "24 of 1956 e-books" → 1956. */
export function printedOfTotal(html: string, noun: CountNoun): number | null {
  const stem = noun.replace(/s$/, "");
  const pattern = new RegExp(
    String.raw`(\d[\d,]*)\s+of\s+(\d[\d,]*)\s+${escape(stem)}s?(?![-\w])`,
    "i",
  );
  const m = html.match(pattern);
  return m ? Number(m[2].replace(/,/g, "")) : null;
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
