import { describe, expect, it } from "vitest";
import { TEMPLATED_CLUSTER_MIN, withheldByDescriptionGate } from "./description-gate";

const base = { hasFile: false, templateClusterSize: 1, descriptionEmpty: false, descriptionStatus: "none" };

describe("withheldByDescriptionGate", () => {
  it("does nothing while the gate is off", () => {
    expect(withheldByDescriptionGate({ ...base, descriptionEmpty: true }, false)).toBe(false);
  });
  it("withholds a record with no file and an empty or templated description", () => {
    expect(withheldByDescriptionGate({ ...base, descriptionEmpty: true }, true)).toBe(true);
    expect(withheldByDescriptionGate({ ...base, templateClusterSize: TEMPLATED_CLUSTER_MIN }, true)).toBe(true);
  });
  it("never withholds a record with a file, an approved description, or text of its own", () => {
    expect(withheldByDescriptionGate({ ...base, hasFile: true, descriptionEmpty: true }, true)).toBe(false);
    expect(withheldByDescriptionGate({ ...base, descriptionEmpty: true, descriptionStatus: "approved" }, true)).toBe(false);
    expect(withheldByDescriptionGate({ ...base, templateClusterSize: TEMPLATED_CLUSTER_MIN - 1 }, true)).toBe(false);
  });
});
