"use client";

// The viewer's half of the thesis access decision.
//
// The record page is shared-cached, so its HTML carries the state an
// ANONYMOUS reader is in — no file, protected, or sign in (lib/theses/
// record.ts). A signed-in reader's state comes from the private, no-store
// /api/theses/[id]/download-status route, which resolves through the same
// projection the file route refuses by (lib/theses/access.ts). This hook is
// the one place the page asks it, and every read control — the access panel,
// the full-text slot, the phone dock, the staff Edit link — reads the answer
// from here, so they cannot disagree with each other or with the file route.
//
// A signed-out visitor costs no request at all: the session is the navbar's
// shared /api/me answer. While a session is still loading on a record whose
// anonymous state is "sign in", the state is `pending`, and the panel draws a
// neutral placeholder rather than telling a signed-in reader to sign in.

import { useEffect, useState } from "react";
import { useSession } from "@/components/providers/SessionProvider";
import type { ThesisAccess } from "@/lib/theses/access";

type StatusResponse = Pick<ThesisAccess, "state" | "canRead" | "canDownload" | "blockedBy" | "rank"> & {
  canEdit?: boolean;
};

export type ViewerAccess = {
  access: ThesisAccess;
  /** The viewer's state is not known yet; draw a placeholder, not a verb. */
  pending: boolean;
  signedIn: boolean;
  /** Would the admin edit page let this viewer in? */
  canEdit: boolean;
};

// One request per record for every control on the page. Reused for a short
// while only: a reader who completes their profile and comes back through a
// client-side navigation must see the new state.
const REUSE_MS = 30_000;
const inflight = new Map<string, { at: number; promise: Promise<StatusResponse | null> }>();

function loadStatus(id: string): Promise<StatusResponse | null> {
  const hit = inflight.get(id);
  if (hit && Date.now() - hit.at < REUSE_MS) return hit.promise;
  const promise = fetch(`/api/theses/${id}/download-status`, { cache: "no-store", credentials: "same-origin" })
    .then((res) => (res.ok ? (res.json() as Promise<StatusResponse>) : null))
    .catch(() => null);
  inflight.set(id, { at: Date.now(), promise });
  return promise;
}

export function useThesisAccess(id: string, recordAccess: ThesisAccess): ViewerAccess {
  const { user, loading } = useSession();
  const [status, setStatus] = useState<StatusResponse | null | undefined>(undefined);

  useEffect(() => {
    if (loading || !user) return;
    let alive = true;
    loadStatus(id).then((next) => {
      if (alive) setStatus(next);
    });
    return () => {
      alive = false;
    };
  }, [id, user, loading]);

  // Only "sign in" can change for a signed-in reader; no file and protected
  // are facts about the record, so they are final from the first paint.
  const upgradable = recordAccess.state === "sign_in";

  if (loading) return { access: recordAccess, pending: upgradable, signedIn: false, canEdit: false };
  if (!user) return { access: recordAccess, pending: false, signedIn: false, canEdit: false };
  if (status === undefined) return { access: recordAccess, pending: upgradable, signedIn: true, canEdit: false };
  // A failed status read keeps the record's own state rather than guessing
  // an open one; the file route decides every request regardless.
  if (status === null || status.state === "unavailable") {
    return { access: recordAccess, pending: false, signedIn: true, canEdit: false };
  }
  return {
    access: {
      state: status.state,
      canRead: status.canRead,
      canDownload: status.canDownload,
      blockedBy: status.blockedBy ?? null,
      rank: status.rank ?? null,
    },
    pending: false,
    signedIn: true,
    canEdit: status.canEdit === true,
  };
}
