import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalOrigin, canonicalRedirectUrl } from "@/lib/site-origin";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function withEnv(nodeEnv: string, siteUrl: string) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", siteUrl);
  return import("@/lib/site-origin");
}

describe("canonicalOrigin", () => {
  it("in production, ignores the origin the request arrived on", async () => {
    const mod = await withEnv("production", "https://library.ptec.edu.kh");
    // The tunnel's fallback hostname and the container's raw http origin both
    // resolve this same app; neither may become an auth callback origin.
    expect(mod.canonicalOrigin("https://library.storage-ptec.online/auth/callback")).toBe(
      "https://library.ptec.edu.kh",
    );
    expect(mod.canonicalOrigin("http://10.1.1.146:13000/auth/callback")).toBe(
      "https://library.ptec.edu.kh",
    );
  });

  it("in development, honours the request origin", async () => {
    const mod = await withEnv("development", "https://library.ptec.edu.kh");
    expect(mod.canonicalOrigin("http://localhost:3000/auth/callback")).toBe(
      "http://localhost:3000",
    );
  });

  it("falls back to the site URL for a missing or unparseable request URL", async () => {
    const mod = await withEnv("development", "https://library.ptec.edu.kh");
    expect(mod.canonicalOrigin(null)).toBe("https://library.ptec.edu.kh");
    expect(mod.canonicalOrigin("not a url")).toBe("https://library.ptec.edu.kh");
  });
});

describe("canonicalRedirectUrl", () => {
  it("joins an internal path onto the canonical origin", async () => {
    const mod = await withEnv("production", "https://library.ptec.edu.kh");
    expect(mod.canonicalRedirectUrl("/dashboard", "https://library.storage-ptec.online")).toBe(
      "https://library.ptec.edu.kh/dashboard",
    );
    expect(mod.canonicalRedirectUrl("", null)).toBe("https://library.ptec.edu.kh/");
  });
});

it("exports the module-level helpers", () => {
  expect(typeof canonicalOrigin).toBe("function");
  expect(typeof canonicalRedirectUrl).toBe("function");
});
