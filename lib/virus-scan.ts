/**
 * Malware reputation check via the VirusTotal public API — a hash lookup
 * against files other people have already submitted, NOT a full behavioral
 * scan of this specific upload. This catches known-malware signatures
 * (the overwhelming majority of real-world malware, since samples get
 * reused/shared) but a brand-new, never-before-seen malicious file will
 * come back "unknown", not "clean". Treat this as one layer, not a
 * guarantee — there is no deeper scanning infra in this codebase.
 *
 * Requires VIRUSTOTAL_API_KEY (free tier: virustotal.com/gui/join-us).
 *
 * Failure posture is a switch, and every skip is loud either way:
 * - Default (fail open): a missing key, timeout, or API error lets the
 *   upload proceed but logs `virus_scan_skipped` / `virus_scan_error` —
 *   same posture as the DB-backed rate limiter in lib/rate-limit.ts
 *   ("fail open, log the outage"), and ALERT-CATALOG.md's malware-upload
 *   entry watches both events.
 * - FAIL_CLOSED_VIRUS_SCAN=true: an upload whose scan could not COMPLETE is
 *   rejected by the caller (app/api/admin/upload/route.ts). Note the
 *   distinction `scanned` encodes: a VT 404 ("hash unknown to the corpus")
 *   IS a completed scan and is never rejected — only lookups that could not
 *   run at all (no key, timeout, HTTP error) trip fail-closed.
 */

import { logSecurityEvent } from "@/lib/security-log";

const VT_API_BASE = "https://www.virustotal.com/api/v3";
const TIMEOUT_MS = 5000;

export type ScanVerdict = "clean" | "malicious" | "unknown";

export interface ScanResult {
  verdict: ScanVerdict;
  detections?: number;
  /** True when VirusTotal actually answered (a 404 "not in corpus" counts). */
  scanned: boolean;
}

/** Strict enforcement switch: reject uploads whose scan could not complete. */
export function isVirusScanFailClosed(): boolean {
  return process.env.FAIL_CLOSED_VIRUS_SCAN === "true";
}

export async function checkFileHashReputation(sha256: string): Promise<ScanResult> {
  const apiKey = process.env.VIRUSTOTAL_API_KEY;
  if (!apiKey) {
    logSecurityEvent({
      type: "virus_scan_skipped",
      where: "checkFileHashReputation",
      detail: "VIRUSTOTAL_API_KEY not configured — upload not scanned",
    });
    return { verdict: "unknown", scanned: false };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${VT_API_BASE}/files/${sha256}`, {
      headers: { "x-apikey": apiKey },
      signal: controller.signal,
    });

    // Not in VT's corpus — neither cleared nor flagged, but the scan itself
    // completed, so fail-closed mode must not reject this.
    if (res.status === 404) return { verdict: "unknown", scanned: true };
    if (!res.ok) {
      logSecurityEvent({ type: "virus_scan_error", where: "checkFileHashReputation", detail: `VirusTotal returned HTTP ${res.status}` });
      return { verdict: "unknown", scanned: false };
    }

    const json = await res.json();
    const stats = json?.data?.attributes?.last_analysis_stats as { malicious?: number } | undefined;
    const malicious = stats?.malicious ?? 0;
    return malicious > 0
      ? { verdict: "malicious", detections: malicious, scanned: true }
      : { verdict: "clean", scanned: true };
  } catch (err) {
    logSecurityEvent({ type: "virus_scan_error", where: "checkFileHashReputation", detail: err instanceof Error ? err.message : "unknown error" });
    return { verdict: "unknown", scanned: false };
  } finally {
    clearTimeout(timer);
  }
}
