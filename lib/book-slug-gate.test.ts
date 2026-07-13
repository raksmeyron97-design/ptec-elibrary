import { describe, it, expect } from "vitest";
import { resolveBookGate } from "./book-slug-gate";

describe("resolveBookGate", () => {
  const live = new Set(["how-to-write-a-better-thesis", "pisa-d"]);

  it("passes through a live slug", () => {
    expect(resolveBookGate("pisa-d", live, new Map())).toEqual({ kind: "ok" });
  });

  it("301s a retired slug to its canonical target", () => {
    const redirects = new Map([["how-to-write-a-better-thesis-1", "how-to-write-a-better-thesis"]]);
    expect(resolveBookGate("how-to-write-a-better-thesis-1", live, redirects)).toEqual({
      kind: "redirect",
      slug: "how-to-write-a-better-thesis",
    });
  });

  it("404s an unknown slug", () => {
    expect(resolveBookGate("does-not-exist", live, new Map())).toEqual({ kind: "not-found" });
  });

  it("never redirects to itself (loop guard)", () => {
    const redirects = new Map([["pisa-d", "pisa-d"]]);
    expect(resolveBookGate("pisa-d", live, redirects)).toEqual({ kind: "ok" });
  });

  it("does not redirect to a dead target (chain/broken guard)", () => {
    const redirects = new Map([["old", "also-retired"]]);
    // "also-retired" isn't in the live set → fall through to 404, never a
    // redirect onto a non-existent page.
    expect(resolveBookGate("old", live, redirects)).toEqual({ kind: "not-found" });
  });
});
