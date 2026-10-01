import { beforeEach, describe, expect, it, vi } from "vitest";

// i18n/request.ts — which locale a request renders in. SEO decision P7-3: a
// [locale] segment that is not a locale (a missing root file such as /ads.txt)
// must resolve without cookies(), or the prerendered tree turns dynamic at
// runtime and Next answers 500 instead of the layout's 404.

const cookieGet = vi.fn();
const cookies = vi.fn(async () => ({ get: cookieGet }));
const rootLocale = vi.fn<() => Promise<string | undefined>>();

vi.mock("next-intl/server", () => ({ getRequestConfig: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ cookies: () => cookies() }));
vi.mock("next/root-params", () => ({ locale: () => rootLocale() }));

type Resolver = (args: { requestLocale: Promise<string | undefined>; locale?: string }) => Promise<{ locale: string }>;

async function resolve(args: { requestLocale?: string; locale?: string } = {}) {
  const config = (await import("./request")).default as unknown as Resolver;
  return (await config({ requestLocale: Promise.resolve(args.requestLocale), locale: args.locale })).locale;
}

describe("request locale", () => {
  beforeEach(() => {
    cookies.mockClear();
    cookieGet.mockReset();
    rootLocale.mockReset();
  });

  it("uses the [locale] segment on public pages, without reading cookies", async () => {
    rootLocale.mockResolvedValue("km");
    expect(await resolve()).toBe("km");
    expect(cookies).not.toHaveBeenCalled();
  });

  it("renders a non-locale segment (/ads.txt) in the default locale, without reading cookies (P7-3)", async () => {
    for (const segment of ["ads.txt", "apple-touch-icon-precomposed.png", "__not-found__"]) {
      rootLocale.mockResolvedValue(segment);
      expect(await resolve()).toBe("en");
    }
    expect(cookies).not.toHaveBeenCalled();
  });

  it("reads the cookie only outside the [locale] tree (/admin, /auth)", async () => {
    rootLocale.mockResolvedValue(undefined);
    cookieGet.mockReturnValue({ value: "km" });
    expect(await resolve()).toBe("km");
    expect(cookies).toHaveBeenCalledTimes(1);
  });

  it("an explicit locale wins over everything", async () => {
    rootLocale.mockResolvedValue("en");
    expect(await resolve({ locale: "km" })).toBe("km");
  });
});
