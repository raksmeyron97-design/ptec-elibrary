import { describe, it, expect, vi, afterEach } from "vitest";
import { isLockedDown, lockdownResponse } from "./lockdown";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isLockedDown", () => {
  it("is off by default (unset env)", () => {
    expect(isLockedDown("ai")).toBe(false);
    expect(isLockedDown("downloads")).toBe(false);
    expect(isLockedDown("admin_mutations")).toBe(false);
  });

  it("only the exact string 'true' enables a switch", () => {
    vi.stubEnv("LOCKDOWN_AI", "1");
    expect(isLockedDown("ai")).toBe(false);
    vi.stubEnv("LOCKDOWN_AI", "TRUE");
    expect(isLockedDown("ai")).toBe(false);
    vi.stubEnv("LOCKDOWN_AI", "true");
    expect(isLockedDown("ai")).toBe(true);
  });

  it("each switch is independent", () => {
    vi.stubEnv("LOCKDOWN_DOWNLOADS", "true");
    expect(isLockedDown("downloads")).toBe(true);
    expect(isLockedDown("ai")).toBe(false);
    expect(isLockedDown("admin_mutations")).toBe(false);
  });

  it("LOCKDOWN_ALL enables every feature", () => {
    vi.stubEnv("LOCKDOWN_ALL", "true");
    expect(isLockedDown("ai")).toBe(true);
    expect(isLockedDown("downloads")).toBe(true);
    expect(isLockedDown("admin_mutations")).toBe(true);
  });
});

describe("lockdownResponse", () => {
  it("returns null when the feature is available", () => {
    expect(lockdownResponse("ai", "/api/ai")).toBeNull();
  });

  it("returns a non-cacheable 503 with Retry-After when locked", async () => {
    vi.stubEnv("LOCKDOWN_AI", "true");
    const res = lockdownResponse("ai", "/api/ai");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
    expect(res!.headers.get("retry-after")).toBe("600");
    expect(res!.headers.get("cache-control")).toContain("no-store");
    const body = await res!.json();
    expect(body.error).toBeTruthy();
  });
});
