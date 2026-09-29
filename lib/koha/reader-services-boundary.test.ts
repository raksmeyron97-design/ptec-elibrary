/**
 * Phase 10 promises that are about where code may reach
 * (docs/KOHA-READER-SERVICES.md): a reader renews only their own loan and
 * cancels only their own hold, a hold is placed on a record the SERVER
 * resolved, every act is sent once and only through the PTEC Reader Services
 * plugin, every attempt is audited without titles, slugs or card numbers, and
 * no screen presses a button twice on the reader's behalf.
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
const HOLDS = "lib/koha/holds.ts";
const ISLAND = "components/ui/books/CatalogHoldAction.tsx";
const PAGE = "app/[locale]/(public)/catalogs/[slug]/page.tsx";
const fn = (src: string, name: string) => {
  const start = src.indexOf(`export async function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const next = src.indexOf("\nexport ", start + 1);
  return next < 0 ? src.slice(start) : src.slice(start, next);
};

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

describe("Koha reader services boundary (Phase 10.2 — holds)", () => {
  it("the actions take only a slug or a hold number; the switch, the session and ONE hold budget come first", () => {
    const src = code(ACTION);
    expect(src).toMatch(/export async function placeLibraryHold\(slug: string\): Promise<HoldResult>/);
    expect(src).toMatch(/export async function cancelLibraryHold\(holdId: number\): Promise<HoldResult>/);
    expect(src).toMatch(/Number\.isSafeInteger\(holdId\)/);
    const gate = src.slice(src.indexOf("async function holdingReader("));
    const at = (s: string) => { const i = gate.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i; };
    expect(at("kohaHoldsForReaders()")).toBeLessThan(at("getSessionUser()"));
    expect(at("getSessionUser()")).toBeLessThan(at("rateLimit(`koha-hold:${user.id}`"));
    // Placing and cancelling share the bucket: no place/cancel loop churning a queue.
    expect(src.match(/rateLimit\(`koha-hold:/g)).toHaveLength(1);
    expect(fn(src, "placeLibraryHold")).toMatch(/holdingReader\("placeLibraryHold"\)[\s\S]*placeHoldForReader\(reader\.id, slug\.trim\(\)\)/);
    expect(fn(src, "cancelLibraryHold")).toMatch(/holdingReader\("cancelLibraryHold"\)[\s\S]*cancelHoldForReader\(reader\.id, holdId\)/);
  });

  it("holds are on only with live availability as well as the switch", () => {
    expect(code("lib/koha/patron-server.ts")).toMatch(
      /export const kohaHoldsForReaders = \(\) => kohaCanHoldForReaders\(getKohaConfig\(\)\) && catalogAvailabilityIsLive\(\);/);
  });

  it("a hold is placed on the record the SERVER resolved from the slug, for the LINKED patron", () => {
    const place = fn(code(SERVICES), "placeHoldForReader");
    expect(place).toMatch(/const title = await holdableRecord\(slug\)/);
    expect(place).toMatch(/const link = await linkedPatron\(profileId\)/);
    expect(place).toMatch(/placeHold\(getKohaClient\(\), link\.patronId, title\.biblioId, before,/);
    expect(place.indexOf("before.find(")).toBeLessThan(place.indexOf("placeHold("));
    expect(place.indexOf("forgetPatron(link.patronId)")).toBeGreaterThan(place.indexOf("placeHold("));
    // holdableRecord answers only for a listed record the sync linked to Koha.
    const holdable = code("lib/koha/patron-server.ts").slice(code("lib/koha/patron-server.ts").indexOf("export async function holdableRecord("));
    expect(holdable).toMatch(/\.eq\("slug", slug\)\.eq\("is_active", true\)/);
  });

  it("a hold is cancelled only if it is in the reader's OWN holds, read now", () => {
    const cancel = fn(code(SERVICES), "cancelHoldForReader");
    expect(cancel).toMatch(/holds = await freshHolds\(link\.patronId\)/);
    // The lookup stands alone — no fallback — and a miss is audited and refused at once.
    expect(cancel).toMatch(/const hold = holds\.find\(\(h\) => h\.holdId === holdId\);\s*if \(!hold\) \{\s*await audit\([^;]*\);\s*return \{ status: "not_found" \};/);
    expect(cancel.indexOf("holds.find(")).toBeLessThan(cancel.indexOf("cancelHold("));
    expect(cancel).toMatch(/cancelHold\(getKohaClient\(\), link\.patronId, hold,/);
  });

  it("every attempt is audited, and nothing but Koha's numbers rides along — no title, no slug", () => {
    const src = code(SERVICES);
    expect(fn(src, "placeHoldForReader").match(/await audit\(/g)).toHaveLength(7);
    expect(fn(src, "cancelHoldForReader").match(/await audit\(/g)).toHaveLength(6);
    // The slug is used to FIND the record, and goes nowhere else.
    expect([...src.matchAll(/\bslug\b/g)].length).toBe(2);
    expect(src).toMatch(/placeHoldForReader\(profileId: string, slug: string\)/);
    expect(src).toMatch(/holdableRecord\(slug\)/);
    // Every key an audit call writes is Koha's id, Koha's code, or how it ended.
    for (const m of src.matchAll(/\b(koha_[a-z_]+|confirmed_after_timeout|outcome):/g)) {
      expect(["koha_patron_id", "koha_checkout_id", "koha_item_id", "koha_biblio_id", "koha_hold_id", "confirmed_after_timeout", "outcome"]).toContain(m[1]);
    }
  });

  it("a hold is placed or cancelled once, only through the plugin, and a timeout is settled by reading", () => {
    const src = code(HOLDS);
    expect(src.match(/\.write\(/g)).toHaveLength(2);
    expect(src).not.toMatch(/RETRY|sleep\(|for \(let attempt/);
    for (const m of src.matchAll(/kohaPath\("([^"]+)"/g)) expect(m[1]).toMatch(/^\/contrib\/ptec\/patrons\//);
    expect(src.match(/readHolds\(koha, patronId, opts\.settleSignal\)/g)).toHaveLength(2);
  });

  it("the page offers a hold only on a Koha title with no copy on the shelf, and hands the island nothing but the slug", () => {
    const src = code(PAGE);
    expect(src).toMatch(/const offerHold = b\.koha_biblio_id != null && titleMayBeHeld\(stats\) && kohaHoldsForReaders\(\);/);
    expect(src).toMatch(/\{offerHold && <CatalogHoldAction slug=\{b\.slug\} \/>\}/);
  });

  it("no screen sends a hold twice: 'Check again' re-reads, and each act has one call site", () => {
    const panel = code(PANEL);
    expect(panel.match(/cancelLibraryHold\(/g)).toHaveLength(1);
    const again = panel.slice(panel.indexOf("const checkHoldAgain ="), panel.indexOf("\n  };", panel.indexOf("const checkHoldAgain =")));
    expect(again).toMatch(/load\(\)/);
    expect(again).not.toMatch(/cancelLibraryHold/);
    const island = code(ISLAND);
    expect(island.match(/placeLibraryHold\(/g)).toHaveLength(1);
    const check = island.slice(island.indexOf("const checkAgain ="), island.indexOf("\n  };", island.indexOf("const checkAgain =")));
    expect(check).toMatch(/load\(\)/);
    expect(check).not.toMatch(/placeLibraryHold/);
  });
});
