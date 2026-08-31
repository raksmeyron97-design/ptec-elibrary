import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * The dashboard has ONE type scale and ONE status palette, and both live in
 * `app/admin.css`.
 *
 * `series-palette.test.ts` already forbids a literal hex in these files, which
 * is why the drift went somewhere a hex scan could not see: Tailwind palette
 * CLASSES. `bg-emerald-50 text-emerald-800 ring-emerald-200` is not a hex, so
 * 175 of them accumulated across six independent status maps — HealthCard said
 * `emerald-50/800`, SystemView said `emerald-100/800`, AutomatedInsightsPanel
 * said `--ptec-success`. Three greens for "OK" were visible on one screen.
 *
 * The same happened to type: 19 distinct pixel sizes, nine of them between 9px
 * and 13px. 10.5 vs 11 vs 11.5 vs 12 vs 12.5 are not perceptible as steps, so
 * they bought no hierarchy — they just made the page look unsettled, and left
 * two labels below the legible floor.
 *
 * Both rules are enforced here by scanning the source, because both are
 * invisible to a type-check and to a passing render test. When one fails, the
 * fix is in the file it names, not in this test.
 */

const ROOT = path.resolve(__dirname, "..", "..", "..");
const DIRS = [
  "components/admin/dashboard",
  "components/admin/dashboard/analytics",
  "components/admin/dashboard/views",
];

/** Blank out comment bodies so prose *about* a retired value is not a violation. */
function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => " ".repeat(m.length))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead: string) => lead + " ".repeat(m.length - lead.length));
}

function sourceFiles(): string[] {
  return DIRS.flatMap((dir) =>
    readdirSync(path.join(ROOT, dir))
      .filter((file) => /\.tsx?$/.test(file) && !file.includes(".test."))
      .map((file) => path.join(dir, file)),
  );
}

function read(file: string): string {
  return stripComments(readFileSync(path.join(ROOT, file), "utf8"));
}

describe("dashboard design system", () => {
  /**
   * The closed type scale. Six text steps and three numeral steps — hierarchy
   * comes from weight and colour, which cost nothing, rather than from
   * half-pixel size differences nobody can see.
   *
   * 11px is the floor and there are no exceptions: the retired 9px and 9.5px
   * labels were below the legible minimum for Latin and hopeless for Khmer,
   * whose diacritics need the height.
   */
  const TYPE_SCALE = new Set(["11", "12", "13", "14", "16", "20", "28", "40"]);

  it("sets type only from the closed scale", () => {
    const offenders = sourceFiles().flatMap((file) =>
      [...read(file).matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)]
        .filter((m) => !TYPE_SCALE.has(m[1]))
        .map((m) => `${file}: ${m[0]}`),
    );
    expect(
      offenders,
      `off-scale type size. Allowed: ${[...TYPE_SCALE].join("/")}px — see the ` +
        "--dash-t-* tokens in app/admin.css",
    ).toEqual([]);
  });

  /**
   * Raw Tailwind palette weights. Status belongs to `.dash-status--*`
   * (which resolves the --ptec-{success,warning,danger,info} tokens); neutrals
   * belong to the --dash-ink and --dash-line ramps, which are AA-checked.
   *
   * `brand` is absent on purpose — `bg-brand`, `text-brand` and `border-brand`
   * are project semantic tokens, not palette weights, and carry no numeric
   * suffix to match here anyway.
   */
  const PALETTE = /\b(?:bg|text|border|ring|from|via|to|fill|stroke|decoration|outline|shadow|accent|divide)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;

  it("takes every status and neutral colour from a token, not a palette weight", () => {
    const offenders = sourceFiles().flatMap((file) =>
      [...read(file).matchAll(PALETTE)].map((m) => `${file}: ${m[0]}`),
    );
    expect(
      offenders,
      "status colour belongs to .dash-status--{ok,warn,crit,info,neutral} and " +
        "neutrals to the --dash-ink-*/--dash-line-* ramp (app/admin.css)",
    ).toEqual([]);
  });

  it("declares the scale and the status layer in app/admin.css", () => {
    const css = readFileSync(path.join(ROOT, "app", "admin.css"), "utf8");
    for (const token of ["--dash-t-xs", "--dash-t-sm", "--dash-t-md", "--dash-t-lg", "--dash-t-num"]) {
      expect(css, `${token} must be declared`).toContain(`${token}:`);
    }
    for (const cls of ["--ok", "--warn", "--crit", "--info", "--neutral"]) {
      expect(css, `.dash-status${cls} must be declared`).toContain(`.dash-status${cls}`);
    }
    // The four status marks must be the AA-safe steps, not palette 500-weights:
    // a dot is a non-text mark and needs 3:1 against white. `bg-amber-500` was
    // 2.15:1 — the "degraded" dot was the least visible thing on the page.
    for (const mark of ["--ptec-success", "--ptec-warning", "--ptec-danger", "--ptec-info"]) {
      expect(css, `--dash-status-mark must resolve ${mark}`).toContain(`--dash-status-mark: var(${mark})`);
    }
  });

  /**
   * Khmer-safe truncation. `app/admin.css` documents why Tailwind's `truncate`
   * cannot be used on text that may be Khmer: it is `overflow: hidden` with a
   * clip box exactly one line-height tall, and Khmer stacks diacritics above
   * and below the base glyph, so the marks are shaved rather than the string
   * being ellipsised. The admin panel renders lang="en" while its DATA — book,
   * thesis and post titles, search terms — is routinely Khmer, so no language
   * selector ever reaches these elements.
   */
  it("never truncates with the Khmer-unsafe utility", () => {
    const offenders = sourceFiles().flatMap((file) =>
      read(file)
        .split("\n")
        .flatMap((line, i) =>
          /(?:^|["'\s])truncate(?:["'\s]|$)/.test(line) ? [`${file}:${i + 1}`] : [],
        ),
    );
    expect(
      offenders,
      "use .dash-truncate (body) or .dash-truncate-head (headings) — Tailwind's " +
        "`truncate` vertically clips Khmer diacritics",
    ).toEqual([]);
  });
});
