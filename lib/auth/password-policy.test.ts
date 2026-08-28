import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH, isPasswordValid, passwordRequirements } from "./password-policy";

describe("passwordRequirements", () => {
  it("reports all three requirements unmet for an empty password", () => {
    const reqs = passwordRequirements("");
    expect(reqs.every((r) => !r.met)).toBe(true);
    expect(reqs.map((r) => r.id)).toEqual(["length", "letter", "number"]);
  });

  it("flags length separately from character content", () => {
    const reqs = passwordRequirements("ab1");
    const byId = Object.fromEntries(reqs.map((r) => [r.id, r.met]));
    expect(byId.length).toBe(false);
    expect(byId.letter).toBe(true);
    expect(byId.number).toBe(true);
  });

  it("does NOT require separate upper/lower case — backend uses letters_digits, not lower_upper_letters_digits", () => {
    // supabase/config.toml: password_requirements = "letters_digits"
    expect(isPasswordValid("alllowercase1")).toBe(true);
    expect(isPasswordValid("ALLUPPERCASE1")).toBe(true);
  });

  it(`requires at least ${PASSWORD_MIN_LENGTH} characters`, () => {
    expect(isPasswordValid("a1234567")).toBe(true); // 8 chars
    expect(isPasswordValid("a123456")).toBe(false); // 7 chars
  });

  it("requires at least one letter and one digit", () => {
    expect(isPasswordValid("12345678")).toBe(false); // digits only
    expect(isPasswordValid("abcdefgh")).toBe(false); // letters only
    expect(isPasswordValid("abcdefg1")).toBe(true);
  });
});
