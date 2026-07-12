import { describe, it, expect } from "vitest";
import {
  canonicalize,
  canTransition,
  canActorTransition,
  isVerifyingTransition,
  isPublicStatus,
  isAuthoritative,
  STATUS_META,
} from "./content-status";

describe("canonicalize", () => {
  it("folds legacy aliases", () => {
    expect(canonicalize("pending_review")).toBe("needs_review");
    expect(canonicalize("rejected")).toBe("changes_requested");
  });
  it("passes canonical values through", () => {
    expect(canonicalize("published")).toBe("published");
    expect(canonicalize("in_review")).toBe("in_review");
  });
  it("defaults unknown/null to draft", () => {
    expect(canonicalize(null)).toBe("draft");
    expect(canonicalize("banana")).toBe("draft");
  });
  it("has display meta for every canonical status", () => {
    for (const key of Object.keys(STATUS_META)) {
      expect(STATUS_META[key as keyof typeof STATUS_META].label).toBeTruthy();
    }
  });
});

describe("canTransition", () => {
  it("allows the happy editorial path", () => {
    expect(canTransition("draft", "needs_review")).toBe(true);
    expect(canTransition("needs_review", "in_review")).toBe(true);
    expect(canTransition("in_review", "verified")).toBe(true);
    expect(canTransition("verified", "published")).toBe(true);
    expect(canTransition("verified", "scheduled")).toBe(true);
    expect(canTransition("scheduled", "published")).toBe(true);
    expect(canTransition("published", "archived")).toBe(true);
    expect(canTransition("archived", "draft")).toBe(true);
  });
  it("allows single-step approve (needs_review → published)", () => {
    expect(canTransition("needs_review", "published")).toBe(true);
    expect(canTransition("pending_review", "published")).toBe(true); // legacy
  });
  it("supports the changes-requested loop", () => {
    expect(canTransition("in_review", "changes_requested")).toBe(true);
    expect(canTransition("changes_requested", "needs_review")).toBe(true);
    expect(canTransition("rejected", "needs_review")).toBe(true); // legacy
  });
  it("blocks nonsensical jumps", () => {
    expect(canTransition("draft", "published")).toBe(false);
    expect(canTransition("draft", "verified")).toBe(false);
    expect(canTransition("imported", "published")).toBe(false);
    expect(canTransition("archived", "in_review")).toBe(false);
  });
  it("rejects no-op transitions, including via aliases", () => {
    expect(canTransition("published", "published")).toBe(false);
    expect(canTransition("pending_review", "needs_review")).toBe(false);
  });
});

describe("canActorTransition (role separation)", () => {
  it("lets staff submit but not publish", () => {
    expect(canActorTransition({ role: "staff", from: "draft", to: "needs_review", isOwnContent: true }).allowed).toBe(true);
    expect(canActorTransition({ role: "staff", from: "needs_review", to: "published", isOwnContent: false }).allowed).toBe(false);
  });
  it("lets a librarian verify someone else's record", () => {
    expect(canActorTransition({ role: "librarian", from: "needs_review", to: "published", isOwnContent: false }).allowed).toBe(true);
  });
  it("blocks a librarian verifying their own record", () => {
    const res = canActorTransition({ role: "librarian", from: "needs_review", to: "published", isOwnContent: true });
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/another reviewer/i);
  });
  it("lets an admin self-approve but flags it as an override", () => {
    const res = canActorTransition({ role: "admin", from: "needs_review", to: "published", isOwnContent: true });
    expect(res.allowed).toBe(true);
    expect(res.override).toBe("self_approval");
  });
  it("non-verifying transitions carry no override even for own content", () => {
    const res = canActorTransition({ role: "librarian", from: "in_review", to: "changes_requested", isOwnContent: true });
    expect(res.allowed).toBe(true);
    expect(res.override).toBeUndefined();
  });
  it("still enforces the state machine for admins", () => {
    expect(canActorTransition({ role: "super_admin", from: "draft", to: "published", isOwnContent: false }).allowed).toBe(false);
  });
});

describe("authoritative gating", () => {
  it("verifying targets are exactly verified/published/scheduled", () => {
    expect(isVerifyingTransition("verified")).toBe(true);
    expect(isVerifyingTransition("published")).toBe(true);
    expect(isVerifyingTransition("scheduled")).toBe(true);
    expect(isVerifyingTransition("archived")).toBe(false);
    expect(isVerifyingTransition("needs_review")).toBe(false);
  });
  it("only published is public", () => {
    expect(isPublicStatus("published")).toBe(true);
    expect(isPublicStatus("verified")).toBe(false);
    expect(isPublicStatus("archived")).toBe(false);
  });
  it("authoritative requires published AND verified_at", () => {
    expect(isAuthoritative("published", "2026-07-01T00:00:00Z")).toBe(true);
    expect(isAuthoritative("published", null)).toBe(false);
    expect(isAuthoritative("verified", "2026-07-01T00:00:00Z")).toBe(false);
  });
});
