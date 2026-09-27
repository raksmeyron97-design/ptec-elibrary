/**
 * Phase 7/8 promises that are about where code may reach (docs/KOHA-PATRONS.md):
 * a reader sees only their own loans, patron data is read, never written, a
 * failed read is never "no loans", and a link is Koha's answer, not the browser's.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const fn = (src: string, name: string) => {
  const start = src.indexOf(`export async function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const next = src.slice(start + 10).search(/\nexport /);
  return next < 0 ? src.slice(start) : src.slice(start, start + 10 + next);
};
const ROUTE = "app/api/me/library-loans/route.ts";
const SERVER = "lib/koha/patron-server.ts";
const ACTIONS = "app/(admin)/admin/(protected)/catalogs/library-cards/actions.ts";

describe("Koha patron boundary", () => {
  it("the reader route takes no id: the reader is the session's, the patron is THEIR link", () => {
    const src = code(ROUTE);
    expect(src).toMatch(/export async function GET\(\)/);
    expect(src).toMatch(/getSessionUser\(\)/);
    expect(src).toMatch(/myLibrary\(user\.id\)/);
    expect(src).toMatch(/private, no-store/);
    expect(code(SERVER)).toMatch(/\.from\("koha_patron_links"\)\.select\("koha_patron_id, card_hint"\)\.eq\("profile_id", profileId\)/);
  });

  it("patron data is read, never written: no Koha write, no patron data stored", () => {
    for (const f of ["lib/koha/patrons.ts", SERVER, ACTIONS]) expect(code(f), f).not.toMatch(/\.write\(/);
    // The only table the patron code writes is the link itself.
    const writes = [...code(SERVER).matchAll(/\.from\("(\w+)"\)[^;]*?\.(insert|update|upsert|delete)\(/g), ...code(ACTIONS).matchAll(/\.from\("(\w+)"\)[^;]*?\.(insert|update|upsert|delete)\(/g)];
    expect(new Set(writes.map((m) => m[1]))).toEqual(new Set(["koha_patron_links"]));
  });

  it("a failed Koha read is 'unavailable', never an empty list of loans", () => {
    const src = code(SERVER);
    expect(src).toMatch(/catch \{\s*return \{ state: "unavailable", cardHint: link\.card_hint \};/);
    // And the panel says so, in its own branch, before anything could render "no loans".
    const panel = code("components/ui/dashboard/LibraryLoans.tsx");
    expect(panel.indexOf('data.state === "unavailable"')).toBeGreaterThan(-1);
    expect(panel.indexOf('data.state === "unavailable"')).toBeLessThan(panel.indexOf('t("noLoans")'));
  });

  it("every desk action asks the registry first; a link is re-verified with Koha, not taken from the browser", () => {
    const src = code(ACTIONS);
    for (const name of ["findReader", "findCard", "linkCard", "unlinkCard"]) {
      const body = fn(src, name);
      expect(body.indexOf('requireAction("catalog.library-cards.manage")'), name).toBeGreaterThan(-1);
      expect(body.indexOf("requireAction("), name).toBeLessThan(Math.max(body.indexOf("createServiceClient("), body.indexOf("lookupCard(")));
    }
    const link = fn(src, "linkCard");
    expect(link).toMatch(/linkCard\(profileId: string, cardnumber: string\)/); // no patron id parameter
    expect(link.indexOf("lookupCard(")).toBeLessThan(link.indexOf(".insert("));
    expect(src).toMatch(/logAdminAction\(userId, "koha_card_link"/);
    expect(src).toMatch(/logAdminAction\(userId, "koha_card_unlink"/);
    expect(src).toMatch(/logAdminAction\(userId, "koha_card_lookup"/);
    // Audited by the card's last four characters, never the whole number.
    expect(src).not.toMatch(/logAdminAction\([^)]*cardnumber[^)]*\)/);
  });

  it("the link table is closed to browsers", () => {
    const sql = read("supabase/migrations/0159_koha_patron_links.sql").toLowerCase();
    expect(sql).toMatch(/alter table public\.koha_patron_links enable row level security/);
    expect(sql).toMatch(/revoke all on public\.koha_patron_links from public, anon, authenticated/);
  });

  it("KOHA_READ_PATRONS is documented", () => {
    expect(read(".env.example")).toMatch(/^# KOHA_READ_PATRONS=/m);
  });
});
