"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type SessionUser = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "reader" | "admin";
};

type SessionState = {
  user: SessionUser | null;
  /** True until /api/me has answered. Consumers must render a neutral,
   *  same-sized placeholder while this is true — never a "logged out" state,
   *  which would flash the login button at signed-in users. */
  loading: boolean;
};

const SessionContext = createContext<SessionState>({ user: null, loading: true });

export function useSession(): SessionState {
  return useContext(SessionContext);
}

/**
 * Loads the viewer's identity client-side so the page HTML stays anonymous and
 * CDN-cacheable. Every visitor is served the exact same markup; the avatar,
 * notification bell and "Ask" widget hydrate in afterwards.
 *
 * The fetch is shared across all consumers via a module-level promise, so the
 * navbar, mobile drawer and Ask widget cost one request between them — not
 * three. A signed-out visitor pays a single 200 with `{"user":null}`.
 */
let inflight: Promise<SessionUser | null> | null = null;

function loadSession(): Promise<SessionUser | null> {
  inflight ??= fetch("/api/me", { credentials: "same-origin" })
    .then((res) => (res.ok ? res.json() : { user: null }))
    .then((data: { user: SessionUser | null }) => data.user ?? null)
    .catch(() => null);
  return inflight;
}

/** Drop the cached identity — call after sign-in/sign-out so the navbar
 *  re-reads it instead of serving a stale avatar. */
export function invalidateSession() {
  inflight = null;
}

export default function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ user: null, loading: true });

  useEffect(() => {
    let active = true;
    loadSession().then((user) => {
      if (active) setState({ user, loading: false });
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
  );
}
