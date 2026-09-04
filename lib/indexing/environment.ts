/* lib/indexing/environment.ts
 *
 * "Is this process allowed to write verdicts about THAT database's files?"
 *
 * ── The incident ────────────────────────────────────────────────────────────
 *
 * A backfill was started on a developer laptop. `scripts/extract-pdf-text.ts`
 * loads `.env.local` before `.env`, so it took `ZIMA_API_URL` from the dev
 * file (`http://localhost:4000`) while `SUPABASE_SERVICE_ROLE_KEY` in the same
 * shell pointed at PRODUCTION. Every production file URL was then correctly
 * refused by `toAllowedStorageUrl()` as off-allow-list, and the script wrote
 * `unfetchable` for 203 healthy books — into production.
 *
 * Nothing malfunctioned. The SSRF allow-list did its job, the script did its
 * job, the state table recorded what the script observed. The gap was that no
 * layer ever asked whether the storage configuration in this process could
 * possibly describe the files in that database.
 *
 * ── What this module checks ─────────────────────────────────────────────────
 *
 * One question, answered from real rows: take a sample of file URLs the target
 * database actually holds, and run them through the same
 * `toAllowedStorageUrl()` the indexer will use. If none of them resolve, the
 * two halves are pointed at different worlds and the run must abort BEFORE it
 * writes anything.
 *
 * It is deliberately a sample-and-compare rather than a string equality test
 * between `ZIMA_API_URL` and some expected value: the failure is not "the
 * variable is wrong", it is "the allow-list cannot reach this data", and only
 * the data can answer that. A future storage migration that legitimately
 * changes hosts passes this check the moment the rows and the config agree.
 */

import { toAllowedStorageUrl } from "@/lib/zima";

/** How many real file URLs to test before deciding. */
export const PROBE_SAMPLE_SIZE = 25;

export type EnvironmentVerdict = {
  ok: boolean;
  sampled: number;
  resolvable: number;
  /** Hosts seen in the sample, for the operator's error message. */
  hosts: string[];
  /** The allow-list origins this process would accept. */
  allowedHint: string;
  reason?: string;
};

/** Human-readable form of the configured storage host. Never throws. */
function describeAllowList(zimaApiUrl: string | undefined): string {
  if (!zimaApiUrl) return "(ZIMA_API_URL unset)";
  try {
    return new URL(zimaApiUrl).hostname.replace(/^api\./, "");
  } catch {
    return `(ZIMA_API_URL is not a URL: ${zimaApiUrl.slice(0, 60)})`;
  }
}

/** Host of a URL, or a marker for a bare storage key. */
function hostOf(url: string): string {
  if (!url.startsWith("http://") && !url.startsWith("https://")) return "(bare key)";
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "(unparseable)";
  }
}

/**
 * Decide whether this process's storage configuration can describe these URLs.
 *
 * PURE given the sample — the caller fetches the rows — so the rule is
 * testable without a database or a network.
 *
 * A sample containing only bare R2 keys resolves through the legacy presigner
 * rather than the allow-list, which this check cannot evaluate offline; those
 * are excluded from the denominator rather than counted as failures, so a
 * legacy-only collection does not trip the guard.
 */
export function judgeEnvironment(fileUrls: readonly string[]): EnvironmentVerdict {
  const hosts = [...new Set(fileUrls.map(hostOf))].sort();
  /* This is a diagnostic string in the message that explains a refusal, so it
     must never itself throw: a malformed ZIMA_API_URL is exactly the kind of
     misconfiguration this guard exists to report, and crashing while
     describing it would turn a clear abort into a stack trace. */
  const allowedHint = describeAllowList(process.env.ZIMA_API_URL);

  // Bare keys take the legacy R2 presigner path; they are not a verdict about
  // the allow-list either way.
  const httpUrls = fileUrls.filter((u) => u.startsWith("http://") || u.startsWith("https://"));

  if (httpUrls.length === 0) {
    return {
      ok: true,
      sampled: fileUrls.length,
      resolvable: 0,
      hosts,
      allowedHint,
      reason: "no absolute storage URLs in the sample; nothing to verify",
    };
  }

  const resolvable = httpUrls.filter((u) => toAllowedStorageUrl(u) !== null).length;

  if (resolvable === 0) {
    return {
      ok: false,
      sampled: httpUrls.length,
      resolvable: 0,
      hosts,
      allowedHint,
      reason:
        `This process cannot fetch any of the ${httpUrls.length} storage URLs in the target ` +
        `database. Its storage allow-list is built from ZIMA_API_URL (${allowedHint}), and the ` +
        `files live on: ${hosts.join(", ")}. Running would record every record as "unfetchable" ` +
        `— a verdict about this machine's configuration, not about the files.`,
    };
  }

  return { ok: true, sampled: httpUrls.length, resolvable, hosts, allowedHint };
}

/**
 * A one-line label for the database this process is about to write to, safe to
 * print. Never the key, never the full connection string — the Supabase
 * project ref is enough for an operator to tell production from local, and is
 * already visible in every public request the app makes.
 */
export function describeTarget(): { label: string; isProduction: boolean } {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  if (!raw) return { label: "(no SUPABASE URL configured)", isProduction: false };
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    return { label: "(unparseable SUPABASE URL)", isProduction: false };
  }
  const isLocal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host);
  const ref = host.endsWith(".supabase.co") ? host.split(".")[0] : host;
  return {
    label: isLocal ? `LOCAL (${host})` : `REMOTE project ${ref}`,
    isProduction: !isLocal,
  };
}
