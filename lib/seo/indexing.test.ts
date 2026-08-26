import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultRobots,
  isIndexableEnvironment,
  isPrivateSurfacePath,
  NOINDEX_ROBOTS,
  seoEnvironment,
} from "@/lib/seo/indexing";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isIndexableEnvironment", () => {
  it("is indexable on a real Vercel production deployment", () => {
    vi.stubEnv("SEO_INDEXING", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    expect(isIndexableEnvironment()).toBe(true);
  });

  // Production is a Docker container on ZimaOS behind Cloudflare Tunnel;
  // VERCEL_ENV does not exist there. The canonical site URL is the signal.
  it("is indexable on the self-hosted container serving the canonical origin", () => {
    vi.stubEnv("SEO_INDEXING", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://library.ptec.edu.kh");
    expect(isIndexableEnvironment()).toBe(true);
  });

  it.each([
    "https://library.ptec.edu.kh/",
    "library.ptec.edu.kh",
    "https://LIBRARY.PTEC.EDU.KH",
  ])("accepts %j as the canonical origin", (siteUrl) => {
    vi.stubEnv("SEO_INDEXING", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", siteUrl);
    expect(isIndexableEnvironment()).toBe(true);
  });

  // The tunnel's fallback origin resolves the same app. It must never be
  // indexed alongside the canonical domain.
  it.each([
    "https://library.storage-ptec.online",
    "http://10.1.1.146:13000",
    "https://library-test.storage-ptec.online",
    "not a url",
  ])("stays noindex when the site URL is %j", (siteUrl) => {
    vi.stubEnv("SEO_INDEXING", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", siteUrl);
    expect(isIndexableEnvironment()).toBe(false);
  });

  it("stays noindex on a dev server pointed at the production URL", () => {
    vi.stubEnv("SEO_INDEXING", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://library.ptec.edu.kh");
    expect(isIndexableEnvironment()).toBe(false);
  });

  it.each(["preview", "development", ""])(
    "defaults to noindex when VERCEL_ENV is %j",
    (vercelEnv) => {
      vi.stubEnv("SEO_INDEXING", "");
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
      vi.stubEnv("VERCEL_ENV", vercelEnv);
      vi.stubEnv("NODE_ENV", "production");
      expect(isIndexableEnvironment()).toBe(false);
    },
  );

  it("is noindex for a bare production build without a platform signal (opt-in)", () => {
    vi.stubEnv("SEO_INDEXING", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(isIndexableEnvironment()).toBe(false);
  });

  it("SEO_INDEXING=on forces indexable anywhere", () => {
    vi.stubEnv("SEO_INDEXING", "on");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(isIndexableEnvironment()).toBe(true);
  });

  it("SEO_INDEXING=off is an emergency kill switch even on production", () => {
    vi.stubEnv("SEO_INDEXING", "off");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NODE_ENV", "production");
    expect(isIndexableEnvironment()).toBe(false);
  });

  it("SEO_INDEXING=off overrides the self-hosted canonical-origin signal", () => {
    vi.stubEnv("SEO_INDEXING", "off");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://library.ptec.edu.kh");
    expect(isIndexableEnvironment()).toBe(false);
  });
});

describe("seoEnvironment", () => {
  it("classifies vitest as test", () => {
    expect(seoEnvironment()).toBe("test");
  });

  it("maps VERCEL_ENV values through", () => {
    vi.stubEnv("VITEST", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(seoEnvironment()).toBe("preview");
  });
});

describe("defaultRobots", () => {
  it("returns index,follow only when env is indexable and the admin switch is on", () => {
    vi.stubEnv("SEO_INDEXING", "on");
    expect(defaultRobots()).toEqual({ index: true, follow: true });
    expect(defaultRobots({ indexingEnabled: true })).toEqual({ index: true, follow: true });
    expect(defaultRobots({ indexingEnabled: false })).toEqual(NOINDEX_ROBOTS);
  });

  it("returns hard noindex in non-indexable environments regardless of the switch", () => {
    vi.stubEnv("SEO_INDEXING", "off");
    expect(defaultRobots({ indexingEnabled: true })).toEqual(NOINDEX_ROBOTS);
  });
});

describe("isPrivateSurfacePath", () => {
  it.each([
    "/admin",
    "/admin/login",
    "/auth/login",
    "/api/books",
    "/dashboard",
    "/dashboard/settings",
    "/profile",
    "/lists/abc",
    "/offline-books",
  ])("marks %s private", (path) => {
    expect(isPrivateSurfacePath(path)).toBe(true);
  });

  it.each(["/", "/books", "/theses/foo", "/search", "/listsomething", "/apiary"])(
    "keeps %s public (no false prefix matches)",
    (path) => {
      expect(isPrivateSurfacePath(path)).toBe(false);
    },
  );
});
