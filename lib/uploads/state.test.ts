import { describe, expect, it } from "vitest";

import {
  UPLOAD_ERROR_CODES,
  UPLOAD_STATES,
  canTransition,
  holdsUnreferencedBytes,
  isRetryable,
  isTerminal,
  isValidUploadId,
  stageForState,
  stageIsDeterminate,
  statusForCode,
  type UploadState,
} from "./state";

describe("upload state machine", () => {
  it("walks the happy path and nothing else", () => {
    const happy: UploadState[] = [
      "CREATED",
      "UPLOADING",
      "FINALIZING",
      "STORED",
      "SAVING_DB",
      "COMPLETED",
    ];
    for (let i = 0; i < happy.length - 1; i++) {
      expect(canTransition(happy[i], happy[i + 1])).toBe(true);
    }
  });

  it("allows finalize to start from CREATED as well as UPLOADING", () => {
    // The finalize call names both, because the CREATED -> UPLOADING move is
    // made by the first chunk request and can be lost. Starting from CREATED
    // skips no check: the next thing finalize does is count the staged parts.
    expect(canTransition("CREATED", "FINALIZING")).toBe(true);
  });

  it("refuses to skip storage", () => {
    // The bug this forbids: a save that runs before the file is actually in
    // Zima produces a books row pointing at nothing.
    expect(canTransition("UPLOADING", "SAVING_DB")).toBe(false);
    expect(canTransition("UPLOADING", "COMPLETED")).toBe(false);
    expect(canTransition("FINALIZING", "COMPLETED")).toBe(false);
  });

  it("lets a finalize that found missing parts hand the session back", () => {
    // Not a failure: the parts already staged are still good, and the client
    // only has to re-send what is actually gone.
    expect(canTransition("FINALIZING", "UPLOADING")).toBe(true);
  });

  it("lets a failed database save return to STORED, not to FAILED", () => {
    // The FILE is still good. Ending the session here would make a 95 MB
    // upload unusable because a category name was wrong.
    expect(canTransition("SAVING_DB", "STORED")).toBe(true);
  });

  it("never reopens a terminal state", () => {
    for (const state of ["COMPLETED", "FAILED", "CANCELLED"] as const) {
      expect(isTerminal(state)).toBe(true);
      for (const to of UPLOAD_STATES) {
        expect(canTransition(state, to)).toBe(false);
      }
    }
  });

  it("lets an orphan be adopted when a row turns out to reference it", () => {
    // The reconciler's most important edge: a save whose response was lost
    // leaves a real book row and a session that never heard about it.
    expect(canTransition("ORPHANED", "COMPLETED")).toBe(true);
  });

  it("names exactly the states that hold unreferenced bytes", () => {
    const holding = UPLOAD_STATES.filter(holdsUnreferencedBytes);
    expect(holding).toEqual(["STORED", "SAVING_DB", "ORPHANED"]);
  });
});

describe("error taxonomy", () => {
  it("gives every code a status", () => {
    for (const code of UPLOAD_ERROR_CODES) {
      expect(statusForCode(code)).toBeGreaterThanOrEqual(400);
    }
  });

  it("marks recoverable classes retryable and permanent ones not", () => {
    expect(isRetryable("CHUNK_MISSING")).toBe(true);
    expect(isRetryable("SESSION_BUSY")).toBe(true);
    expect(isRetryable("ZIMA_UPLOAD_FAILED")).toBe(true);
    // Repeating these cannot change the answer, and a client that retries them
    // only burns storage quota.
    expect(isRetryable("DUPLICATE_FILE")).toBe(false);
    expect(isRetryable("MALWARE_BLOCKED")).toBe(false);
    expect(isRetryable("UPLOAD_LIMIT")).toBe(false);
    expect(isRetryable("CONTENT_REJECTED")).toBe(false);
  });

  it("keeps a duplicate a 409 and an oversize a 413", () => {
    expect(statusForCode("DUPLICATE_FILE")).toBe(409);
    expect(statusForCode("UPLOAD_LIMIT")).toBe(413);
    expect(statusForCode("NOT_AUTHORIZED")).toBe(403);
  });
});

describe("upload ids", () => {
  it("accepts a uuid", () => {
    expect(isValidUploadId("2f1c9a3e-4b7d-4a11-9f0e-8c2d5b6a7e10")).toBe(true);
  });

  it("rejects every traversal shape before it can reach path.join", () => {
    const traversal = "..";
    const parentDir = "../etc";
    const withSlash = "a/b";
    const withBackslash = "a" + String.fromCharCode(92) + "b";
    const withDot = "a.b";
    const withSpace = "a b";
    const tooShort = "short";
    const tooLong = "x".repeat(65);
    const encoded = "%2e%2e%2fetc";

    for (const bad of [
      traversal,
      parentDir,
      withSlash,
      withBackslash,
      withDot,
      withSpace,
      tooShort,
      tooLong,
      "",
      encoded,
    ]) {
      expect(isValidUploadId(bad), bad).toBe(false);
    }
  });
});

describe("client stages", () => {
  it("is determinate only while bytes are moving", () => {
    // The whole reason "100% but still loading" was indistinguishable from a
    // hang: everything after "sending" was drawn as a full determinate bar.
    expect(stageIsDeterminate("sending")).toBe(true);
    for (const stage of ["finalizing", "storing", "saving", "complete"] as const) {
      expect(stageIsDeterminate(stage)).toBe(false);
    }
  });

  it("only calls an upload complete once the row exists", () => {
    expect(stageForState("STORED")).not.toBe("complete");
    expect(stageForState("SAVING_DB")).not.toBe("complete");
    expect(stageForState("COMPLETED")).toBe("complete");
  });

  it("maps every server state to a stage", () => {
    for (const state of UPLOAD_STATES) {
      expect(stageForState(state)).toBeTruthy();
    }
  });
});
