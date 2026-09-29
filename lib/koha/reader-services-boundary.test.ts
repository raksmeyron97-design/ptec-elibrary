/**
 * Phase 10.1 promises that are about where code may reach
 * (docs/KOHA-READER-SERVICES.md): a reader renews only their own loan, a
 * renewal is sent once and only through the PTEC Reader Services plugin,
 * every attempt is audited without titles or card numbers, and the panel
 * never presses Renew twice on the reader's behalf.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ACTION = "app/actions/library-loans.ts";
const SERVICES = "lib/koha/reader-services.ts";
const RENEWALS = "lib/koha/renewals.ts";
const PANEL = "components/ui/dashboard/LibraryLoans.tsx";

describe("Koha reader services boundary (Phase 10.1)", () => {
  it("the action takes only a loan number; the reader is the session's, the switch and the rate limit come first", () => {
    const src = code(ACTION);
    expect(src).toMatch(/export async function renewLibraryLoan\(checkoutId: number\): Promise<RenewResult>/);
    expect(src).toMatch(/Number\.isSafeInteger\(checkoutId\)/);
    const at = (s: string) => { const i = src.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i; };
    expect(at("kohaRenewsForReaders()")).toBeLessThan(at("getSessionUser()"));
    expect(at("getSessionUser()")).toBeLessThan(at("rateLimit(`koha-renew:${user.id}`"));
    expect(at("rateLimit(`koha-renew:${user.id}`")).toBeLessThan(at("renewForReader(user.id, checkoutId)"));
  });

  it("the loan must be in the reader's OWN loans, read now, before anything is sent", () => {
    const src = code(SERVICES);
    expect(src).toMatch(/const link = await linkedPatron\(profileId\)/);
    expect(src).toMatch(/loans = await freshLoans\(link\.patronId\)/);
    // The lookup stands alone — no fallback — and a miss is refused at once.
    expect(src).toMatch(/const loan = loans\.find\(\(l\) => l\.checkoutId === checkoutId\);\s*if \(!loan\) \{[^}]*return \{ status: "not_found" \};/);
    expect(src.indexOf("loans.find(")).toBeLessThan(src.indexOf("renewLoan("));
    // The patron sent to Koha is the link's, never anything from the caller.
    expect(src).toMatch(/renewLoan\(getKohaClient\(\), link\.patronId, loan,/);
    expect(src.indexOf("forgetPatron(link.patronId)")).toBeGreaterThan(src.indexOf("renewLoan("));
  });

  it("every attempt is audited — five paths, five records — with Koha's ids and code, never a title or a card", () => {
    const src = code(SERVICES);
    const body = src.slice(src.indexOf("export async function renewForReader("));
    expect(body.match(/await recordRenewal\(/g)).toHaveLength(5);
    const insert = src.slice(src.indexOf('.from("activity_events").insert('), src.indexOf("});", src.indexOf('.from("activity_events").insert(')));
    expect(insert).toMatch(/event_type: "circulation"/);
    expect(insert).not.toMatch(/title|card|name|email/i);
  });

  it("a renewal is sent once, only to the plugin's route, and a timeout is settled by reading", () => {
    const src = code(RENEWALS);
    expect(src.match(/\.write\(/g)).toHaveLength(1);
    expect(src).not.toMatch(/RETRY|sleep\(|for \(let attempt/);
    // Every Koha path this module builds is the plugin's.
    for (const m of src.matchAll(/kohaPath\("([^"]+)"/g)) expect(m[1]).toMatch(/^\/contrib\/ptec\/patrons\//);
    expect(src).toMatch(/const now = await readLoans\(koha, patronId, new Date\(\), opts\.settleSignal\)/);
  });

  it("the loans cache is one per process, so a renewal's forget reaches the route that reads it", () => {
    const src = code("lib/koha/patron-server.ts");
    expect(src).toMatch(/const cache = \(shared\.__ptecKohaPatronCache \?\?= new Map<number, Entry>\(\)\);/);
    expect(src).not.toMatch(/const cache = new Map/);
  });

  it("the panel's 'Check again' re-reads the loans and never presses Renew again", () => {
    const src = code(PANEL);
    const check = src.slice(src.indexOf("const checkAgain ="), src.indexOf("\n  };", src.indexOf("const checkAgain =")));
    expect(check).toMatch(/load\(\)/);
    expect(check).not.toMatch(/renewLibraryLoan/);
    expect(src.match(/renewLibraryLoan\(/g)).toHaveLength(1);
  });
});
