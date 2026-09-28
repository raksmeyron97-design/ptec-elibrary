import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SEARCH_LEG_BUDGET_MS, withinBudget } from "./budgets";

const route = () => readFileSync(join(process.cwd(), "app/api/search/native/route.ts"), "utf8");

describe("a search leg inside its budget", () => {
  it("passes an answer through", async () => {
    expect(await withinBudget(Promise.resolve(3), 1_000, 0)).toEqual({ value: 3, failed: false });
  });

  it("reports a throw as FAILED, never as a rejected search", async () => {
    expect(await withinBudget(Promise.reject(new Error("db down")), 1_000, [] as number[])).toEqual({ value: [], failed: true });
  });

  it("reports a leg that runs out of time as FAILED, and stops waiting for it", async () => {
    const t0 = Date.now();
    const hung = new Promise<number>((resolve) => setTimeout(() => resolve(1), 5_000));
    expect(await withinBudget(hung, 30, 0)).toEqual({ value: 0, failed: true });
    expect(Date.now() - t0).toBeLessThan(1_000);
  });

  it("reports an answer its caller recognises as an error — an empty list is not a result", async () => {
    const errored = Promise.resolve({ rows: [] as string[], failed: true });
    expect(await withinBudget(errored, 1_000, { rows: [], failed: true }, (v) => v.failed)).toEqual({
      value: { rows: [], failed: true },
      failed: true,
    });
  });

  it("does not leak an unhandled rejection from a leg that lost the race", async () => {
    let unhandled = 0;
    const onUnhandled = () => { unhandled++; };
    process.on("unhandledRejection", onUnhandled);
    const late = new Promise<number>((_, reject) => setTimeout(() => reject(new Error("late")), 20));
    await withinBudget(late, 5, 0);
    await new Promise((r) => setTimeout(r, 50));
    process.off("unhandledRejection", onUnhandled);
    expect(unhandled).toBe(0);
  });

  it("has a budget for every leg, and none so short it would cut a normal answer", () => {
    for (const ms of Object.values(SEARCH_LEG_BUDGET_MS)) expect(ms).toBeGreaterThanOrEqual(1_000);
  });
});

describe("the native route keeps its legs inside budgets", () => {
  it("runs no leg outside withinBudget, and no Promise.all over bare legs", () => {
    const src = route();
    // Every ranked leg and the page-text leg go through the budgeted runner.
    for (const leg of ["book", "research", "publication", "catalog", "learning_path", "post", "pagehits", "semantic", "seeds"]) {
      expect(src).toMatch(new RegExp(`leg\\("${leg}"`));
    }
    expect(src).not.toMatch(/Promise\.all\(\[\s*run\.book\(\)/);
  });

  it("never caches, or logs as a zero-result query, an answer that is partial", () => {
    const src = route();
    expect(src).toMatch(/if \(!partial\.length\) cacheSet\(/);
    expect(src).toMatch(/"Cache-Control": partial\.length \? "no-store"/);
  });

  it("reports a leg's database error as a failure, not as an empty result", () => {
    // Every leg's error branch returns the failed marker.
    expect(route()).not.toMatch(/console\.error\("\[native-search\/(books|research|publications|catalog|posts|learning_paths)\]", error\.message\);\s*return \{ data: \[\], count: 0, allCandidates: \[\] \};/);
  });
});
