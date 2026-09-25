/**
 * npm run koha:check — is the Koha integration configured and reachable?
 *
 * Read-only: two GET calls that need only the `catalogue` permission. Prints
 * each step and exits 0 only when every check passed. Try it without a Koha:
 *
 *   KOHA_INTEGRATION=mock npm run koha:check
 *
 * Against a real instance, set KOHA_INTEGRATION=read plus KOHA_BASE_URL,
 * KOHA_CLIENT_ID, KOHA_CLIENT_SECRET (and optionally KOHA_LIBRARY_ID) in
 * .env.local. The client secret is never printed.
 */
import { config } from "dotenv";
// tsx does NOT auto-load env like Next.js. .env.local first, then .env —
// the same order the other scripts use.
config({ path: ".env.local" });
config();

import { createKohaClient } from "../lib/koha/client";
import { resolveKohaConfig } from "../lib/koha/config";
import { checkKohaHealth } from "../lib/koha/health";

async function main() {
  const cfg = resolveKohaConfig(process.env);
  console.log(`Koha integration: ${cfg.mode}${cfg.baseUrl ? ` → ${cfg.baseUrl}` : ""}${cfg.libraryId ? ` (library ${cfg.libraryId})` : ""}`);
  for (const w of cfg.warnings) console.log(`  ⚠ ${w}`);

  if (cfg.mode === "off") {
    console.log("  Switched off. Set KOHA_INTEGRATION=mock to try it without a Koha, or =read for a real instance.");
    process.exit(1);
  }
  for (const p of cfg.problems) console.log(`  ✖ ${p}`);

  const health = await checkKohaHealth(cfg, createKohaClient(cfg));
  for (const c of health.checks) console.log(`  ${c.ok ? "✓" : "✖"} ${c.name}: ${c.detail}`);
  console.log(health.ready ? "\nReady." : "\nNot ready — see the ✖ lines above.");
  process.exit(health.ready ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n✖ check crashed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});

export {};
