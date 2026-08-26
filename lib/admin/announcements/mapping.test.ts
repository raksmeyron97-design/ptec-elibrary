import { describe, expect, it } from "vitest";
import { rowToInput, rowToComposerInput } from "./mapping";

/** Minimal DB row shape — only the fields these mappings actually read. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    internal_name: "Spring reopening",
    type: "general",
    priority: "normal",
    image_url: null,
    title_en: "We are open",
    title_km: null,
    summary_en: null,
    summary_km: null,
    body_en: null,
    body_km: null,
    cta_label_en: null,
    cta_label_km: null,
    cta_url: null,
    channel_in_app: true,
    channel_banner: false,
    channel_push: false,
    push_title: null,
    push_body: null,
    push_url: null,
    push_ttl_seconds: null,
    audience_type: "all_active",
    audience_roles: [],
    audience_user_ids: [],
    pinned: false,
    dismissible: true,
    status: "draft",
    scheduled_at: null,
    expires_at: null,
    ...overrides,
  };
}

describe("rowToInput", () => {
  it("always reports schedule mode 'now'", () => {
    // This shape doubles as the publish-time validation input. A "schedule"
    // mode here would make validateScheduleStep reject a row whose scheduled
    // time has just arrived — which is exactly when the cron sweep publishes it.
    const scheduled = row({ status: "scheduled", scheduled_at: "2020-01-01T00:00:00.000Z" });
    expect(rowToInput(scheduled).schedule.mode).toBe("now");
  });

  it("carries scheduled_at and expires_at through unchanged", () => {
    const mapped = rowToInput(row({ scheduled_at: "2030-01-01T00:00:00.000Z", expires_at: "2030-02-01T00:00:00.000Z" }));
    expect(mapped.schedule.scheduledAt).toBe("2030-01-01T00:00:00.000Z");
    expect(mapped.schedule.expiresAt).toBe("2030-02-01T00:00:00.000Z");
  });
});

describe("rowToComposerInput", () => {
  it("opens a scheduled announcement in schedule mode", () => {
    const mapped = rowToComposerInput(row({ status: "scheduled", scheduled_at: "2030-01-01T00:00:00.000Z" }));
    expect(mapped.schedule.mode).toBe("schedule");
    expect(mapped.schedule.scheduledAt).toBe("2030-01-01T00:00:00.000Z");
  });

  it("opens a draft in 'now' mode even when a stale scheduled_at lingers", () => {
    const mapped = rowToComposerInput(row({ status: "draft", scheduled_at: "2030-01-01T00:00:00.000Z" }));
    expect(mapped.schedule.mode).toBe("now");
  });

  it("falls back to 'now' for a scheduled row with no date", () => {
    expect(rowToComposerInput(row({ status: "scheduled", scheduled_at: null })).schedule.mode).toBe("now");
  });
});
