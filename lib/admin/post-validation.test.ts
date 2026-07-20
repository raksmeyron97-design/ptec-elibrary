import { describe, it, expect } from "vitest";
import { validatePost, type PostValidationInput } from "./post-validation";

function valid(overrides: Partial<PostValidationInput> = {}): PostValidationInput {
  return {
    title: "A valid post title",
    slug: "a-valid-post-title",
    category: "Announcement",
    content: "Some real content.",
    excerpt: null,
    tags: [],
    status: "draft",
    scheduledAt: null,
    ...overrides,
  };
}

describe("validatePost — core", () => {
  it("accepts a well-formed post", () => {
    expect(validatePost(valid())).toEqual({});
  });

  it("rejects a short title", () => {
    expect(validatePost(valid({ title: "ab" })).title).toBeTruthy();
  });

  it("rejects a bad slug", () => {
    expect(validatePost(valid({ slug: "Not A Slug" })).slug).toBeTruthy();
  });

  it("requires a future scheduledAt when scheduling", () => {
    expect(validatePost(valid({ status: "scheduled", scheduledAt: null })).scheduledAt).toBeTruthy();
    const past = new Date(Date.now() - 1000).toISOString();
    expect(validatePost(valid({ status: "scheduled", scheduledAt: past })).scheduledAt).toBeTruthy();
  });
});

describe("validatePost — events", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const later = new Date(Date.now() + 2 * 86_400_000).toISOString();

  it("ignores event fields for non-event categories", () => {
    const errors = validatePost(
      valid({ category: "Announcement", event: { startAt: later, endAt: future } }),
    );
    expect(errors.eventEndAt).toBeUndefined();
  });

  it("accepts a valid event", () => {
    const errors = validatePost(
      valid({
        category: "Event",
        event: { startAt: future, endAt: later, registrationUrl: "https://ptec.edu.kh/register" },
      }),
    );
    expect(errors.eventStartAt).toBeUndefined();
    expect(errors.eventEndAt).toBeUndefined();
    expect(errors.eventRegistrationUrl).toBeUndefined();
  });

  it("rejects an end before the start", () => {
    const errors = validatePost(
      valid({ category: "Event", event: { startAt: later, endAt: future } }),
    );
    expect(errors.eventEndAt).toBeTruthy();
  });

  it("rejects a non-http registration URL", () => {
    const errors = validatePost(
      valid({ category: "Event", event: { startAt: future, registrationUrl: "javascript:alert(1)" } }),
    );
    expect(errors.eventRegistrationUrl).toBeTruthy();
  });

  it("rejects an invalid start date", () => {
    const errors = validatePost(
      valid({ category: "Event", event: { startAt: "not-a-date" } }),
    );
    expect(errors.eventStartAt).toBeTruthy();
  });

  it("allows an event with no dates (optional)", () => {
    const errors = validatePost(valid({ category: "Event", event: {} }));
    expect(errors.eventStartAt).toBeUndefined();
    expect(errors.eventEndAt).toBeUndefined();
  });
});
