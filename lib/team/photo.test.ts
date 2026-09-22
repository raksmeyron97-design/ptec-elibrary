import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isAllowedTeamPhotoUrl } from "./photo";

describe("isAllowedTeamPhotoUrl", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      ZIMA_API_URL: "https://storage-ptec.online",
      NEXT_PUBLIC_R2_PUBLIC_URL: "https://pub-legacy.r2.dev",
      NEXT_PUBLIC_R2_COVERS_URL: "https://covers-legacy.r2.dev",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("allows official PTEC website URLs", () => {
    expect(
      isAllowedTeamPhotoUrl(
        "https://www.ptec.edu.kh/wp-content/uploads/2026/05/THOLTHOEUN-Chanraksmey-1.jpg"
      )
    ).toBe(true);
    expect(
      isAllowedTeamPhotoUrl(
        "https://ptec.edu.kh/wp-content/uploads/2026/05/LEK-Chumnor.jpg"
      )
    ).toBe(true);
  });

  it("allows Zima storage URLs", () => {
    expect(
      isAllowedTeamPhotoUrl("https://storage-ptec.online/files/team/photo.jpg")
    ).toBe(true);
  });

  it("allows legacy R2 URLs", () => {
    expect(
      isAllowedTeamPhotoUrl("https://covers-legacy.r2.dev/team/avatar.png")
    ).toBe(true);
    expect(
      isAllowedTeamPhotoUrl("https://pub-legacy.r2.dev/team/avatar.png")
    ).toBe(true);
  });

  it("rejects untrusted external domains", () => {
    expect(isAllowedTeamPhotoUrl("https://malicious-site.com/avatar.jpg")).toBe(
      false
    );
    expect(isAllowedTeamPhotoUrl("https://evil-ptec.edu.kh/photo.jpg")).toBe(
      false
    );
    expect(isAllowedTeamPhotoUrl("https://ptec.edu.kh.attacker.com/photo.jpg")).toBe(
      false
    );
    expect(isAllowedTeamPhotoUrl("not-a-url")).toBe(false);
  });
});
