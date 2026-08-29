import { describe, it, expect, vi, beforeEach } from "vitest";

const { reverse, lookup } = vi.hoisted(() => ({ reverse: vi.fn(), lookup: vi.fn() }));
vi.mock("node:dns", () => ({
  default: { promises: { reverse, lookup } },
  promises: { reverse, lookup },
}));

import { isVerifiedGoogleCrawler } from "./crawler";

describe("isVerifiedGoogleCrawler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false for a non-Google user agent without doing any DNS", async () => {
    expect(await isVerifiedGoogleCrawler("66.249.66.1", "Mozilla/5.0 (Windows)")).toBe(false);
    expect(reverse).not.toHaveBeenCalled();
  });

  it("returns false when ip or user-agent is missing", async () => {
    expect(await isVerifiedGoogleCrawler(null, "Googlebot/2.1")).toBe(false);
    expect(await isVerifiedGoogleCrawler("66.249.66.1", null)).toBe(false);
    expect(reverse).not.toHaveBeenCalled();
  });

  it("verifies a genuine Googlebot via rDNS + forward-confirm", async () => {
    reverse.mockResolvedValue(["crawl-66-249-66-2.googlebot.com"]);
    lookup.mockResolvedValue([{ address: "66.249.66.2", family: 4 }]);
    expect(await isVerifiedGoogleCrawler("66.249.66.2", "Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe(true);
  });

  it("verifies a Google Scholar crawler on a google.com host", async () => {
    reverse.mockResolvedValue(["scholar.google.com"]);
    lookup.mockResolvedValue([{ address: "66.249.79.3", family: 4 }]);
    expect(await isVerifiedGoogleCrawler("66.249.79.3", "Mozilla/5.0 (compatible; Google Scholar)")).toBe(true);
  });

  it("rejects a spoofed PTR whose forward lookup resolves to a different IP", async () => {
    reverse.mockResolvedValue(["totally.googlebot.com"]);
    lookup.mockResolvedValue([{ address: "1.2.3.4", family: 4 }]);
    expect(await isVerifiedGoogleCrawler("203.0.113.50", "Googlebot/2.1")).toBe(false);
  });

  it("rejects a reverse hostname that is not a Google crawler domain", async () => {
    reverse.mockResolvedValue(["host.evil-googlebot.com.attacker.net"]);
    expect(await isVerifiedGoogleCrawler("198.51.100.7", "Googlebot/2.1")).toBe(false);
  });

  it("rejects a look-alike suffix (evilgooglebot.com)", async () => {
    reverse.mockResolvedValue(["evilgooglebot.com"]);
    expect(await isVerifiedGoogleCrawler("198.51.100.8", "Googlebot/2.1")).toBe(false);
  });

  it("returns false when the reverse lookup throws", async () => {
    reverse.mockRejectedValue(new Error("ENOTFOUND"));
    expect(await isVerifiedGoogleCrawler("198.51.100.9", "Googlebot/2.1")).toBe(false);
  });
});
