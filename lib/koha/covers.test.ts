/**
 * Covers from Koha — the pure rules (covers.ts). The Koha answers used here
 * are the shapes measured on PTEC's Koha 26.05.03 (2026-10-03).
 */
import { describe, it, expect } from "vitest";
import {
  decideCoverAnswer, isKohaCoverPath, kohaCoverConfig, kohaCoverImageUrl, kohaCoverPath, kohaCoverReportUrl,
  parseCoverImageId, parseKohaCoverReport, planKohaCovers, type CoverRow,
} from "./covers";

const full = (pairs: [number, number][]) => ({ covers: new Map(pairs), complete: true });

describe("paths", () => {
  it("a Koha cover path is the route plus a positive image number, nothing else", () => {
    expect(kohaCoverPath(12)).toBe("/api/catalog-covers/12");
    expect(isKohaCoverPath("/api/catalog-covers/12")).toBe(true);
    for (const v of ["/api/catalog-covers/0", "/api/catalog-covers/12?x=1", "/api/catalog-covers/", "https://cdn.example/api/catalog-covers/12",
      "catalog-covers/abc.webp", "/api/catalog-covers/12/", null, ""]) expect(isKohaCoverPath(v), String(v)).toBe(false);
  });
  it("image ids are positive integers only", () => {
    expect(parseCoverImageId("7")).toBe(7);
    for (const v of ["0", "-1", "1.5", "07", "1e3", "abc", "", null, "1234567890"]) expect(parseCoverImageId(v), String(v)).toBeNull();
  });
});

describe("configuration", () => {
  it("off unless KOHA_COVERS=on; on needs the report id", () => {
    expect(kohaCoverConfig({}).enabled).toBe(false);
    expect(kohaCoverConfig({ KOHA_COVER_REPORT_ID: "2" }).enabled).toBe(false);
    const missing = kohaCoverConfig({ KOHA_COVERS: "on" });
    expect(missing.enabled).toBe(false);
    expect(missing.problems.join(" ")).toMatch(/KOHA_COVER_REPORT_ID/);
    const on = kohaCoverConfig({ KOHA_COVERS: "on", KOHA_COVER_REPORT_ID: "2", KOHA_OPAC_INTERNAL_URL: "http://10.1.1.146:8480/" });
    expect(on).toMatchObject({ enabled: true, opacUrl: "http://10.1.1.146:8480", reportId: 2 });
    expect(kohaCoverReportUrl(on)).toBe("http://10.1.1.146:8480/cgi-bin/koha/svc/report?id=2&annotated=1");
    expect(kohaCoverImageUrl(on.opacUrl, 9)).toBe("http://10.1.1.146:8480/cgi-bin/koha/opac-image.pl?imagenumber=9");
  });
  it("defaults to next.config's OPAC address and refuses an odd one", () => {
    expect(kohaCoverConfig({ KOHA_COVERS: "on", KOHA_COVER_REPORT_ID: "2" }).opacUrl).toBe("http://10.1.1.146:8480");
    for (const bad of ["ftp://x", "http://u:p@x", "http://x/?q=1", "not a url"]) {
      expect(kohaCoverConfig({ KOHA_COVERS: "on", KOHA_COVER_REPORT_ID: "2", KOHA_OPAC_INTERNAL_URL: bad }).enabled, bad).toBe(false);
    }
  });
});

describe("Koha's cover report", () => {
  it("reads the annotated rows; the record's FIRST image wins; complete when rows reach `total`", () => {
    const l = parseKohaCoverReport([
      { biblionumber: 308, imagenumber: 5, updated: "2026-10-03 19:55:43", total: 2 },
      { biblionumber: "12", imagenumber: "9", updated: "2026-10-03 20:00:00", total: "2" },
    ])!;
    expect([...l.covers]).toEqual([[308, 5], [12, 9]]);
    expect(l.complete).toBe(true);
  });
  it("an empty answer is real (no record has a cover) and complete", () => {
    expect(parseKohaCoverReport([])).toEqual({ covers: new Map(), complete: true });
  });
  it("a list Koha cut short (SvcMaxReportRows) is NOT complete, and one without `total` cannot prove it is", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ biblionumber: i + 1, imagenumber: i + 1, total: 25 }));
    expect(parseKohaCoverReport(rows)!.complete).toBe(false);
    expect(parseKohaCoverReport([{ biblionumber: 1, imagenumber: 1 }])!.complete).toBe(false);
  });
  it("anything else is null — the sync then changes nothing", () => {
    for (const bad of [null, {}, "[]", [[308, 5]], [{ biblionumber: 0, imagenumber: 1 }], [{ biblionumber: 1, imagenumber: "x" }], [null],
      { error: "Report not found" }]) expect(parseKohaCoverReport(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe("the plan", () => {
  const row = (id: string, bid: number | null, cover: string | null): CoverRow => ({ id, koha_biblio_id: bid, cover_url: cover });

  it("sets a Koha cover where the e-Library has none, changes it when Koha's image changes, clears it when Koha has none", () => {
    const plan = planKohaCovers([
      row("a", 1, null), row("b", 2, ""), row("c", 3, "/api/catalog-covers/30"), row("d", 4, "/api/catalog-covers/40"), row("e", 5, "/api/catalog-covers/50"),
    ], full([[1, 10], [2, 20], [3, 31], [5, 50]]));
    expect(plan.changes).toEqual([
      { id: "a", from: null, to: "/api/catalog-covers/10" },
      { id: "b", from: "", to: "/api/catalog-covers/20" },
      { id: "c", from: "/api/catalog-covers/30", to: "/api/catalog-covers/31" },
      { id: "d", from: "/api/catalog-covers/40", to: null },
    ]);
  });

  it("a librarian's own cover always wins, whatever Koha has", () => {
    const own = ["https://storage.ptec/files/catalog-covers/x.webp", "catalog-covers/legacy-key.webp", "https://covers.openlibrary.org/b/id/1-L.jpg"];
    const plan = planKohaCovers(own.map((c, i) => row(String(i), i + 1, c)), full([[1, 10], [2, 20], [3, 30]]));
    expect(plan.changes).toEqual([]);
    expect(plan.ownCoverKept).toBe(3);
  });

  it("an incomplete list may set and change covers but never clears one", () => {
    const plan = planKohaCovers([row("a", 1, null), row("d", 4, "/api/catalog-covers/40")], { covers: new Map([[1, 10]]), complete: false });
    expect(plan.changes).toEqual([{ id: "a", from: null, to: "/api/catalog-covers/10" }]);
    expect(plan.clearsSkipped).toBe(1);
  });

  it("rows that are not Koha records are not the sync's", () => {
    expect(planKohaCovers([row("x", null, null)], full([[1, 10]])).changes).toEqual([]);
  });
});

describe("the image route's answer", () => {
  it("a cover is served with its own type", () => {
    expect(decideCoverAnswer({ status: 200, contentType: "image/png; charset=ISO-8859-1", bytes: 1749 })).toEqual({ kind: "image", contentType: "image/png" });
  });
  it("Koha's 43-byte 1×1 GIF and its 302 to the 404 page both mean: no such cover", () => {
    expect(decideCoverAnswer({ status: 200, contentType: "image/gif; charset=ISO-8859-1", bytes: 43 })).toEqual({ kind: "missing" });
    expect(decideCoverAnswer({ status: 302, contentType: "text/x-perl", bytes: 0 })).toEqual({ kind: "missing" });
  });
  it("anything that is not an image, or a Koha in trouble, is an upstream error (not cached)", () => {
    expect(decideCoverAnswer({ status: 200, contentType: "text/html", bytes: 9000 }).kind).toBe("upstream_error");
    expect(decideCoverAnswer({ status: 200, contentType: "image/svg+xml", bytes: 900 }).kind).toBe("upstream_error");
    expect(decideCoverAnswer({ status: 500, contentType: "text/html", bytes: 900 }).kind).toBe("upstream_error");
    expect(decideCoverAnswer({ status: 200, contentType: "image/png", bytes: 6 * 1024 * 1024 }).kind).toBe("upstream_error");
  });
});
