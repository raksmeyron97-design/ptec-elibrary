/**
 * The reserved-domain rule has three enforcement points — the signup form, the
 * `verifySignup` Server Action, and the trigger in migration 0068 — and they
 * are only safe while they say the same thing. This file pins the pure rule and
 * reads the migration back to prove the two lists have not drifted.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  RESERVED_ADMIN_DOMAINS,
  decideSignup,
  isFederatedIdentity,
  isReservedAdminDomain,
  type SignupIdentity,
} from "./reserved-domains";

const MIGRATION = "supabase/migrations/0068_reserved_domain_signup_guard.sql";
const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

const emailSignup = (email: string): SignupIdentity => ({
  email,
  appMetadata: { provider: "email", providers: ["email"] },
});
const googleSignin = (email: string): SignupIdentity => ({
  email,
  appMetadata: { provider: "google", providers: ["google"] },
});

describe("isReservedAdminDomain", () => {
  it.each(RESERVED_ADMIN_DOMAINS)("matches %s", (domain) => {
    expect(isReservedAdminDomain(`someone${domain}`)).toBe(true);
  });

  it("is case- and whitespace-insensitive", () => {
    expect(isReservedAdminDomain("  Someone@PTEC.EDU.KH  ")).toBe(true);
  });

  it("matches the end of the address, not a substring of it", () => {
    // The domain that merely *contains* the reserved one is a different domain.
    expect(isReservedAdminDomain("someone@ptec.edu.kh.example.com")).toBe(false);
    expect(isReservedAdminDomain("ptec.edu.kh@gmail.com")).toBe(false);
  });

  it("does not match a neighbouring institutional domain", () => {
    for (const email of [
      "a@moeys.gov.kh",
      "b@nie.edu.kh",
      "c@rupp.edu.kh",
      "d@notptec.edu.kh",
      "e@gmail.com",
    ]) {
      expect(isReservedAdminDomain(email), email).toBe(false);
    }
  });

  it("treats a missing address as unreserved", () => {
    expect(isReservedAdminDomain(null)).toBe(false);
    expect(isReservedAdminDomain(undefined)).toBe(false);
    expect(isReservedAdminDomain("")).toBe(false);
  });
});

describe("isFederatedIdentity", () => {
  it("recognises a provider that is not email", () => {
    expect(isFederatedIdentity({ appMetadata: { provider: "google" } })).toBe(true);
  });

  it("recognises a linked provider even when `provider` still reads email", () => {
    expect(
      isFederatedIdentity({ appMetadata: { provider: "email", providers: ["email", "google"] } }),
    ).toBe(true);
  });

  it("does not mistake a password account for a federated one", () => {
    expect(isFederatedIdentity({ appMetadata: { provider: "email", providers: ["email"] } })).toBe(false);
  });

  it("fails closed on a shape it does not recognise", () => {
    expect(isFederatedIdentity({})).toBe(false);
    expect(isFederatedIdentity({ appMetadata: null })).toBe(false);
    expect(isFederatedIdentity({ appMetadata: { provider: null, providers: null } })).toBe(false);
  });
});

describe("decideSignup", () => {
  it("allows Google on every domain, reserved ones included", () => {
    for (const email of [
      "reader@gmail.com",
      "official@moeys.gov.kh",
      "lecturer@ptec.edu.kh",
      "someone@admin.ptec.edu.kh",
      "someone@ptec-admin.edu.kh",
      "researcher@nie.edu.kh",
      "student@rupp.edu.kh",
    ]) {
      expect(decideSignup(googleSignin(email)), email).toEqual({ allowed: true });
    }
  });

  it("allows an ordinary email/password signup", () => {
    expect(decideSignup(emailSignup("reader@gmail.com"))).toEqual({ allowed: true });
    expect(decideSignup(emailSignup("official@moeys.gov.kh"))).toEqual({ allowed: true });
  });

  it("refuses a self-service email/password signup on a reserved domain", () => {
    expect(decideSignup(emailSignup("impostor@ptec.edu.kh"))).toEqual({
      allowed: false,
      reason: "reserved_admin_domain",
    });
  });

  it("allows an invited account on a reserved domain", () => {
    expect(
      decideSignup({ ...emailSignup("librarian@ptec.edu.kh"), invitedAt: "2026-09-01T00:00:00Z" }),
    ).toEqual({ allowed: true });
  });

  it("refuses on exactly one input shape and no other", () => {
    // Cheap exhaustive sweep: only (email provider) × (reserved domain) ×
    // (not invited) may be refused.
    const providers = ["email", "google", undefined];
    const emails = ["a@gmail.com", "a@ptec.edu.kh", "a@moeys.gov.kh"];
    const invites = [undefined, "2026-01-01T00:00:00Z"];

    for (const provider of providers) {
      for (const email of emails) {
        for (const invitedAt of invites) {
          const identity: SignupIdentity = {
            email,
            appMetadata: provider ? { provider, providers: [provider] } : {},
            invitedAt,
          };
          const shouldRefuse =
            provider !== "google" && !invitedAt && isReservedAdminDomain(email);
          expect(decideSignup(identity).allowed, JSON.stringify({ provider, email, invitedAt }))
            .toBe(!shouldRefuse);
        }
      }
    }
  });
});

describe("parity with migration 0068", () => {
  const sql = read(MIGRATION);

  it("carries the same domain list as the database trigger", () => {
    const array = sql.slice(sql.indexOf("reserved_domains"), sql.indexOf("d text;"));
    const inSql = [...array.matchAll(/'(@[^']+)'/g)].map((m) => m[1]).sort();
    expect(inSql).toEqual([...RESERVED_ADMIN_DOMAINS].sort());
  });

  it("keeps the trigger's exemption for non-email providers", () => {
    expect(sql).toMatch(/raw_app_meta_data->>'provider'[\s\S]{0,40}<>\s*'email'/);
  });

  it("keeps the trigger's exemption for invited accounts", () => {
    expect(sql).toMatch(/invited_at is not null/);
  });

  it("the app-layer copy reaches the same verdict as the documented policy", () => {
    // The migration's header states the policy in prose; these are the three
    // cases it names.
    expect(decideSignup(googleSignin("owner@ptec.edu.kh")).allowed).toBe(true);
    expect(decideSignup({ ...emailSignup("x@ptec.edu.kh"), invitedAt: "now" }).allowed).toBe(true);
    expect(decideSignup(emailSignup("x@ptec.edu.kh")).allowed).toBe(false);
  });
});

describe("the rule has exactly one definition", () => {
  it("no call site keeps its own copy of the domain list", () => {
    // It used to live in three places: the Server Action, the signup form and
    // the migration. Two of those are TypeScript and could drift silently.
    for (const file of ["app/actions/auth.ts", "app/(auth)/auth/signup/SignupContent.tsx"]) {
      expect(read(file), `${file} redeclares the domain list`).not.toMatch(
        /const RESERVED_ADMIN_DOMAINS\s*=/,
      );
    }
  });

  it("the Server Action decides through the shared rule", () => {
    const source = read("app/actions/auth.ts");
    expect(source).toContain("decideSignup");
    // The regression: judging on the email address alone, with no regard for
    // how the account authenticated.
    expect(source).not.toMatch(/endsWith\(/);
  });
});
