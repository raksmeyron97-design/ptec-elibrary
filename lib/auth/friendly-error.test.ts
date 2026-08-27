import { describe, expect, it } from "vitest";
import { classifyAuthError } from "./friendly-error";

describe("classifyAuthError", () => {
  it("recognises an existing account", () => {
    expect(classifyAuthError("User already registered")).toBe("errUserExists");
  });

  it("recognises the reserved-domain DB trigger error (migration 0068)", () => {
    expect(classifyAuthError("Database error saving new user")).toBe("errReservedDomain");
  });

  it("recognises a too-short password", () => {
    expect(classifyAuthError("Password should be at least 8 characters")).toBe("errPasswordLength");
  });

  it("recognises a password failing the letters/digits character-class check", () => {
    expect(
      classifyAuthError("Password should contain at least one character of each: abc…, 0123456789"),
    ).toBe("errPasswordWeak");
  });

  it("recognises an invalid email", () => {
    expect(classifyAuthError("Unable to validate email address: invalid email")).toBe("errEmailInvalid");
  });

  it("recognises rate limiting", () => {
    expect(classifyAuthError("Too many requests")).toBe("errTooManyRequests");
    expect(classifyAuthError("rate limit exceeded")).toBe("errTooManyRequests");
  });

  it("recognises a network failure", () => {
    expect(classifyAuthError("Network request failed")).toBe("errNetwork");
  });

  it("never leaks an unrecognised backend message — falls back to errDefault", () => {
    expect(classifyAuthError("relation \"profiles\" does not exist")).toBe("errDefault");
    expect(classifyAuthError("")).toBe("errDefault");
  });
});
