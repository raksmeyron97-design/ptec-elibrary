/**
 * Phase 10.1 — a reader renews their own loan (docs/KOHA-READER-SERVICES.md),
 * through the REAL client against the mock, which answers as the PTEC Reader
 * Services plugin's Controller.pm does on Koha 26.05.03.
 */
import { describe, it, expect } from "vitest";
import { createKohaClient } from "./client";
import { KohaError } from "./errors";
import { kohaCanRenewForReaders, resolveKohaConfig } from "./config";
import { createMockKoha } from "./mock";
import { renewabilityForLoans, renewLoan, readRenewability } from "./renewals";
import { renewalMessageKey } from "@/lib/dashboard/library-loans";

const A = { patron_id: 42, cardnumber: "0803" };
const B = { patron_id: 43, cardnumber: "0804" };
const loans = () => [
  { checkout_id: 1, patron_id: 42, item_id: 11, due_date: "2026-10-13T23:59:00+07:00", renewals_count: 0 },
  { checkout_id: 2, patron_id: 42, item_id: 12, due_date: "2026-10-13T23:59:00+07:00", renewals_count: 2 },
  { checkout_id: 3, patron_id: 42, item_id: 13, due_date: "2026-10-13T23:59:00+07:00", renewals_count: 0, on_reserve: true },
  { checkout_id: 9, patron_id: 43, item_id: 19, due_date: "2026-10-13T23:59:00+07:00", renewals_count: 0 },
];

function setup(opts: Parameters<typeof createMockKoha>[0] = {}) {
  const mock = createMockKoha({ patrons: [A, B], checkouts: loans(), readerServices: "on", ...opts });
  const koha = createKohaClient(resolveKohaConfig({ KOHA_INTEGRATION: "mock" }), { fetch: mock.fetch, sleep: async () => {} });
  const posts = () => mock.calls.filter((c) => c.method === "POST" && c.path.includes("/renewal"));
  return { mock, koha, posts };
}

describe("the switch", () => {
  it("renewals need write (or mock), patron reads AND KOHA_READER_RENEWALS=on", () => {
    const on = { KOHA_INTEGRATION: "mock", KOHA_READ_PATRONS: "on", KOHA_READER_RENEWALS: "on" };
    expect(kohaCanRenewForReaders(resolveKohaConfig(on))).toBe(true);
    expect(kohaCanRenewForReaders(resolveKohaConfig({ ...on, KOHA_READER_RENEWALS: "" }))).toBe(false);
    expect(kohaCanRenewForReaders(resolveKohaConfig({ ...on, KOHA_READ_PATRONS: "" }))).toBe(false);
    const read = resolveKohaConfig({ ...on, KOHA_INTEGRATION: "read", KOHA_BASE_URL: "http://koha:8081", KOHA_CLIENT_ID: "x", KOHA_CLIENT_SECRET: "y" });
    expect(kohaCanRenewForReaders(read)).toBe(false);
    expect(read.warnings.join(" ")).toMatch(/KOHA_READER_RENEWALS=on does nothing unless KOHA_INTEGRATION=write/);
  });
});

describe("whether a loan can be renewed", () => {
  it("states Koha's verdict, the limit and the reason", async () => {
    const { koha } = setup();
    expect(await readRenewability(koha, 42, 1)).toEqual({ allowed: true, code: null, max: 2, soonest: null });
    expect(await readRenewability(koha, 42, 2)).toMatchObject({ allowed: false, code: "too_many", max: 2 });
    expect(await readRenewability(koha, 42, 3)).toMatchObject({ allowed: false, code: "on_reserve" });
  });

  it("a loan Koha cannot answer for is null — never 'not allowed'", async () => {
    const { koha } = setup();
    const v = await renewabilityForLoans(koha, 42, [1, 2, 9]);
    expect(v.get(1)).toMatchObject({ allowed: true });
    expect(v.get(2)).toMatchObject({ allowed: false });
    expect(v.get(9)).toBeNull(); // another reader's loan: 404
    const off = await renewabilityForLoans(setup({ readerServices: "forbidden" }).koha, 42, [1]);
    expect(off.get(1)).toBeNull();
  });
});

describe("renewing", () => {
  it("renews the reader's own loan once, through the plugin, with no body", async () => {
    const { koha, mock, posts } = setup();
    const r = await renewLoan(koha, 42, { checkoutId: 1, renewals: 0 });
    expect(r).toMatchObject({ status: "renewed", renewals: 1, confirmedAfterTimeout: false });
    expect(r.status === "renewed" && Date.parse(r.dueDate!) - Date.parse("2026-10-13T23:59:00+07:00")).toBe(14 * 86_400_000);
    expect(posts()).toHaveLength(1);
    expect(posts()[0].path).toBe("/api/v1/contrib/ptec/patrons/42/checkouts/1/renewal");
    expect(posts()[0].headers["content-type"]).toBeUndefined();
    // Never Koha's own renewal route.
    expect(mock.calls.some((c) => /^\/api\/v1\/checkouts\//.test(c.path))).toBe(false);
  });

  it("passes Koha's refusal code through", async () => {
    const { koha } = setup();
    expect(await renewLoan(koha, 42, { checkoutId: 2, renewals: 2 })).toEqual({ status: "refused", code: "too_many" });
    expect(await renewLoan(koha, 42, { checkoutId: 3, renewals: 0 })).toEqual({ status: "refused", code: "on_reserve" });
  });

  it("another reader's loan is not found — Koha is asked, and says no", async () => {
    expect(await renewLoan(setup().koha, 42, { checkoutId: 9, renewals: 0 })).toEqual({ status: "not_found" });
  });

  it("a 403 WITHOUT a code is the API user lacking the permission: unavailable, not a refusal", async () => {
    expect(await renewLoan(setup({ readerServices: "forbidden" }).koha, 42, { checkoutId: 1, renewals: 0 }))
      .toMatchObject({ status: "unavailable", kind: "forbidden" });
  });

  it("a plugin that is not installed is unavailable, not 'not found'", async () => {
    expect(await renewLoan(setup({ readerServices: undefined }).koha, 42, { checkoutId: 1, renewals: 0 }))
      .toMatchObject({ status: "unavailable", kind: "not_found" });
  });

  it("a lost answer AFTER Koha renewed is settled by reading: renewed, sent once", async () => {
    const { koha, posts } = setup({ renewalFault: "applied" });
    expect(await renewLoan(koha, 42, { checkoutId: 1, renewals: 0 })).toMatchObject({ status: "renewed", renewals: 1, confirmedAfterTimeout: true });
    expect(posts()).toHaveLength(1);
  });

  it("a lost answer BEFORE Koha renewed is 'unconfirmed' — never 'failed', never sent again", async () => {
    const { koha, posts } = setup({ renewalFault: "not_applied" });
    expect(await renewLoan(koha, 42, { checkoutId: 1, renewals: 0 })).toMatchObject({ status: "unconfirmed", kind: "server" });
    expect(posts()).toHaveLength(1);
  });

  it("the client refuses Koha's own renewal route: it also checks books out and edits lending rules", async () => {
    const { koha } = setup();
    const any = (v: unknown): v is unknown => v !== undefined;
    await expect(koha.write("POST", "/checkouts/1/renewal", undefined, any)).rejects.toMatchObject({ kind: "invalid_request" });
    await expect(koha.write("POST", "/checkouts", {}, any)).rejects.toBeInstanceOf(KohaError);
  });
});

describe("what the reader is told", () => {
  it("every refusal code Koha 26.05.03's CanBookBeRenewed returns has its own message", () => {
    // C4/Circulation.pm CanBookBeRenewed (v26.05.03-1) refusals, plus the plugin's own.
    const specific = ["too_many", "too_unseen", "on_reserve", "recalled", "booked", "too_soon", "overdue", "too_much_owing",
      "auto_too_much_owing", "restriction", "card_expired", "auto_account_expired", "online_renewal_disabled",
      "item_denied_renewal", "onsite_checkout", "auto_too_late"];
    for (const code of specific) expect(renewalMessageKey(code), code).not.toBe("renewRefused");
    expect(renewalMessageKey("something_new")).toBe("renewRefused");
    expect(renewalMessageKey(null)).toBe("renewRefused");
  });
});
