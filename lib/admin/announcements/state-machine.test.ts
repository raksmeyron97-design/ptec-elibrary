import { describe, expect, it } from "vitest";
import {
  canTransition,
  assertTransition,
  InvalidTransitionError,
  availableActions,
  computeOverallStatus,
} from "./state-machine";

describe("canTransition / assertTransition", () => {
  it("allows draft -> scheduled -> publishing -> active", () => {
    expect(canTransition("draft", "scheduled")).toBe(true);
    expect(canTransition("scheduled", "publishing")).toBe(true);
    expect(canTransition("publishing", "active")).toBe(true);
  });

  it("allows a no-op transition to the same status", () => {
    expect(canTransition("active", "active")).toBe(true);
  });

  it("rejects an arbitrary/unsafe jump, e.g. draft -> active directly", () => {
    expect(canTransition("draft", "active")).toBe(false);
  });

  it("rejects leaving a terminal archived state", () => {
    expect(canTransition("archived", "draft")).toBe(false);
    expect(canTransition("archived", "active")).toBe(false);
  });

  it("assertTransition throws InvalidTransitionError for a bad transition", () => {
    expect(() => assertTransition("draft", "active")).toThrow(InvalidTransitionError);
  });

  it("assertTransition does not throw for a valid transition", () => {
    expect(() => assertTransition("draft", "scheduled")).not.toThrow();
  });

  it("supports the documented retry path failed -> publishing -> active", () => {
    expect(canTransition("failed", "publishing")).toBe(true);
  });
});

describe("availableActions", () => {
  it("a draft can be edited, scheduled, published, or deleted", () => {
    const actions = availableActions("draft");
    expect(actions).toContain("edit");
    expect(actions).toContain("publish");
    expect(actions).toContain("schedule");
    expect(actions).toContain("delete");
  });

  it("an active announcement cannot be deleted (must archive to keep analytics)", () => {
    const actions = availableActions("active");
    expect(actions).not.toContain("delete");
    expect(actions).toContain("archive");
  });

  it("a scheduled announcement offers cancelSchedule but not delete", () => {
    const actions = availableActions("scheduled");
    expect(actions).toContain("cancelSchedule");
    expect(actions).not.toContain("delete");
  });

  it("an archived announcement offers only read/duplicate actions", () => {
    const actions = availableActions("archived");
    expect(actions).toEqual(["view", "duplicate"]);
  });
});

describe("computeOverallStatus", () => {
  it("stays 'active' when there is no push channel at all", () => {
    expect(computeOverallStatus(true, false, { sent: 0, failed: 0, expired: 0, total: 0 })).toBe("active");
  });

  it("returns 'publishing' while a push-only send is still in flight", () => {
    expect(computeOverallStatus(false, true, { sent: 2, failed: 0, expired: 0, total: 10 })).toBe("publishing");
  });

  it("stays 'active' while push is still in flight IF another channel already keeps it live", () => {
    expect(computeOverallStatus(true, true, { sent: 2, failed: 0, expired: 0, total: 10 })).toBe("active");
  });

  it("becomes 'completed' for a push-only send that fully succeeded", () => {
    expect(computeOverallStatus(false, true, { sent: 10, failed: 0, expired: 0, total: 10 })).toBe("completed");
  });

  it("becomes 'failed' for a push-only send where nothing sent", () => {
    expect(computeOverallStatus(false, true, { sent: 0, failed: 10, expired: 0, total: 10 })).toBe("failed");
  });

  it("becomes 'partially_delivered' whenever there is a mix of sent and failed/expired", () => {
    expect(computeOverallStatus(false, true, { sent: 6, failed: 3, expired: 1, total: 10 })).toBe("partially_delivered");
    expect(computeOverallStatus(true, true, { sent: 6, failed: 3, expired: 1, total: 10 })).toBe("partially_delivered");
  });

  it("a zero-recipient push-only send completes cleanly rather than failing", () => {
    expect(computeOverallStatus(false, true, { sent: 0, failed: 0, expired: 0, total: 0 })).toBe("completed");
  });
});
