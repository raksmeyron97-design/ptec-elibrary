import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `verifySignup` is the only thing standing between the OAuth callback and
 * `supabase.auth.admin.deleteUser` — and `profiles` cascades from
 * `auth.users`, so a wrong answer here does not merely refuse a sign-in, it
 * destroys the account's role, saved books, notes and reading progress.
 *
 * These tests therefore assert the delete call itself, not just the returned
 * flag: "success: false" and "the user was actually removed" are the same
 * decision, and only the second one is irreversible.
 *
 * The regression they exist for: the check used to compare the email domain
 * and nothing else. Because the PKCE branch of `/auth/callback` runs on EVERY
 * OAuth sign-in rather than only the first, a `@ptec.edu.kh` reader who used
 * "Continue with Google" was deleted — and deleted again on each retry.
 */

const getUser = vi.fn();
const deleteUser = vi.fn();
const logSecurityEvent = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: () => getUser() } }),
  createServiceClient: () => ({ auth: { admin: { deleteUser: (id: string) => deleteUser(id) } } }),
}));
vi.mock("@/lib/security-log", () => ({
  logSecurityEvent: (...args: unknown[]) => logSecurityEvent(...args),
}));

const { verifySignup } = await import("./auth");

/** A signed-in user as the callback sees them, one provider, no invite. */
function signedInAs(
  email: string,
  provider: string,
  extra: { providers?: string[]; invited_at?: string } = {},
) {
  getUser.mockResolvedValue({
    data: {
      user: {
        id: "user-uuid",
        email,
        app_metadata: { provider, providers: extra.providers ?? [provider] },
        invited_at: extra.invited_at,
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  deleteUser.mockResolvedValue({ error: null });
});

// ── Google OAuth: every domain, unconditionally ─────────────────────────────

describe("Google OAuth is permitted on every domain", () => {
  const domains = [
    ["a government partner", "official@moeys.gov.kh"],
    ["the institution's own domain", "lecturer@ptec.edu.kh"],
    ["an admin subdomain of it", "someone@admin.ptec.edu.kh"],
    ["the hyphenated admin domain", "someone@ptec-admin.edu.kh"],
    ["consumer Gmail", "reader@gmail.com"],
    ["a peer teacher-education college", "researcher@nie.edu.kh"],
    ["a national university", "student@rupp.edu.kh"],
    ["an arbitrary institutional domain", "person@some-university.ac.th"],
    ["a mixed-case address", "Lecturer@PTEC.EDU.KH"],
  ] as const;

  it.each(domains)("allows %s (%s)", async (_label, email) => {
    signedInAs(email, "google");
    await expect(verifySignup()).resolves.toEqual({ success: true });
  });

  it.each(domains)("never deletes %s (%s)", async (_label, email) => {
    signedInAs(email, "google");
    await verifySignup();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("stays permitted on the second and third sign-in", async () => {
    // The bug's real shape: the callback re-ran this on every OAuth login, so
    // a returning user was re-judged — and deleted — each time.
    signedInAs("lecturer@ptec.edu.kh", "google");
    await verifySignup();
    await verifySignup();
    await verifySignup();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("permits any future federated provider, not just Google", async () => {
    for (const provider of ["azure", "keycloak", "saml", "microsoft"]) {
      vi.clearAllMocks();
      signedInAs("staff@ptec.edu.kh", provider);
      await expect(verifySignup()).resolves.toEqual({ success: true });
      expect(deleteUser).not.toHaveBeenCalled();
    }
  });

  it("permits a linked Google identity even when `provider` still reads email", async () => {
    /* GoTrue links rather than replaces: an account created with a password
       that later signs in with Google keeps `provider: "email"` and gains
       `providers: ["email", "google"]`. Reading only `provider` would classify
       that Google sign-in as a password signup — and on a reserved domain,
       delete the very account the rule is meant to protect. */
    signedInAs("director@ptec.edu.kh", "email", { providers: ["email", "google"] });
    await expect(verifySignup()).resolves.toEqual({ success: true });
    expect(deleteUser).not.toHaveBeenCalled();
  });
});

// ── Self-service email/password: the rule still applies ─────────────────────

describe("self-service email/password signup", () => {
  it("blocks and deletes a reserved admin domain", async () => {
    signedInAs("impostor@ptec.edu.kh", "email");
    const result = await verifySignup();

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not permitted/i);
    expect(deleteUser).toHaveBeenCalledWith("user-uuid");
  });

  it.each([
    ["@admin.ptec.edu.kh", "impostor@admin.ptec.edu.kh"],
    ["@ptec-admin.edu.kh", "impostor@ptec-admin.edu.kh"],
  ])("blocks %s too", async (_label, email) => {
    signedInAs(email, "email");
    await expect(verifySignup()).resolves.toMatchObject({ success: false });
    expect(deleteUser).toHaveBeenCalledWith("user-uuid");
  });

  it("records a security event when it deletes", async () => {
    // Migration 0068 refuses this at INSERT, so arriving here means the trigger
    // is absent or someone called the GoTrue API directly. Both are worth a line.
    signedInAs("impostor@ptec.edu.kh", "email");
    await verifySignup();
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "auth_forbidden", userId: "user-uuid" }),
    );
  });

  it("allows an ordinary domain", async () => {
    signedInAs("reader@gmail.com", "email");
    await expect(verifySignup()).resolves.toEqual({ success: true });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("allows a lookalike domain that only contains the reserved string", async () => {
    // `notptec.edu.kh` is a different domain; the check is a suffix match on
    // "@ptec.edu.kh", so it must not fire on a substring elsewhere.
    signedInAs("someone@ptec.edu.kh.example.com", "email");
    await expect(verifySignup()).resolves.toEqual({ success: true });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("allows an invited account on a reserved domain", async () => {
    // An administrator already vouched for the address — the same exemption
    // migration 0068 makes for `invited_at`.
    signedInAs("newlibrarian@ptec.edu.kh", "email", { invited_at: new Date().toISOString() });
    await expect(verifySignup()).resolves.toEqual({ success: true });
    expect(deleteUser).not.toHaveBeenCalled();
  });
});

// ── Degenerate callbacks ────────────────────────────────────────────────────

describe("callbacks with nothing to judge", () => {
  it("passes when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(verifySignup()).resolves.toEqual({ success: true });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("passes when the user carries no email", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-uuid", email: null, app_metadata: {} } } });
    await expect(verifySignup()).resolves.toEqual({ success: true });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("falls back to the domain rule when the provider is missing entirely", async () => {
    /* GoTrue always sets `provider`, so this is defence against a shape we do
       not expect. An unknown provider is not evidence of a federated sign-in,
       so the reserved-domain rule still applies — fail closed. */
    getUser.mockResolvedValue({
      data: { user: { id: "user-uuid", email: "impostor@ptec.edu.kh", app_metadata: {} } },
    });
    await expect(verifySignup()).resolves.toMatchObject({ success: false });
  });
});
