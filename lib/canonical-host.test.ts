import { describe, expect, it } from "vitest";
import { canonicalHostRedirect } from "@/lib/canonical-host";

const PROD = { nodeEnv: "production", siteUrl: "https://library.ptec.edu.kh" };

describe("canonicalHostRedirect", () => {
  it("redirects the tunnel's fallback hostname to the canonical one", () => {
    expect(canonicalHostRedirect("library.storage-ptec.online", PROD)).toBe(
      "library.ptec.edu.kh",
    );
  });

  it("serves the canonical host as-is, port and case included", () => {
    expect(canonicalHostRedirect("library.ptec.edu.kh", PROD)).toBeNull();
    expect(canonicalHostRedirect("LIBRARY.PTEC.EDU.KH:443", PROD)).toBeNull();
  });

  it("leaves LAN and container debugging alone", () => {
    // The Dockerfile's HEALTHCHECK, `docker compose` port mapping, ZimaOS LAN
    // access — none of these should be bounced to the public domain.
    for (const host of [
      "10.1.1.146:13000",
      "127.0.0.1:3000",
      "localhost:3000",
      "app:3000",
      "ptec-elibrary",
      "zimaos.local",
      "[::1]:3000",
    ]) {
      expect(canonicalHostRedirect(host, PROD), host).toBeNull();
    }
  });

  it("does nothing outside production", () => {
    expect(
      canonicalHostRedirect("library.storage-ptec.online", {
        ...PROD,
        nodeEnv: "development",
      }),
    ).toBeNull();
  });

  it("honours the CANONICAL_HOST_REDIRECT=off escape hatch", () => {
    expect(
      canonicalHostRedirect("library.storage-ptec.online", { ...PROD, disabled: "off" }),
    ).toBeNull();
  });

  it("serves normally rather than looping when the site URL is unusable", () => {
    expect(
      canonicalHostRedirect("library.storage-ptec.online", {
        ...PROD,
        siteUrl: "not a url",
      }),
    ).toBeNull();
    expect(
      canonicalHostRedirect("library.storage-ptec.online", {
        ...PROD,
        siteUrl: "http://localhost:3000",
      }),
    ).toBeNull();
  });

  it("falls back to the built-in canonical host when no site URL is set", () => {
    expect(
      canonicalHostRedirect("library.storage-ptec.online", {
        nodeEnv: "production",
        siteUrl: "",
      }),
    ).toBe("library.ptec.edu.kh");
  });

  it("ignores a missing Host header", () => {
    expect(canonicalHostRedirect(null, PROD)).toBeNull();
    expect(canonicalHostRedirect("  ", PROD)).toBeNull();
  });
});
