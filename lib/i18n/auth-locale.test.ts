import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inferAuthLocale } from "./auth-locale";

const HOST = "library.ptec.edu.kh";

describe("inferAuthLocale", () => {
  it("a reader going back to a Khmer page signs in in Khmer", () => {
    expect(inferAuthLocale({ callbackUrl: "/km/books/x/read", host: HOST })).toBe("km");
    expect(inferAuthLocale({ callbackUrl: "/km", host: HOST })).toBe("km");
  });

  it("a plain Login link from a Khmer page signs in in Khmer", () => {
    expect(inferAuthLocale({ referer: `https://${HOST}/km/books`, host: HOST })).toBe("km");
  });

  it("an explicit choice is never overridden", () => {
    expect(inferAuthLocale({ cookie: "en", callbackUrl: "/km/books", host: HOST })).toBeNull();
    expect(inferAuthLocale({ cookie: "km", callbackUrl: "/books", host: HOST })).toBeNull();
  });

  it("the callbackUrl outranks the Referer", () => {
    expect(
      inferAuthLocale({ callbackUrl: "/books", referer: `https://${HOST}/km/books`, host: HOST }),
    ).toBeNull();
  });

  it("does not mistake a path that merely starts with the letters km", () => {
    expect(inferAuthLocale({ callbackUrl: "/kmer-studies", host: HOST })).toBeNull();
    expect(inferAuthLocale({ referer: `https://${HOST}/kmz`, host: HOST })).toBeNull();
  });

  it("ignores another site's Referer, a protocol-relative callback, and garbage", () => {
    expect(inferAuthLocale({ referer: "https://evil.example/km/x", host: HOST })).toBeNull();
    expect(inferAuthLocale({ callbackUrl: "//evil.example/km", host: HOST })).toBeNull();
    expect(inferAuthLocale({ referer: "not a url", host: HOST })).toBeNull();
    expect(inferAuthLocale({})).toBeNull();
  });
});

describe("middleware wiring", () => {
  const src = readFileSync(join(__dirname, "..", "..", "middleware.ts"), "utf8");

  it("infers only for /auth pages, and persists what it inferred", () => {
    expect(src).toMatch(/inferAuthLocale\(/);
    expect(src).toMatch(/pathname\.startsWith\("\/auth\/"\)[\s\S]{0,200}inferAuthLocale/);
    expect(src).toMatch(/request\.cookies\.set\(LOCALE_COOKIE, authLocale\)/);
    expect(src).toMatch(/res\.cookies\.set\(LOCALE_COOKIE, authLocale,/);
  });
});
