import { describe, expect, it } from "vitest";
import {
  PUSH_ERROR_CODES,
  safeInternalUrl,
  validatePushPayload,
  validateSerializedSubscription,
} from "@/lib/push-utils";

const VALID_SUBSCRIPTION = {
  endpoint: "https://updates.push.services.mozilla.com/wpush/v2/example",
  keys: {
    p256dh: "BEl6KrrY7KpYexample_key",
    auth: "auth_key_123",
  },
};

describe("validateSerializedSubscription", () => {
  it("accepts a valid browser subscription shape", () => {
    const result = validateSerializedSubscription(VALID_SUBSCRIPTION);
    expect(result.ok).toBe(true);
    expect(result.data?.endpoint).toBe(VALID_SUBSCRIPTION.endpoint);
  });

  it("rejects non-HTTPS endpoints", () => {
    const result = validateSerializedSubscription({ ...VALID_SUBSCRIPTION, endpoint: "http://example.com/push" });
    expect(result.ok).toBe(false);
    expect(result.code).toBe(PUSH_ERROR_CODES.INVALID_SUBSCRIPTION);
  });

  it("rejects malformed key material", () => {
    const result = validateSerializedSubscription({
      ...VALID_SUBSCRIPTION,
      keys: { p256dh: "<script>", auth: "auth" },
    });
    expect(result.ok).toBe(false);
  });
});

describe("safeInternalUrl", () => {
  it("keeps same-site relative URLs", () => {
    expect(safeInternalUrl("/books/khmer-methods")).toBe("/books/khmer-methods");
  });

  it("rejects protocol-relative and absolute external URLs", () => {
    expect(safeInternalUrl("//evil.example/path")).toBe("/");
    expect(safeInternalUrl("https://evil.example/path")).toBe("/");
  });
});

describe("validatePushPayload", () => {
  it("accepts a minimal valid payload", () => {
    const result = validatePushPayload({ title: "New book", body: "Read now", url: "/books/a" });
    expect(result.ok).toBe(true);
    expect(result.data).toMatchObject({ title: "New book", body: "Read now", url: "/books/a" });
  });

  it("rejects missing title/body", () => {
    expect(validatePushPayload({ title: "", body: "Read now" }).ok).toBe(false);
    expect(validatePushPayload({ title: "New book", body: "" }).ok).toBe(false);
  });

  it("falls back unsafe payload URLs to root", () => {
    const result = validatePushPayload({ title: "New book", body: "Read now", url: "https://evil.example" });
    expect(result.data?.url).toBe("/");
  });
});
