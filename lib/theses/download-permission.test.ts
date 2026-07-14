import { describe, it, expect } from "vitest";
import { resolveDownloadPolicy, type ResolveInput } from "@/lib/theses/download-permission";

function base(overrides: Partial<ResolveInput>): ResolveInput {
  return {
    isPublished: true,
    hasFile: true,
    override: "inherit",
    rank: 50,
    authenticated: true,
    profileComplete: true,
    ...overrides,
  };
}

describe("resolveDownloadPolicy — business-rule matrix", () => {
  const cases: Array<{
    name: string;
    input: Partial<ResolveInput>;
    allowed: boolean;
    reason: string;
  }> = [
    { name: "rank #1 inherit → blocked (Top 10)", input: { rank: 1 }, allowed: false, reason: "TOP_TEN_RESTRICTED" },
    { name: "rank #10 inherit → blocked (Top 10)", input: { rank: 10 }, allowed: false, reason: "TOP_TEN_RESTRICTED" },
    { name: "rank #11 inherit complete → allowed", input: { rank: 11 }, allowed: true, reason: "ALLOWED" },
    { name: "rank #20 inherit complete → allowed", input: { rank: 20 }, allowed: true, reason: "ALLOWED" },
    { name: "rank #3 admin allow complete → allowed", input: { rank: 3, override: "allow" }, allowed: true, reason: "ALLOWED" },
    { name: "rank #15 admin block → blocked", input: { rank: 15, override: "block" }, allowed: false, reason: "ADMIN_BLOCKED" },
    { name: "rank #11 unauth → require login", input: { rank: 11, authenticated: false, profileComplete: false }, allowed: false, reason: "AUTHENTICATION_REQUIRED" },
    { name: "rank #11 incomplete → require profile", input: { rank: 11, profileComplete: false }, allowed: false, reason: "PROFILE_INCOMPLETE" },
    { name: "rank #3 allow incomplete → require profile", input: { rank: 3, override: "allow", profileComplete: false }, allowed: false, reason: "PROFILE_INCOMPLETE" },
    { name: "block override + unauth → blocked safely", input: { rank: 50, override: "block", authenticated: false, profileComplete: false }, allowed: false, reason: "ADMIN_BLOCKED" },
    { name: "unpublished → blocked regardless", input: { rank: 50, isPublished: false }, allowed: false, reason: "THESIS_UNPUBLISHED" },
    { name: "allowed policy but file missing → file unavailable", input: { rank: 50, hasFile: false }, allowed: false, reason: "FILE_UNAVAILABLE" },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const d = resolveDownloadPolicy(base(c.input));
      expect(d.allowed).toBe(c.allowed);
      expect(d.reason).toBe(c.reason);
    });
  }

  it("admin allow overrides the automatic Top-10 block", () => {
    const d = resolveDownloadPolicy(base({ rank: 2, override: "allow" }));
    expect(d.allowed).toBe(true);
    expect(d.effectivePolicy).toBe("allowed");
    expect(d.policySource).toBe("admin-override");
  });

  it("admin block overrides an otherwise-allowed thesis (#11+)", () => {
    const d = resolveDownloadPolicy(base({ rank: 40, override: "block" }));
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe("ADMIN_BLOCKED");
    expect(d.policySource).toBe("admin-override");
  });

  it("policy block is revealed before per-user gates (anon sees TOP_TEN, not login)", () => {
    const d = resolveDownloadPolicy(base({ rank: 1, authenticated: false, profileComplete: false }));
    expect(d.reason).toBe("TOP_TEN_RESTRICTED");
  });

  it("small library: unranked null rank behaves as not-top-ten (allowed after gates)", () => {
    const d = resolveDownloadPolicy(base({ rank: null }));
    expect(d.isTopTen).toBe(false);
    expect(d.allowed).toBe(true);
  });

  it("exposes rank + isTopTen in the decision", () => {
    expect(resolveDownloadPolicy(base({ rank: 4 })).isTopTen).toBe(true);
    expect(resolveDownloadPolicy(base({ rank: 11 })).isTopTen).toBe(false);
  });
});
