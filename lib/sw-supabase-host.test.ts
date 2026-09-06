import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Rule 8 of the service worker caches anonymous public-table reads from
 * Supabase. It used to match `url.hostname.endsWith("supabase.co")`, which
 * silently stops matching the moment Supabase moves to
 * supabase.storage-ptec.online — no error, just a dead cache rule. The host
 * must come from the same helper the CSP uses, and the fallback must never
 * throw when the env is absent at build time.
 */
describe("service worker Supabase host match", () => {
  const sw = fs.readFileSync(path.join(__dirname, "..", "app/sw.ts"), "utf8");

  it("derives the host from lib/supabase/origin, not a literal", () => {
    expect(sw).toContain('from "@/lib/supabase/origin"');
    expect(sw).toContain("isSupabaseHost(url.hostname, SUPABASE_HOST)");
    expect(sw).not.toMatch(/hostname\.endsWith\("supabase\.co"\)/);
  });

  it("tolerates a missing NEXT_PUBLIC_SUPABASE_URL at build time", () => {
    expect(sw).toContain("supabaseOrigins(process.env.NEXT_PUBLIC_SUPABASE_URL)?.host ?? null");
  });
});
