import { describe, expect, it } from "vitest";
import {
  validateContentStep,
  validateChannelsStep,
  validateAudienceStep,
  validateScheduleStep,
  validateAnnouncement,
  isReadyToPublish,
  type AnnouncementInput,
} from "./validation";

function baseInput(overrides: Partial<AnnouncementInput> = {}): AnnouncementInput {
  return {
    internalName: "Library closed — test",
    type: "general",
    priority: "normal",
    imageUrl: null,
    content: {
      en: { title: "Library closed on Friday", summary: "We are closed for a holiday.", body: "", ctaLabel: "" },
      km: { title: "", summary: "", body: "", ctaLabel: "" },
    },
    ctaUrl: null,
    channels: { inApp: true, banner: false, push: false },
    push: { title: "", body: "", url: "", ttlSeconds: null },
    audience: { type: "all_active", roles: [], userIds: [] },
    pinned: false,
    dismissible: true,
    schedule: { mode: "now", scheduledAt: null, expiresAt: null },
    ...overrides,
  };
}

describe("validateContentStep", () => {
  it("passes for a minimal valid English-only announcement", () => {
    expect(validateContentStep(baseInput())).toEqual({});
  });

  it("requires an internal name", () => {
    const errors = validateContentStep(baseInput({ internalName: "" }));
    expect(errors.internalName).toBeTruthy();
  });

  it("requires an English title (Khmer is optional)", () => {
    const input = baseInput();
    input.content.en.title = "";
    const errors = validateContentStep(input);
    expect(errors["content.en.title"]).toBeTruthy();
    expect(errors["content.km.title"]).toBeUndefined();
  });

  it("requires a CTA label whenever a destination link is set", () => {
    const input = baseInput({ ctaUrl: "/books" });
    const errors = validateContentStep(input);
    expect(errors["content.en.ctaLabel"]).toBeTruthy();
  });

  it("requires a destination link whenever a CTA label is set", () => {
    const input = baseInput();
    input.content.en.ctaLabel = "Browse books";
    const errors = validateContentStep(input);
    expect(errors.ctaUrl).toBeTruthy();
  });

  it("rejects an unsafe CTA URL", () => {
    const input = baseInput({ ctaUrl: "javascript:alert(1)" });
    input.content.en.ctaLabel = "Click me";
    const errors = validateContentStep(input);
    expect(errors.ctaUrl).toBeTruthy();
  });
});

describe("validateChannelsStep", () => {
  it("requires at least one channel", () => {
    const input = baseInput({ channels: { inApp: false, banner: false, push: false } });
    expect(validateChannelsStep(input).channels).toBeTruthy();
  });

  it("passes with only in-app selected", () => {
    expect(validateChannelsStep(baseInput())).toEqual({});
  });

  it("requires a resolvable push title/body when push is selected with no English fallback", () => {
    const input = baseInput({ channels: { inApp: false, banner: false, push: true } });
    input.content.en.title = "";
    input.content.en.summary = "";
    const errors = validateChannelsStep(input);
    expect(errors["push.title"]).toBeTruthy();
    expect(errors["push.body"]).toBeTruthy();
  });

  it("push title/body fall back to the English title/summary when left blank", () => {
    const input = baseInput({ channels: { inApp: false, banner: false, push: true } });
    expect(validateChannelsStep(input)).toEqual({});
  });

  it("rejects an out-of-range push TTL", () => {
    const input = baseInput({ channels: { inApp: false, banner: false, push: true } });
    input.push.ttlSeconds = -5;
    expect(validateChannelsStep(input)["push.ttlSeconds"]).toBeTruthy();
  });
});

describe("validateAudienceStep", () => {
  it("requires at least one role when audience type is 'role'", () => {
    const input = baseInput({ audience: { type: "role", roles: [], userIds: [] } });
    expect(validateAudienceStep(input)["audience.roles"]).toBeTruthy();
  });

  it("rejects an unknown role value (never invents an audience attribute)", () => {
    const input = baseInput({ audience: { type: "role", roles: ["superhero"], userIds: [] } });
    expect(validateAudienceStep(input)["audience.roles"]).toBeTruthy();
  });

  it("requires at least one user when audience type is 'individual'", () => {
    const input = baseInput({ audience: { type: "individual", roles: [], userIds: [] } });
    expect(validateAudienceStep(input)["audience.userIds"]).toBeTruthy();
  });

  it("passes for 'all_active' with no extra selection", () => {
    expect(validateAudienceStep(baseInput())).toEqual({});
  });
});

describe("validateScheduleStep", () => {
  const now = new Date("2026-07-20T00:00:00Z").getTime();

  it("requires a scheduledAt when mode is 'schedule'", () => {
    const input = baseInput({ schedule: { mode: "schedule", scheduledAt: null, expiresAt: null } });
    expect(validateScheduleStep(input, now)["schedule.scheduledAt"]).toBeTruthy();
  });

  it("rejects a scheduled time in the past", () => {
    const input = baseInput({ schedule: { mode: "schedule", scheduledAt: "2020-01-01T00:00:00Z", expiresAt: null } });
    expect(validateScheduleStep(input, now)["schedule.scheduledAt"]).toBeTruthy();
  });

  it("accepts a scheduled time in the future", () => {
    const input = baseInput({ schedule: { mode: "schedule", scheduledAt: "2026-08-01T00:00:00Z", expiresAt: null } });
    expect(validateScheduleStep(input, now)["schedule.scheduledAt"]).toBeUndefined();
  });

  it("rejects an expiration at or before the publish time (immediate publish)", () => {
    const input = baseInput({ schedule: { mode: "now", scheduledAt: null, expiresAt: "2020-01-01T00:00:00Z" } });
    expect(validateScheduleStep(input, now)["schedule.expiresAt"]).toBeTruthy();
  });

  it("rejects an expiration before a future scheduled publish time", () => {
    const input = baseInput({
      schedule: { mode: "schedule", scheduledAt: "2026-08-10T00:00:00Z", expiresAt: "2026-08-01T00:00:00Z" },
    });
    expect(validateScheduleStep(input, now)["schedule.expiresAt"]).toBeTruthy();
  });

  it("accepts an expiration after a future scheduled publish time", () => {
    const input = baseInput({
      schedule: { mode: "schedule", scheduledAt: "2026-08-01T00:00:00Z", expiresAt: "2026-08-10T00:00:00Z" },
    });
    expect(validateScheduleStep(input, now)["schedule.expiresAt"]).toBeUndefined();
  });
});

describe("validateAnnouncement / isReadyToPublish", () => {
  it("a fully valid minimal announcement is ready to publish", () => {
    const input = baseInput();
    expect(validateAnnouncement(input)).toEqual({});
    expect(isReadyToPublish(input)).toBe(true);
  });

  it("is not ready to publish when any step has an error", () => {
    const input = baseInput({ channels: { inApp: false, banner: false, push: false } });
    expect(isReadyToPublish(input)).toBe(false);
  });
});
