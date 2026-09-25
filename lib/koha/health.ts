/**
 * "Is the Koha integration working, and if not, which step failed?"
 *
 * One answer for the connection-check script (npm run koha:check) and, from
 * Phase 2, the /admin/integrations/koha page. Each step is reported on its own
 * so a librarian sees "the library code PTEC does not exist in Koha", not
 * "something went wrong". Read-only: it calls two GET endpoints that need only
 * the `catalogue` permission.
 */
import type { KohaClient } from "./client";
import type { KohaConfig } from "./config";
import { KohaError } from "./errors";
import { isKohaLibraryList, isKohaVersion } from "./types";

export type KohaCheck = {
  name: "version" | "libraries" | "library";
  ok: boolean;
  detail: string;
};

export type KohaHealth = {
  mode: KohaConfig["mode"];
  /** True only when every check that ran passed and nothing blocks the configuration. */
  ready: boolean;
  problems: string[];
  warnings: string[];
  checks: KohaCheck[];
  version: string | null;
};

const reason = (e: unknown) => (e instanceof KohaError ? e.message : "Unexpected error.");

export async function checkKohaHealth(cfg: KohaConfig, client: KohaClient): Promise<KohaHealth> {
  const base = { mode: cfg.mode, problems: [...cfg.problems], warnings: [...cfg.warnings] };
  if (cfg.mode === "off" || cfg.problems.length > 0) {
    return { ...base, ready: false, checks: [], version: null };
  }

  const checks: KohaCheck[] = [];
  let version: string | null = null;

  // Proves the token AND the `catalogue` permission. /status/version is 26.05+;
  // an older Koha answers 404, which says "older than planned", not "broken".
  try {
    const r = await client.get("/status/version", isKohaVersion);
    version = r.data.version;
    checks.push({ name: "version", ok: true, detail: `Koha ${r.data.maintenance}` });
  } catch (e) {
    const older = e instanceof KohaError && e.kind === "not_found";
    checks.push({
      name: "version",
      ok: older,
      detail: older ? "No /status/version — this Koha is older than 26.05." : reason(e),
    });
    // Without a token or a reachable Koha, the rest can only repeat the same failure.
    if (!older) return { ...base, ready: false, checks, version };
  }

  try {
    const r = await client.get("/libraries", isKohaLibraryList, { query: { _per_page: 100 } });
    checks.push({ name: "libraries", ok: r.data.length > 0, detail: `${r.total ?? r.data.length} librar${(r.total ?? r.data.length) === 1 ? "y" : "ies"} defined` });
    if (cfg.libraryId) {
      const found = r.data.find((l) => l.library_id === cfg.libraryId);
      checks.push({
        name: "library",
        ok: Boolean(found),
        detail: found
          ? `Library code "${cfg.libraryId}" is ${found.name}`
          : `Library code "${cfg.libraryId}" does not exist in Koha — check KOHA_LIBRARY_ID against Administration › Libraries.`,
      });
    }
  } catch (e) {
    checks.push({ name: "libraries", ok: false, detail: reason(e) });
  }

  return { ...base, ready: checks.every((c) => c.ok), checks, version };
}
