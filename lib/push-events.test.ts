import { describe, expect, it } from "vitest";
import { shouldNotifyPublishedTransition } from "@/lib/push-utils";

describe("shouldNotifyPublishedTransition", () => {
  it("notifies when content becomes published", () => {
    expect(shouldNotifyPublishedTransition("draft", "published")).toBe(true);
    expect(shouldNotifyPublishedTransition(null, "published")).toBe(true);
  });

  it("does not notify for edits to already-published content", () => {
    expect(shouldNotifyPublishedTransition("published", "published")).toBe(false);
  });

  it("does not notify for non-published target states", () => {
    expect(shouldNotifyPublishedTransition("draft", "archived")).toBe(false);
    expect(shouldNotifyPublishedTransition("published", "draft")).toBe(false);
  });
});
