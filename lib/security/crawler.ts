import "server-only";
import { promises as dns } from "node:dns";

/**
 * Verify that a request genuinely comes from a Google crawler (Googlebot,
 * Google Scholar, etc.), using Google's own documented method:
 *   https://developers.google.com/search/docs/crawling-indexing/verifying-googlebot
 *
 * A User-Agent string is NOT proof — anyone can send `User-Agent: Googlebot`.
 * Verification is: reverse-DNS the client IP → the hostname must be under a
 * Google crawler domain → forward-resolve that hostname → it must map back to
 * the same IP. Both steps are required; the forward-confirm defeats a spoofed
 * PTR record.
 *
 * The User-Agent is used only as a cheap pre-filter so ordinary anonymous
 * humans never trigger the DNS work — a spoofed UA still fails the DNS proof.
 */

const GOOGLE_CRAWLER_DOMAINS = ["googlebot.com", "google.com", "googleusercontent.com"];

// Google's crawler user-agents (Googlebot, Scholar, Inspection Tool, etc.).
const GOOGLE_UA_RE =
  /googlebot|mediapartners-google|adsbot-google|storebot-google|google-inspectiontool|google-extended|googleother|apis-google|feedfetcher-google|google\s*scholar|scholar\.google/i;

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — a crawler holds an IP far longer
const CACHE_MAX = 10_000; // bound memory against spoofed-UA floods
const cache = new Map<string, { verified: boolean; expires: number }>();

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("dns-timeout")), ms)),
  ]);
}

export async function isVerifiedGoogleCrawler(
  ip: string | null | undefined,
  userAgent: string | null | undefined,
): Promise<boolean> {
  if (!ip || !userAgent) return false;
  if (!GOOGLE_UA_RE.test(userAgent)) return false;

  const cached = cache.get(ip);
  if (cached && cached.expires > Date.now()) return cached.verified;

  let verified = false;
  try {
    const hostnames = await withTimeout(dns.reverse(ip), 2000);
    const host = hostnames.find((h) => {
      const lower = h.toLowerCase().replace(/\.$/, "");
      return GOOGLE_CRAWLER_DOMAINS.some((d) => lower === d || lower.endsWith(`.${d}`));
    });
    if (host) {
      const forward = await withTimeout(dns.lookup(host, { all: true }), 2000);
      verified = forward.some((a) => a.address === ip);
    }
  } catch {
    verified = false;
  }

  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(ip, { verified, expires: Date.now() + CACHE_TTL_MS });
  return verified;
}
