import { describe, it, expect } from "vitest";
import { resolveDownloadPolicy, type ResolveInput } from "@/lib/theses/download-permission";
import { resolveThesisAccess, type ThesisAccessState } from "@/lib/theses/access";

// The projection is exercised THROUGH the real engine, never against a
// hand-written decision: the point of this module is that it cannot hold a
// rule of its own, so the only honest test is "engine in, access out".
function access(overrides: Partial<ResolveInput>) {
  const input: ResolveInput = {
    isPublished: true,
    hasFile: true,
    override: "inherit",
    rank: 50,
    authenticated: true,
    profileComplete: true,
    ...overrides,
  };
  return resolveThesisAccess({
    decision: resolveDownloadPolicy(input),
    hasFile: input.hasFile,
    authenticated: input.authenticated,
  });
}

describe("resolveThesisAccess — the reader's matrix", () => {
  const cases: Array<{
    name: string;
    input: Partial<ResolveInput>;
    state: ThesisAccessState;
    canRead: boolean;
    canDownload: boolean;
  }> = [
    { name: "signed in, profile complete → read + download", input: {}, state: "open", canRead: true, canDownload: true },
    { name: "signed in, profile incomplete → read only", input: { profileComplete: false }, state: "profile_incomplete", canRead: true, canDownload: false },
    { name: "anonymous → sign in", input: { authenticated: false, profileComplete: false }, state: "sign_in", canRead: false, canDownload: false },
    { name: "Top-10 → protected, even signed in with a complete profile", input: { rank: 3 }, state: "protected", canRead: false, canDownload: false },
    { name: "Top-10 + anonymous → protected, never a sign-in that would fail", input: { rank: 3, authenticated: false, profileComplete: false }, state: "protected", canRead: false, canDownload: false },
    { name: "admin block → protected", input: { override: "block" }, state: "protected", canRead: false, canDownload: false },
    { name: "admin allow lifts Top-10", input: { rank: 2, override: "allow" }, state: "open", canRead: true, canDownload: true },
    { name: "no file → no_file, whoever asks", input: { hasFile: false }, state: "no_file", canRead: false, canDownload: false },
    { name: "no file + anonymous → no_file, not a sign-in to nothing", input: { hasFile: false, authenticated: false, profileComplete: false }, state: "no_file", canRead: false, canDownload: false },
    { name: "no file + admin block → no_file (nothing to protect)", input: { hasFile: false, override: "block" }, state: "no_file", canRead: false, canDownload: false },
    { name: "unpublished → unavailable", input: { isPublished: false }, state: "unavailable", canRead: false, canDownload: false },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const a = access(c.input);
      expect(a.state).toBe(c.state);
      expect(a.canRead).toBe(c.canRead);
      expect(a.canDownload).toBe(c.canDownload);
    });
  }

  it("names why a record is protected", () => {
    expect(access({ rank: 1 }).blockedBy).toBe("top_ten");
    expect(access({ override: "block" }).blockedBy).toBe("admin");
    expect(access({}).blockedBy).toBeNull();
  });

  it("carries the engine's rank through unchanged", () => {
    expect(access({ rank: 7 }).rank).toBe(7);
    expect(access({ rank: null }).rank).toBeNull();
  });
});

describe("resolveThesisAccess — agrees with both routes", () => {
  // Every combination of the engine's inputs. For each, the projection must
  // make exactly the decisions the two file-serving routes make:
  //   /file      serves inline to a signed-in reader unless unpublished,
  //              fileless or policy-blocked (profile is not required)
  //   /download  serves only when the engine says `allowed`
  const bools = [true, false];
  const overrides = ["inherit", "allow", "block"] as const;
  const ranks = [null, 1, 10, 11];

  for (const isPublished of bools)
    for (const hasFile of bools)
      for (const authenticated of bools)
        for (const profileComplete of bools)
          for (const override of overrides)
            for (const rank of ranks) {
              const input: ResolveInput = { isPublished, hasFile, authenticated, profileComplete, override, rank };
              const name = JSON.stringify(input);
              it(name, () => {
                const decision = resolveDownloadPolicy(input);
                const a = resolveThesisAccess({ decision, hasFile, authenticated });

                const fileRouteServes =
                  authenticated &&
                  decision.reason !== "THESIS_UNPUBLISHED" &&
                  hasFile &&
                  decision.effectivePolicy !== "blocked";
                expect(a.canRead).toBe(fileRouteServes);
                expect(a.canDownload).toBe(decision.allowed);
                // Nothing the reader can do is ever offered on a closed state.
                if (a.state !== "open" && a.state !== "profile_incomplete") {
                  expect(a.canRead || a.canDownload).toBe(false);
                }
              });
            }
});
