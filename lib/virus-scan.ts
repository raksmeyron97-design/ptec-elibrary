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
 * Fails open on a missing key, timeout, or any API error — logged via
 * logSecurityEvent, never blocking the upload — same posture as the
 * DB-backed rate limiter in lib/rate-limit.ts ("fail open, log the outage").
 */

import { logSecurityEvent } from "@/lib/security-log";

const VT_API_BASE = "https://www.virustotal.com/api/v3";
const TIMEOUT_MS = 5000;

export type ScanVerdict = "clean" | "malicious" | "unknown";

export async function checkFileHashReputation(
  sha256: string,
): Promise<{ verdict: ScanVerdict; detections?: number }> {
  const apiKey = process.env.VIRUSTOTAL_API_KEY;
  if (!apiKey) return { verdict: "unknown" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${VT_API_BASE}/files/${sha256}`, {
      headers: { "x-apikey": apiKey },
      signal: controller.signal,
    });

    if (res.status === 404) return { verdict: "unknown" }; // not in VT's corpus — neither cleared nor flagged
    if (!res.ok) {
      logSecurityEvent({ type: "virus_scan_error", where: "checkFileHashReputation", detail: `VirusTotal returned HTTP ${res.status}` });
      return { verdict: "unknown" };
    }

    const json = await res.json();
    const stats = json?.data?.attributes?.last_analysis_stats as { malicious?: number } | undefined;
    const malicious = stats?.malicious ?? 0;
    return malicious > 0 ? { verdict: "malicious", detections: malicious } : { verdict: "clean" };
  } catch (err) {
    logSecurityEvent({ type: "virus_scan_error", where: "checkFileHashReputation", detail: err instanceof Error ? err.message : "unknown error" });
    return { verdict: "unknown" };
  } finally {
    clearTimeout(timer);
  }
}
