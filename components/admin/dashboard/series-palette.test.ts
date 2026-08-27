import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { DASHBOARD_METRICS } from "@/lib/admin/dashboard-shared";
import { METRIC_CHART_STYLE } from "./analytics/chart-tokens";

/**
 * The dashboard has ONE categorical palette, and it lives in CSS.
 *
 * Before this, four surfaces each owned their own copy of "the metric
 * colours": the KPI icon tiles and top strips (admin.css), the sparklines
 * (SparkLine.tsx), the legacy chart (SERIES_COLOR), and the V2 chart tokens —
 * and they disagreed. Selecting the cyan "Unique visitors" card charted a navy
 * line; opening the amber "Downloads" drawer drew a navy trend inside it. The
 * fix is structural, not cosmetic: a component may never name a metric colour,
 * only reference the token.
 *
 * That also protects the property the palette was chosen for. The four hues
 * are validated together (lightness band, chroma floor, protan/deutan ΔE
 * under all pairs, ≥3:1 on white); a fifth hex pasted into a component is
 * outside that validation by construction. The previous set had #1E3A8A and
 * #7C3AED sitting next to each other at ΔE 0.4 under deuteranopia — the same
 * colour, for ~5% of male readers.
 */

const ROOT = path.resolve(__dirname, "..", "..", "..");
const ADMIN_CSS = readFileSync(path.join(ROOT, "app", "admin.css"), "utf8");
const DIRS = [
  "components/admin/dashboard",
  "components/admin/dashboard/analytics",
  "components/admin/dashboard/views",
];

const SERIES_TOKENS = [
  "--ptec-series-views",
  "--ptec-series-visitors",
  "--ptec-series-reader",
  "--ptec-series-downloads",
];

/** Blank out comment bodies so prose *about* a retired hex is not a violation. */
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

describe("dashboard series palette", () => {
  it("declares every series token, with an AA-on-white ink step for text use", () => {
    for (const token of SERIES_TOKENS) {
      expect(ADMIN_CSS, `${token} must be declared in app/admin.css`).toContain(`${token}:`);
      expect(ADMIN_CSS, `${token}-ink must be declared in app/admin.css`).toContain(`${token}-ink:`);
    }
  });

  it("gives every metric its own token, its own dash and its own marker", () => {
    const strokes = new Set<string>();
    for (const metric of DASHBOARD_METRICS) {
      const style = METRIC_CHART_STYLE[metric];
      const token = /^var\((--[a-z-]+)\)$/.exec(style.stroke)?.[1];
      expect(token, `${metric} stroke must be a bare CSS variable`).toBeTruthy();
      expect(SERIES_TOKENS).toContain(token!);
      strokes.add(style.stroke);
    }
    // Colour is never the only channel — dash + marker must also be unique, so
    // the chart survives greyscale print and severe colour-vision deficiency.
    expect(strokes.size).toBe(DASHBOARD_METRICS.length);
    expect(
      new Set(DASHBOARD_METRICS.map((m) => `${METRIC_CHART_STYLE[m].marker}:${METRIC_CHART_STYLE[m].dash ?? "solid"}`)).size,
    ).toBe(DASHBOARD_METRICS.length);
  });

  it("keeps literal colours out of every dashboard component", () => {
    const offenders = sourceFiles().flatMap((file) => {
      const source = stripComments(readFileSync(path.join(ROOT, file), "utf8"));
      return [...source.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => `${file}: ${match[0]}`);
    });
    expect(offenders, "colour belongs in a token, not in a component").toEqual([]);
  });
});
