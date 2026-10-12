// WI-4 (SEO audit 2026-10): the homepage links the subject hubs themselves.
// The list must come from the sitemap's own predicate, so a thin hub is
// never linked as a destination and a graduating hub appears with no edit.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const HOME = "app/[locale]/(public)/(home)/page.tsx";
const BAND = "components/ui/home/SubjectHubLinks.tsx";

export function bandViolations(rawBand: string, rawHome: string): string[] {
  const band = strip(rawBand);
  const home = strip(rawHome);
  const out: string[] = [];
  if (!/<SubjectHubLinks\b/.test(home)) out.push("the homepage does not render SubjectHubLinks");
  if (!/\bgetIndexableSubjects\(\)/.test(band)) out.push("the band does not read getIndexableSubjects()");
  if (/\b(getSubjectIndex|getBrowsableSubjects|getSubjectsWithResources)\(/.test(band)) {
    out.push("the band reads a looser subject list than the sitemap's");
  }
  if (/href=["'`]\/subjects\/[^$"'`{]/.test(band)) out.push("the band hard-codes a hub URL");
  if (!/\bsubjectLabel\(/.test(band)) out.push("hub labels bypass the hub-title rule");
  return out;
}

describe("homepage → subject hubs (WI-4)", () => {
  it("renders the band from the indexable-subject predicate", () => {
    expect(bandViolations(read(BAND), read(HOME))).toEqual([]);
  });

  it("negative control: a hand-made list is caught", () => {
    const broken = read(BAND).replace("getIndexableSubjects()", "getSubjectIndex()");
    expect(bandViolations(broken, read(HOME))).toEqual(
      expect.arrayContaining(["the band does not read getIndexableSubjects()"]),
    );
  });

  it("negative control: a hard-coded hub link is caught", () => {
    const broken = `${read(BAND)}\n<Link href="/subjects/គណិតវិទ្យា">x</Link>`;
    expect(bandViolations(broken, read(HOME))).toContain("the band hard-codes a hub URL");
  });

  it("negative control: dropping the band from the homepage is caught", () => {
    const broken = read(HOME).replace(/<SubjectHubLinks[^>]*\/>/, "");
    expect(bandViolations(read(BAND), broken)).toContain("the homepage does not render SubjectHubLinks");
  });
});
