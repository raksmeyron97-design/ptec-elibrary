import { describe, expect, it } from "vitest";
import { serializeSubscription, urlBase64ToUint8Array } from "@/lib/push-client";

describe("urlBase64ToUint8Array", () => {
  it("converts URL-safe base64 into bytes", () => {
    expect(Array.from(urlBase64ToUint8Array("AQIDBA"))).toEqual([1, 2, 3, 4]);
  });
});

describe("serializeSubscription", () => {
  it("serializes the browser subscription shape sent to the API", () => {
    const subscription = {
      endpoint: "https://example.push.service/send/123",
      toJSON: () => ({
        endpoint: "https://example.push.service/send/123",
        keys: {
          p256dh: "p256dh_key_123",
          auth: "auth_key_123",
        },
      }),
    } as unknown as PushSubscription;

    expect(serializeSubscription(subscription)).toEqual({
      endpoint: "https://example.push.service/send/123",
      keys: {
        p256dh: "p256dh_key_123",
        auth: "auth_key_123",
      },
    });
  });
});
