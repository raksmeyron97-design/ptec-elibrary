// lib/theses/access.ts
//
// One answer, one place: what may THIS reader do with this thesis's full text?
//
// The download engine (lib/theses/download-permission.ts) answers one question:
// may this reader be handed the file? The record page asks two more: may they
// READ it inline, and which sentence explains the answer? Before this module
// the page answered those itself from `file_url` alone, so a Top-10 or
// admin-blocked thesis drew a solid "Preview PDF" button whose reader then
// asked /api/theses/[id]/file for the bytes and got a 403.
//
// This is a pure projection of the engine's decision, not a second rule set.
// The file route, the download-status route and the record page all resolve
// through it, so a drawn button and a served byte stream cannot disagree.
//
// Pure and browser-safe: the engine is imported for its TYPES only.

import type { ThesisDownloadDecision } from "@/lib/theses/download-permission";

/**
 * How many top-ranked published theses are protected by default.
 *
 * Declared HERE rather than in the engine because the engine is `server-only`
 * and the record page's client components need the number for the sentence
 * that explains a protected record. The engine re-exports it, so there is
 * still exactly one definition.
 */
export const TOP_N_PROTECTED = 10;

/**
 * The five states a reader can be in, plus the one the page never renders.
 *
 *   open                signed in, profile complete — read and download
 *   profile_incomplete  signed in — read; downloading needs the Download
 *                       Access Profile
 *   sign_in             anonymous — reading and downloading both start with
 *                       signing in
 *   protected           Top-10 or an admin block — neither, for anyone; the
 *                       record itself stays fully public
 *   no_file             no PDF deposited — the record is metadata only
 *   unavailable         unpublished; the page 404s before it could render this
 */
export type ThesisAccessState =
  | "open"
  | "profile_incomplete"
  | "sign_in"
  | "protected"
  | "no_file"
  | "unavailable";

export interface ThesisAccess {
  state: ThesisAccessState;
  /** May the in-page reader be opened? Mirrors the file route's inline gate. */
  canRead: boolean;
  /** May the file be downloaded? Mirrors the download route's gate. */
  canDownload: boolean;
  /** Why a `protected` record is protected; null otherwise. */
  blockedBy: "top_ten" | "admin" | null;
  /** The global download rank, when the engine resolved one. */
  rank: number | null;
}

export interface ThesisAccessInput {
  /** The engine's decision — only the fields this projection reads. */
  decision: Pick<ThesisDownloadDecision, "reason" | "effectivePolicy" | "rank">;
  /** Whether the record has a file at all. */
  hasFile: boolean;
  /** Whether the reader is signed in. */
  authenticated: boolean;
}

/**
 * Project the engine's decision onto what the reader can do.
 *
 * The order matters and is the engine's own, with one addition at the front:
 *   1. unpublished — nothing is served (the file route answers 404)
 *   2. no file     — "no PDF deposited" is the truthful sentence even for a
 *                    record the policy would also block; there is nothing to
 *                    protect
 *   3. blocked     — before the sign-in gate, exactly as resolveDownloadPolicy
 *                    orders it, so an anonymous reader is never sent through a
 *                    sign-in that would end in a refusal
 *   4. anonymous   — sign in to read
 *   5. profile     — reading needs no profile; downloading does
 */
export function resolveThesisAccess({ decision, hasFile, authenticated }: ThesisAccessInput): ThesisAccess {
  const rank = decision.rank ?? null;
  const closed = (state: ThesisAccessState, blockedBy: ThesisAccess["blockedBy"] = null): ThesisAccess => ({
    state,
    canRead: false,
    canDownload: false,
    blockedBy,
    rank,
  });

  if (decision.reason === "THESIS_UNPUBLISHED") return closed("unavailable");
  if (!hasFile) return closed("no_file");
  if (decision.effectivePolicy === "blocked") {
    return closed("protected", decision.reason === "ADMIN_BLOCKED" ? "admin" : "top_ten");
  }
  if (!authenticated) return closed("sign_in");
  if (decision.reason === "ALLOWED") {
    return { state: "open", canRead: true, canDownload: true, blockedBy: null, rank };
  }
  // PROFILE_INCOMPLETE, and any reason a future engine adds that still leaves
  // the policy allowed for a signed-in reader: the file route serves inline
  // views on exactly that condition, so reading stays open and only the
  // download is withheld.
  return { state: "profile_incomplete", canRead: true, canDownload: false, blockedBy: null, rank };
}
