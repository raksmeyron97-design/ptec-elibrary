import { describe, expect, it } from "vitest";
import { derivePushStatusKind } from "@/lib/push-status";

const BASE = {
  supported: true,
  permission: "default" as NotificationPermission,
  isIOS: false,
  isStandalone: false,
  browserSubscribed: false,
  serverSubscribed: false,
  error: null,
};

describe("derivePushStatusKind", () => {
  it("reports unsupported first", () => {
    expect(derivePushStatusKind({ ...BASE, supported: false })).toBe("unsupported");
  });

  it("requires iOS users to install before enabling", () => {
    expect(derivePushStatusKind({ ...BASE, isIOS: true, isStandalone: false })).toBe("ios-not-installed");
  });

  it("reports enabled only when browser and server subscriptions both exist", () => {
    expect(derivePushStatusKind({
      ...BASE,
      permission: "granted",
      browserSubscribed: true,
      serverSubscribed: true,
    })).toBe("enabled");
  });

  it("reports repair when permission is granted but either subscription side is missing", () => {
    expect(derivePushStatusKind({
      ...BASE,
      permission: "granted",
      browserSubscribed: true,
      serverSubscribed: false,
    })).toBe("needs-repair");
  });

  it("reports denied permission", () => {
    expect(derivePushStatusKind({ ...BASE, permission: "denied" })).toBe("denied");
  });
});
