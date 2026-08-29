import { describe, it, expect } from "vitest";
import { verifyBearer } from "./bearer";

describe("verifyBearer", () => {
  const secret = "s3cr3t-token-value";

  it("accepts the exact matching bearer token", () => {
    expect(verifyBearer(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("rejects a wrong token of the same length", () => {
    const wrong = "x".repeat(secret.length);
    expect(verifyBearer(`Bearer ${wrong}`, secret)).toBe(false);
  });

  it("rejects a token of a different length", () => {
    expect(verifyBearer(`Bearer ${secret}extra`, secret)).toBe(false);
  });

  it("fails closed when the secret is unset or empty", () => {
    expect(verifyBearer(`Bearer ${secret}`, undefined)).toBe(false);
    expect(verifyBearer(`Bearer ${secret}`, "")).toBe(false);
    expect(verifyBearer(`Bearer ${secret}`, null)).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifyBearer(null, secret)).toBe(false);
    expect(verifyBearer(undefined, secret)).toBe(false);
    expect(verifyBearer(secret, secret)).toBe(false); // no "Bearer " prefix
    expect(verifyBearer(`bearer ${secret}`, secret)).toBe(false); // case-sensitive scheme
  });
});
