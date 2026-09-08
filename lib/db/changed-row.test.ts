import { describe, it, expect } from "vitest";
import { changedRow, NO_MATCH_MESSAGE } from "./changed-row";

describe("changedRow", () => {
  it("reports the row a mutation changed", () => {
    expect(changedRow({ data: [{ id: "a" }], error: null })).toEqual({ ok: true, row: { id: "a" } });
  });

  it("accepts a .single() shaped result", () => {
    expect(changedRow({ data: { id: "a" }, error: null })).toEqual({ ok: true, row: { id: "a" } });
  });

  it("reports a database error as an error, not as a no-match", () => {
    expect(changedRow({ data: null, error: { message: "boom" } })).toEqual({
      ok: false, reason: "error", message: "boom",
    });
  });

  // The defect this module exists for: PostgREST answers a predicate that
  // matched nothing with error:null/data:null, which is indistinguishable
  // from success until `.select()` is asked for.
  it("reports an empty result as no_match rather than success", () => {
    expect(changedRow({ data: [], error: null })).toEqual({ ok: false, reason: "no_match" });
  });

  it("treats a missing .select() (data:null, no error) as no_match, never success", () => {
    expect(changedRow({ data: null, error: null })).toEqual({ ok: false, reason: "no_match" });
  });

  it("does not blame the reader for a cause the row count cannot identify", () => {
    // "not yours" and "already gone" are one message on purpose.
    expect(NO_MATCH_MESSAGE).toMatch(/no longer exists|not yours/);
  });
});
