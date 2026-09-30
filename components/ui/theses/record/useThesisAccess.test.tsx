import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ThesisAccess } from "@/lib/theses/access";

// The viewer's half of the access decision. The page's HTML is the same for
// everyone; this hook is what turns an anonymous "sign in" into a signed-in
// reader's real state — and it must cost a signed-out visitor nothing, never
// guess an open state, and never show "sign in" while it does not know.

const session = vi.hoisted(() => ({ current: { user: null as null | { id: string }, loading: false } }));
vi.mock("@/components/providers/SessionProvider", () => ({ useSession: () => session.current }));

import { useThesisAccess } from "./useThesisAccess";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SIGN_IN: ThesisAccess = { state: "sign_in", canRead: false, canDownload: false, blockedBy: null, rank: 40 };
const PROTECTED: ThesisAccess = { state: "protected", canRead: false, canDownload: false, blockedBy: "top_ten", rank: 3 };

describe("useThesisAccess", () => {
  it("a signed-out visitor costs no request and keeps the record's state", () => {
    session.current = { user: null, loading: false };
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useThesisAccess("r-anon", SIGN_IN));
    expect(result.current).toMatchObject({ access: SIGN_IN, pending: false, canEdit: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("while the session loads, a sign-in record is pending; a protected one is final", () => {
    session.current = { user: null, loading: true };
    expect(renderHook(() => useThesisAccess("r-load", SIGN_IN)).result.current.pending).toBe(true);
    expect(renderHook(() => useThesisAccess("r-load", PROTECTED)).result.current.pending).toBe(false);
  });

  it("a signed-in reader is upgraded from the status route, with the Edit answer", async () => {
    session.current = { user: { id: "u1" }, loading: false };
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ state: "open", canRead: true, canDownload: true, blockedBy: null, rank: 12, canEdit: true }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderHook(() => useThesisAccess("r-signed", SIGN_IN));
    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(result.current.access.state).toBe("open"));
    expect(result.current).toMatchObject({ pending: false, signedIn: true, canEdit: true });
    expect(fetchSpy).toHaveBeenCalledWith("/api/theses/r-signed/download-status", expect.anything());
  });

  it("every control on the page shares one request", async () => {
    session.current = { user: { id: "u1" }, loading: false };
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ state: "profile_incomplete", canRead: true, canDownload: false, blockedBy: null, rank: null }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    const a = renderHook(() => useThesisAccess("r-shared", SIGN_IN));
    const b = renderHook(() => useThesisAccess("r-shared", SIGN_IN));
    await waitFor(() => expect(a.result.current.access.state).toBe("profile_incomplete"));
    await waitFor(() => expect(b.result.current.access.state).toBe("profile_incomplete"));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("a failed status read keeps the record's own state rather than guessing an open one", async () => {
    session.current = { user: { id: "u1" }, loading: false };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    const { result } = renderHook(() => useThesisAccess("r-fail", SIGN_IN));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.access).toEqual(SIGN_IN);
    expect(result.current.canEdit).toBe(false);
  });
});
