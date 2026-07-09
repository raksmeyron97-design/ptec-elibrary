import { describe, it, expect } from "vitest";
import { validateContactInput, CONTACT_CATEGORIES, type ContactInput } from "./validate";

const VALID_INPUT: ContactInput = {
  name: "Sok Dara",
  email: "dara@example.com",
  phone: "012 345 678",
  subject: "Question about borrowing",
  category: "general",
  message: "How many books can I borrow at once?",
};

describe("validateContactInput", () => {
  it("accepts a fully valid submission", () => {
    const result = validateContactInput(VALID_INPUT);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("accepts a valid submission with no phone (optional field)", () => {
    const rest = { ...VALID_INPUT };
    delete rest.phone;
    const result = validateContactInput(rest);
    expect(result.valid).toBe(true);
  });

  it.each(["name", "email", "subject", "category", "message"] as const)(
    "rejects a missing required field: %s",
    (field) => {
      const input = { ...VALID_INPUT, [field]: "" };
      const result = validateContactInput(input);
      expect(result.valid).toBe(false);
      expect(result.errors[field]).toBeTruthy();
    },
  );

  it("does not require phone", () => {
    const result = validateContactInput({ ...VALID_INPUT, phone: "" });
    expect(result.valid).toBe(true);
    expect(result.errors.phone).toBeUndefined();
  });

  it("rejects an invalid email format", () => {
    const result = validateContactInput({ ...VALID_INPUT, email: "not-an-email" });
    expect(result.valid).toBe(false);
    expect(result.errors.email).toBeTruthy();
  });

  it("rejects a category outside the allowed enum", () => {
    const result = validateContactInput({ ...VALID_INPUT, category: "made_up_category" });
    expect(result.valid).toBe(false);
    expect(result.errors.category).toBeTruthy();
  });

  it("accepts every declared category", () => {
    for (const category of CONTACT_CATEGORIES) {
      const result = validateContactInput({ ...VALID_INPUT, category });
      expect(result.valid).toBe(true);
    }
  });

  it("rejects an over-length name", () => {
    const result = validateContactInput({ ...VALID_INPUT, name: "a".repeat(101) });
    expect(result.valid).toBe(false);
    expect(result.errors.name).toBeTruthy();
  });

  it("rejects an over-length message", () => {
    const result = validateContactInput({ ...VALID_INPUT, message: "a".repeat(5001) });
    expect(result.valid).toBe(false);
    expect(result.errors.message).toBeTruthy();
  });

  it("rejects an over-length subject", () => {
    const result = validateContactInput({ ...VALID_INPUT, subject: "a".repeat(201) });
    expect(result.valid).toBe(false);
    expect(result.errors.subject).toBeTruthy();
  });

  it("rejects an over-length phone", () => {
    const result = validateContactInput({ ...VALID_INPUT, phone: "1".repeat(31) });
    expect(result.valid).toBe(false);
    expect(result.errors.phone).toBeTruthy();
  });

  it("trims whitespace before validating", () => {
    const result = validateContactInput({ ...VALID_INPUT, name: "   ", email: "  dara@example.com  " });
    expect(result.errors.name).toBeTruthy();
    expect(result.errors.email).toBeUndefined();
  });
});
