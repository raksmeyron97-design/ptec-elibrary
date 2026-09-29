/**
 * Phase 10.2 — a reader places a hold and cancels their own
 * (docs/KOHA-READER-SERVICES.md), through the REAL client against the mock,
 * which answers as the PTEC Reader Services plugin's Controller.pm does on
 * Koha 26.05.03.
 */
import { describe, it, expect } from "vitest";
import { createKohaClient } from "./client";
import { KohaError } from "./errors";
import { kohaCanHoldForReaders, resolveKohaConfig } from "./config";
import { createMockKoha } from "./mock";
import { cancelHold, placeHold } from "./holds";
import { readHolds } from "./patrons";
import { computeCopyStats, titleMayBeHeld } from "@/lib/catalog";
import { holdMessageKey } from "@/lib/dashboard/library-loans";

const A = { patron_id: 42, cardnumber: "0803" };
const B = { patron_id: 43, cardnumber: "0804" };
const holds = () => [
  { hold_id: 1, patron_id: 42, biblio_id: 501, status: null, priority: 2 }, // in the queue
  { hold_id: 2, patron_id: 42, biblio_id: 502, status: "W", priority: 0 }, // waiting on the hold shelf
  { hold_id: 3, patron_id: 42, biblio_id: 503, status: "T", priority: 0 }, // in transit
  { hold_id: 4, patron_id: 42, biblio_id: 504, status: "W", priority: 0, cancellation_requestable: false },
  { hold_id: 9, patron_id: 43, biblio_id: 501, status: null, priority: 1 }, // someone else's
];

function setup(opts: Parameters<typeof createMockKoha>[0] = {}) {
  const mock = createMockKoha({
    patrons: [A, B], holds: holds(), readerServices: "on",
    holdable: { 600: "out", 601: "on_shelf", 602: "tooManyReserves", 603: "expired" },
    ...opts,
  });
  const koha = createKohaClient(resolveKohaConfig({ KOHA_INTEGRATION: "mock" }), { fetch: mock.fetch, sleep: async () => {} });
  const writes = () => mock.calls.filter((c) => (c.method === "POST" || c.method === "DELETE") && c.path.includes("/holds"));
  return { mock, koha, writes };
}

describe("the switch", () => {
  it("holds need write (or mock), patron reads AND KOHA_READER_HOLDS=on — renewals are a different switch", () => {
    const on = { KOHA_INTEGRATION: "mock", KOHA_READ_PATRONS: "on", KOHA_READER_HOLDS: "on" };
    expect(kohaCanHoldForReaders(resolveKohaConfig(on))).toBe(true);
    expect(kohaCanHoldForReaders(resolveKohaConfig({ ...on, KOHA_READER_HOLDS: "" }))).toBe(false);
    expect(kohaCanHoldForReaders(resolveKohaConfig({ ...on, KOHA_READER_HOLDS: "", KOHA_READER_RENEWALS: "on" }))).toBe(false);
    expect(kohaCanHoldForReaders(resolveKohaConfig({ ...on, KOHA_READ_PATRONS: "" }))).toBe(false);
    const read = resolveKohaConfig({ ...on, KOHA_INTEGRATION: "read", KOHA_BASE_URL: "http://koha:8081", KOHA_CLIENT_ID: "x", KOHA_CLIENT_SECRET: "y" });
    expect(kohaCanHoldForReaders(read)).toBe(false);
    expect(read.warnings.join(" ")).toMatch(/KOHA_READER_HOLDS=on does nothing unless KOHA_INTEGRATION=write/);
  });

  it("the page offers a hold only when NO copy is on the shelf and one will come back", () => {
    const stats = (...s: string[]) => computeCopyStats(s.map((status) => ({ status })));
    expect(titleMayBeHeld(stats("on_loan", "on_loan"))).toBe(true);
    expect(titleMayBeHeld(stats("reserved"))).toBe(true);
    expect(titleMayBeHeld(stats("on_loan", "available"))).toBe(false); // borrow the one on the shelf
    expect(titleMayBeHeld(stats("reference_only"))).toBe(false); // never lent
    expect(titleMayBeHeld(stats())).toBe(false); // no copies at all
  });
});

describe("reading holds", () => {
  it("asks Koha for cancellation requests, and only states one Koha reported", async () => {
    const { koha, mock } = setup({ holds: [{ hold_id: 2, patron_id: 42, biblio_id: 502, status: "W", cancellation_requested: true }] });
    expect((await readHolds(koha, 42))[0].cancellationRequested).toBe(true);
    expect(mock.calls.at(-1)?.headers["x-koha-embed"]).toBe("cancellation_requested");
  });
});

describe("placing a hold", () => {
  it("places it once, through the plugin, for this record only", async () => {
    const { koha, mock, writes } = setup();
    const r = await placeHold(koha, 42, 600, await readHolds(koha, 42));
    expect(r).toMatchObject({ status: "placed", priority: 1, confirmedAfterTimeout: false });
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toMatchObject({ method: "POST", path: "/api/v1/contrib/ptec/patrons/42/holds" });
    expect(writes()[0].headers["content-type"]).toBe("application/json");
    // Never Koha's own hold routes: POST /holds needs reserveforothers, which lists and cancels everyone's.
    expect(mock.calls.some((c) => /^\/api\/v1\/holds/.test(c.path))).toBe(false);
  });

  it("a copy on the shelf is refused with the plugin's code — PTEC's rule, decided inside Koha", async () => {
    const { koha } = setup();
    expect(await placeHold(koha, 42, 601, [])).toEqual({ status: "refused", code: "copy_on_shelf" });
    expect(await placeHold(koha, 42, 602, [])).toEqual({ status: "refused", code: "tooManyReserves" });
    expect(await placeHold(koha, 42, 603, [])).toEqual({ status: "refused", code: "expired" });
  });

  it("a record Koha does not have is not found; a missing plugin or permission is unavailable, never a refusal", async () => {
    expect(await placeHold(setup().koha, 42, 999, [])).toEqual({ status: "not_found" });
    expect(await placeHold(setup({ readerServices: undefined }).koha, 42, 600, [])).toMatchObject({ status: "unavailable", kind: "not_found" });
    expect(await placeHold(setup({ readerServices: "forbidden" }).koha, 42, 600, [])).toMatchObject({ status: "unavailable", kind: "forbidden" });
  });

  it("a lost answer AFTER Koha placed it is settled by reading: placed, sent once", async () => {
    const { koha, writes } = setup({ holdFault: "applied" });
    const before = await readHolds(koha, 42);
    expect(await placeHold(koha, 42, 600, before)).toMatchObject({ status: "placed", confirmedAfterTimeout: true });
    expect(writes()).toHaveLength(1);
  });

  it("a lost answer BEFORE Koha placed it is 'unconfirmed' — never sent again", async () => {
    const { koha, writes } = setup({ holdFault: "not_applied" });
    expect(await placeHold(koha, 42, 600, await readHolds(koha, 42))).toMatchObject({ status: "unconfirmed", kind: "server" });
    expect(writes()).toHaveLength(1);
  });

  it("an OLDER hold on the same record is not mistaken for the one a lost answer made", async () => {
    // The reader already held 501; a lost answer for 501 must not read that hold as new.
    const { koha } = setup({ holdFault: "not_applied", holdable: { 501: "out" } });
    const before = await readHolds(koha, 42);
    expect(await placeHold(koha, 42, 501, before)).toMatchObject({ status: "unconfirmed" });
  });
});

describe("cancelling a hold", () => {
  it("a hold still in the queue is cancelled outright, once", async () => {
    const { koha, writes } = setup();
    expect(await cancelHold(koha, 42, { holdId: 1, cancellationRequested: false })).toEqual({ status: "cancelled", confirmedAfterTimeout: false });
    expect(writes()).toEqual([expect.objectContaining({ method: "DELETE", path: "/api/v1/contrib/ptec/patrons/42/holds/1" })]);
    expect(writes()[0].headers["content-type"]).toBeUndefined();
    expect((await readHolds(koha, 42)).some((h) => h.holdId === 1)).toBe(false);
  });

  it("a hold WAITING on the shelf becomes a cancellation request — never a silent cancel", async () => {
    const { koha } = setup();
    expect(await cancelHold(koha, 42, { holdId: 2, cancellationRequested: false })).toEqual({ status: "cancellation_requested", confirmedAfterTimeout: false });
    const after = (await readHolds(koha, 42)).find((h) => h.holdId === 2);
    expect(after).toMatchObject({ state: "waiting", cancellationRequested: true });
  });

  it("the desk's cases are refused with the plugin's code", async () => {
    const { koha } = setup();
    expect(await cancelHold(koha, 42, { holdId: 3, cancellationRequested: false })).toEqual({ status: "refused", code: "not_cancellable_online" });
    expect(await cancelHold(koha, 42, { holdId: 4, cancellationRequested: false })).toEqual({ status: "refused", code: "waiting_cancel_not_allowed" });
  });

  it("another reader's hold is not found — Koha is asked, and says no", async () => {
    const { koha, mock } = setup();
    expect(await cancelHold(koha, 42, { holdId: 9, cancellationRequested: false })).toEqual({ status: "not_found" });
    expect(mock.calls.some((c) => c.method === "DELETE" && c.path.endsWith("/holds/9"))).toBe(true);
  });

  it("a lost answer after Koha cancelled is settled by reading; before, it is 'unconfirmed' — sent once either way", async () => {
    const applied = setup({ holdFault: "applied" });
    expect(await cancelHold(applied.koha, 42, { holdId: 1, cancellationRequested: false })).toEqual({ status: "cancelled", confirmedAfterTimeout: true });
    expect(applied.writes()).toHaveLength(1);
    const waiting = setup({ holdFault: "applied" });
    expect(await cancelHold(waiting.koha, 42, { holdId: 2, cancellationRequested: false })).toEqual({ status: "cancellation_requested", confirmedAfterTimeout: true });
    const lost = setup({ holdFault: "not_applied" });
    expect(await cancelHold(lost.koha, 42, { holdId: 1, cancellationRequested: false })).toMatchObject({ status: "unconfirmed", kind: "server" });
    expect(lost.writes()).toHaveLength(1);
  });

  it("the client refuses Koha's own hold routes and DELETE anywhere else", async () => {
    const { koha } = setup();
    const any = (v: unknown): v is unknown => v !== undefined;
    await expect(koha.write("POST", "/holds", {}, any)).rejects.toMatchObject({ kind: "invalid_request" });
    await expect(koha.write("DELETE", "/holds/1", undefined, any)).rejects.toMatchObject({ kind: "invalid_request" });
    await expect(koha.write("DELETE", "/biblios/1", undefined, any)).rejects.toBeInstanceOf(KohaError);
    await expect(koha.write("DELETE", "/contrib/ptec/patrons/42/checkouts/1/renewal", undefined, any)).rejects.toMatchObject({ kind: "invalid_request" });
  });
});

describe("what the reader is told", () => {
  it("every refusal code the plugin can pass through has its own message", () => {
    // Controller.pm place_hold/cancel_hold, Koha::Patron->can_place_holds and
    // C4::Reserves CanBookBeReserved/CanItemBeReserved (v26.05.03-1).
    const specific = ["copy_on_shelf", "already_held", "tooManyHoldsForThisRecord", "itemAlreadyOnHold", "alreadypossession",
      "tooManyReserves", "tooManyReservesToday", "hold_limit", "expired", "debt_limit", "restricted", "card_lost", "bad_address",
      "online_holds_disabled", "ageRestricted", "notReservable", "noReservesAllowed", "damaged", "recall",
      "cannotReserveFromOtherBranches", "branchNotInHoldGroup", "pickupNotInHoldGroup", "libraryNotPickupLocation",
      "libraryNotFound", "cannotBeTransferred", "pickup_not_allowed", "waiting_cancel_not_allowed", "not_cancellable_online"];
    for (const code of specific) expect(holdMessageKey(code), code).not.toBe("holdRefused");
    expect(holdMessageKey("something_new")).toBe("holdRefused");
    expect(holdMessageKey(null)).toBe("holdRefused");
  });
});
