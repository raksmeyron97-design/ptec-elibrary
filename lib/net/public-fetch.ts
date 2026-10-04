/**
 * Fetch a web page a librarian pasted — and nothing the server can reach that
 * the public internet cannot.
 *
 * Production is a container on the ZimaOS box (lib/client-ip.ts), on the same
 * LAN as the box's admin UI, Koha's staff interface and the local Ollama. A
 * URL from a form that the server fetches is SSRF-shaped, and "it is only an
 * admin" is not a control. So:
 *
 *   • http(s) on the default ports only, no credentials in the URL;
 *   • every address is checked AT CONNECT TIME, in the socket's own DNS
 *     lookup — a name that resolves to a public address when validated and a
 *     private one when connected (DNS rebinding) never gets a socket;
 *   • an IP-literal host (which skips DNS) is checked before connecting;
 *   • redirects are followed by hand, at most MAX_HOPS, each hop re-checked;
 *   • the body is read to MAX_BYTES after decompression, and no further;
 *   • only HTML is accepted.
 *
 * Unlike lib/isbn/cover-source.ts this cannot be an allow-list of hosts — any
 * publisher's page is fair game — so the address rule is the allow-list.
 */
import "server-only";
import { BlockList, isIP } from "node:net";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import type { Readable } from "node:stream";

export const MAX_HOPS = 4;
export const MAX_BYTES = 3 * 1024 * 1024;

// Everything that is not ordinary public unicast (IANA special-purpose
// registries). Mapped and embedded IPv4 forms are unwrapped before the check.
const BLOCKED = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) BLOCKED.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 128], ["::1", 128], ["::", 96], ["64:ff9b::", 96], ["64:ff9b:1::", 48], ["100::", 64],
  ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) BLOCKED.addSubnet(net, bits, "ipv6");

/** The IPv4 address inside an IPv4-mapped IPv6 address (::ffff:a.b.c.d or ::ffff:0a00:0001). */
function mappedV4(ip: string): string | null {
  const m = /^::ffff:(?:0:)?(.+)$/i.exec(ip);
  if (!m) return null;
  if (isIP(m[1]) === 4) return m[1];
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(m[1]);
  if (!hex) return null;
  const [hi, lo] = [parseInt(hex[1], 16), parseInt(hex[2], 16)];
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

/** True only for an ordinary, globally routable unicast address. */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return false;
  if (family === 4) return !BLOCKED.check(ip, "ipv4");
  const v4 = mappedV4(ip);
  if (v4) return isPublicAddress(v4);
  return !BLOCKED.check(ip, "ipv6");
}

export type PublicUrlCheck = { ok: true; url: URL } | { ok: false; reason: "invalid_url" | "blocked_address" };

/** The shape rules, before any network: scheme, port, credentials, literal addresses. */
export function checkPublicUrl(raw: string): PublicUrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "invalid_url" };
  if (url.username || url.password) return { ok: false, reason: "invalid_url" };
  if (url.port && !((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80"))) {
    return { ok: false, reason: "blocked_address" };
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, reason: "blocked_address" };
  }
  if (isIP(host) && !isPublicAddress(host)) return { ok: false, reason: "blocked_address" };
  // A bare single label ("intranet", "koha") only resolves on a private network.
  if (!isIP(host) && !host.includes(".")) return { ok: false, reason: "blocked_address" };
  return { ok: true, url };
}

class BlockedAddressError extends Error {
  code = "EPTECBLOCKED";
}

/** dns.lookup, refusing the connection unless every address it returns is public. */
function publicOnlyLookup(
  hostname: string,
  options: object,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((a) => !isPublicAddress(a.address))) {
      return callback(new BlockedAddressError(`${hostname} resolves to a non-public address`), "");
    }
    // Node asks with all:true on modern versions (autoSelectFamily); honour both shapes.
    if ((options as { all?: boolean }).all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

export type PublicFetchResult =
  | { ok: true; status: number; finalUrl: string; contentType: string; body: string }
  | {
      ok: false;
      reason: "invalid_url" | "blocked_address" | "too_many_redirects" | "timeout" | "unreachable" | "too_large" | "not_html" | "http";
      status?: number;
    };

type Raw = { status: number; headers: http.IncomingHttpHeaders; stream: Readable };

function request(url: URL, userAgent: string, signal: AbortSignal): Promise<Raw> {
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      url,
      {
        method: "GET",
        lookup: publicOnlyLookup as never,
        signal,
        agent: false, // no pooled socket from an earlier, differently-resolved request
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en;q=0.9, *;q=0.5",
        },
      },
      (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, stream: res }),
    );
    req.on("error", reject);
    req.end();
  });
}

function decoded(raw: Raw): Readable {
  const enc = String(raw.headers["content-encoding"] ?? "").toLowerCase().trim();
  if (enc === "gzip" || enc === "x-gzip") return raw.stream.pipe(zlib.createGunzip());
  if (enc === "deflate") return raw.stream.pipe(zlib.createInflate());
  if (enc === "br") return raw.stream.pipe(zlib.createBrotliDecompress());
  return raw.stream;
}

/** Read at most `max` bytes AFTER decompression — a small gzip can expand without bound. */
async function readCapped(stream: Readable, max: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += (chunk as Buffer).length;
    if (size > max) {
      stream.destroy();
      return null;
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

function charsetOf(contentType: string): string {
  const m = /charset\s*=\s*"?([\w-]+)/i.exec(contentType);
  const label = (m?.[1] ?? "utf-8").toLowerCase();
  try {
    new TextDecoder(label);
    return label;
  } catch {
    return "utf-8";
  }
}

export async function fetchPublicHtml(
  raw: string,
  o: { userAgent: string; timeoutMs?: number; maxBytes?: number },
): Promise<PublicFetchResult> {
  const first = checkPublicUrl(raw);
  if (!first.ok) return first;
  const signal = AbortSignal.timeout(o.timeoutMs ?? 10_000);

  let url = first.url;
  for (let hop = 0; ; hop++) {
    let res: Raw;
    try {
      res = await request(url, o.userAgent, signal);
    } catch (err) {
      if (err instanceof BlockedAddressError) return { ok: false, reason: "blocked_address" };
      const name = err instanceof Error ? err.name : "";
      return { ok: false, reason: name === "AbortError" || name === "TimeoutError" || signal.aborted ? "timeout" : "unreachable" };
    }

    if (res.status >= 300 && res.status < 400) {
      res.stream.resume(); // discard the redirect body
      const location = res.headers.location;
      if (!location) return { ok: false, reason: "http", status: res.status };
      if (hop + 1 >= MAX_HOPS) return { ok: false, reason: "too_many_redirects" };
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        return { ok: false, reason: "invalid_url" };
      }
      const checked = checkPublicUrl(next.toString());
      if (!checked.ok) return checked;
      url = checked.url;
      continue;
    }

    const contentType = String(res.headers["content-type"] ?? "");
    if (res.status < 200 || res.status >= 300) {
      res.stream.resume();
      return { ok: false, reason: "http", status: res.status };
    }
    if (!/^\s*(text\/html|application\/xhtml\+xml)/i.test(contentType)) {
      res.stream.resume();
      return { ok: false, reason: "not_html", status: res.status };
    }
    const declared = Number(res.headers["content-length"]);
    if (Number.isFinite(declared) && declared > (o.maxBytes ?? MAX_BYTES)) {
      res.stream.destroy();
      return { ok: false, reason: "too_large" };
    }
    let bytes: Buffer | null;
    try {
      bytes = await readCapped(decoded(res), o.maxBytes ?? MAX_BYTES);
    } catch {
      return { ok: false, reason: signal.aborted ? "timeout" : "unreachable" };
    }
    if (!bytes) return { ok: false, reason: "too_large" };
    const body = new TextDecoder(charsetOf(contentType)).decode(bytes);
    return { ok: true, status: res.status, finalUrl: url.toString(), contentType, body };
  }
}
