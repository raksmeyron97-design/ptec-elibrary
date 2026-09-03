/**
 * The upload state machine, and the closed set of reasons an upload fails.
 *
 * PURE ON PURPOSE. No `fs`, no `server-only`, no database client, no
 * `next/headers` — so the rules that decide whether a retry is safe, whether a
 * finalize may proceed and whether a session is an orphan are unit-testable
 * offline, and the client bundle can import the stage vocabulary without
 * dragging the server in. Everything that touches storage lives in
 * `lib/uploads/staging.ts`; everything that touches Postgres lives in
 * `lib/uploads/session.ts`.
 *
 * WHY A MACHINE RATHER THAN "THE XHR IS STILL OPEN"
 *
 * The previous protocol had exactly two observable states: the final chunk's
 * request was in flight, or it was not. Everything the server did after the
 * last byte arrived — assembling ~20 parts, hashing 100 MB, a VirusTotal
 * round-trip, a duplicate query, and a second full upload of the file to Zima —
 * happened inside that one request with nothing to report it. So the browser
 * showed 100% for minutes and the operator could not tell a working upload from
 * a hung one, and neither could we. Worse, the states that MATTER commercially
 * are on the far side of that request: bytes in storage with no database row is
 * a different, recoverable condition from bytes never stored, and the old
 * protocol could not represent the difference.
 */

/** Session states, in the order a healthy upload passes through them. */
export const UPLOAD_STATES = [
  "CREATED",
  "UPLOADING",
  "FINALIZING",
  "STORED",
  "SAVING_DB",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "ORPHANED",
] as const;

export type UploadState = (typeof UPLOAD_STATES)[number];

/**
 * Legal transitions. Anything not listed is refused by `assertTransition`,
 * which is what makes a second concurrent finalize a 409 rather than a second
 * upload to storage.
 *
 * Notes on the less obvious edges:
 *
 *   FINALIZING → UPLOADING   a finalize that found chunks missing hands the
 *                            session back so the client can re-send them. It
 *                            is not a failure; the bytes it does have are kept.
 *   STORED → SAVING_DB       claimed by the save action, again as a
 *                            compare-and-set, so two submits of the same form
 *                            cannot both insert.
 *   SAVING_DB → STORED       the insert failed. The FILE is still good, so the
 *                            session returns to the state that says exactly
 *                            that, and the save is retryable without
 *                            re-uploading a byte.
 *   STORED/SAVING_DB → ORPHANED  the reconciler's verdict, never a request's.
 */
const TRANSITIONS: Readonly<Record<UploadState, readonly UploadState[]>> = {
  // CREATED → FINALIZING is legal, and not a shortcut past uploading. The
  // finalize call names BOTH CREATED and UPLOADING as acceptable starting
  // points, because the CREATED→UPLOADING move is made by the first chunk
  // request and can legitimately have been lost (its response never reached the
  // client, the row was written by a request that then died). Finalizing from
  // CREATED does not skip a check: the very next thing it does is count the
  // staged parts, and with none there it reports them all missing.
  CREATED:   ["UPLOADING", "FINALIZING", "FAILED", "CANCELLED"],
  UPLOADING: ["UPLOADING", "FINALIZING", "FAILED", "CANCELLED"],
  FINALIZING: ["STORED", "UPLOADING", "FAILED", "CANCELLED"],
  STORED:    ["SAVING_DB", "FAILED", "CANCELLED", "ORPHANED"],
  SAVING_DB: ["COMPLETED", "STORED", "FAILED", "ORPHANED"],
  COMPLETED: [],
  FAILED:    [],
  CANCELLED: [],
  ORPHANED:  ["COMPLETED", "CANCELLED"],
};

export function canTransition(from: UploadState, to: UploadState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** True once nothing further will happen to this session on its own. */
export function isTerminal(state: UploadState): boolean {
  return state === "COMPLETED" || state === "FAILED" || state === "CANCELLED";
}

/** True while the bytes are known to be in storage and unreferenced. */
export function holdsUnreferencedBytes(state: UploadState): boolean {
  return state === "STORED" || state === "SAVING_DB" || state === "ORPHANED";
}

/**
 * Error classes. Closed set, so failures can be counted per class in
 * `app_events` without parsing prose, and so the client can branch on the
 * cause rather than on a message it must not display verbatim.
 */
export const UPLOAD_ERROR_CODES = [
  /** The declared or assembled size is over the application limit. */
  "UPLOAD_LIMIT",
  /** Finalization ran and one or more parts were not on disk. Recoverable. */
  "CHUNK_MISSING",
  /** The staging area is unreachable, full, or belongs to another instance. */
  "CHUNK_STORAGE_UNAVAILABLE",
  /** Assembly, hashing or validation failed for a reason of its own. */
  "FINALIZATION_FAILED",
  /** Zima refused or never answered. */
  "ZIMA_UPLOAD_FAILED",
  /** The row could not be written after the bytes were stored. */
  "DATABASE_SAVE_FAILED",
  /** The same bytes are already in the library. */
  "DUPLICATE_FILE",
  /** Hash reputation says malicious, or scanning is required and unavailable. */
  "MALWARE_BLOCKED",
  /** Bytes do not match the declared type. */
  "CONTENT_REJECTED",
  /** Caller is not the session's owner, or lacks the destination's grant. */
  "NOT_AUTHORIZED",
  /** No such session, or it expired and was reclaimed. */
  "SESSION_NOT_FOUND",
  /** Another request is already finalizing or saving this session. */
  "SESSION_BUSY",
  /** The request is malformed: bad id, bad index, wrong destination. */
  "BAD_REQUEST",
] as const;

export type UploadErrorCode = (typeof UPLOAD_ERROR_CODES)[number];

/**
 * Whether a client should try the same request again unchanged.
 *
 * CHUNK_MISSING is retryable but only AFTER re-sending the named chunks, which
 * is why the finalize response carries the list: retrying the finalize alone
 * would fail identically forever, and that loop is what the old client did
 * before it learned to re-send.
 */
export function isRetryable(code: UploadErrorCode): boolean {
  return (
    code === "CHUNK_MISSING" ||
    code === "CHUNK_STORAGE_UNAVAILABLE" ||
    code === "ZIMA_UPLOAD_FAILED" ||
    code === "DATABASE_SAVE_FAILED" ||
    code === "SESSION_BUSY"
  );
}

/** HTTP status for an error class. Kept here so route and client agree. */
export function statusForCode(code: UploadErrorCode): number {
  switch (code) {
    case "UPLOAD_LIMIT":
      return 413;
    case "DUPLICATE_FILE":
      return 409;
    case "SESSION_BUSY":
      return 409;
    case "CHUNK_MISSING":
      return 409;
    case "SESSION_NOT_FOUND":
      return 404;
    case "NOT_AUTHORIZED":
      return 403;
    case "CHUNK_STORAGE_UNAVAILABLE":
    case "ZIMA_UPLOAD_FAILED":
      return 503;
    case "FINALIZATION_FAILED":
    case "DATABASE_SAVE_FAILED":
      return 500;
    case "MALWARE_BLOCKED":
    case "CONTENT_REJECTED":
    case "BAD_REQUEST":
      return 400;
  }
}

export class UploadSessionError extends Error {
  readonly code: UploadErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  /** Extra fields merged into the JSON body — e.g. `missingChunks`. */
  readonly detail?: Record<string, unknown>;

  constructor(code: UploadErrorCode, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = "UploadSessionError";
    this.code = code;
    this.status = statusForCode(code);
    this.retryable = isRetryable(code);
    this.detail = detail;
  }
}

export function isUploadSessionError(err: unknown): err is UploadSessionError {
  return err instanceof UploadSessionError;
}

/**
 * The largest file this application will accept, in bytes.
 *
 * ONE BYTE UNDER 100 MiB, AND THE BYTE MATTERS.
 *
 * Zima's own cap is `MAX_UPLOAD_SIZE_MB=100`, enforced by multer as
 * `limits.fileSize = 100 * 1024 * 1024`. Probed against a running instance:
 *
 *   104,857,600 bytes (exactly 100 MiB)  →  413 File too large
 *   104,857,599 bytes                    →  200
 *
 * The application's cap was the same 104,857,600, so a file of exactly 100 MiB
 * passed every check here, was cut into twenty chunks, was staged, hashed,
 * scanned and checked for duplicates — and was then refused by storage with a
 * bare 413, after several minutes, with nothing in the message to tell the
 * librarian that one byte was the problem. Refusing it at the door, with a size
 * in the message, is the whole of the fix; raising a limit would not have been.
 *
 * Declared here rather than in each route so the browser's pre-flight check,
 * the single-file route, the bulk route and the chunk route cannot disagree —
 * a client cap ABOVE the server's is exactly how a file gets fully uploaded
 * before being refused.
 */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024 - 1;

/** Human form of {@link MAX_UPLOAD_BYTES}, for messages. */
export const MAX_UPLOAD_LABEL = "100 MB";

/**
 * The id shape, enforced identically by the route and by the staging layer.
 *
 * This is a path-traversal control before it is anything else: the id becomes a
 * directory name. Restricting it to this alphabet means no `.`, no `/`, no
 * `\`, no NUL and no `..` can reach `path.join` at all, so the check does not
 * depend on a resolve-and-compare that a future refactor might drop. 8–64
 * characters covers `crypto.randomUUID()` (36) with room either side.
 */
export const UPLOAD_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function isValidUploadId(id: string): boolean {
  return UPLOAD_ID_RE.test(id);
}

/**
 * Client-visible phases of one file's journey.
 *
 * Deliberately coarser than `UploadState`: the UI must distinguish bytes
 * leaving the browser from server work from the database write, and must never
 * present any of the last three as "done". It does NOT need to know about
 * CANCELLED vs FAILED to draw a bar.
 */
export type UploadStage =
  /** Bytes are leaving the browser. Measurable — the bar is determinate. */
  | "sending"
  /** Every byte is in; the server is assembling, hashing and checking. */
  | "finalizing"
  /** The file is being written to storage. */
  | "storing"
  /** Storage is done; the database row is being written. */
  | "saving"
  /** Row committed. The only stage that may be called complete. */
  | "complete";

export const UPLOAD_STAGES: readonly UploadStage[] = [
  "sending",
  "finalizing",
  "storing",
  "saving",
  "complete",
];

/**
 * What the UI may claim about a stage.
 *
 * `determinate` is true only for "sending", and that is the whole point: it is
 * the only stage whose remaining work is measurable. Every other stage draws an
 * indeterminate bar with its own label, rather than a determinate bar parked at
 * 100%, which is what made a working 90-second finalize indistinguishable from
 * a hang.
 */
export function stageIsDeterminate(stage: UploadStage): boolean {
  return stage === "sending";
}

/** Maps a server session state onto the stage the UI should show. */
export function stageForState(state: UploadState): UploadStage {
  switch (state) {
    case "CREATED":
    case "UPLOADING":
      return "sending";
    case "FINALIZING":
      return "finalizing";
    case "STORED":
      return "storing";
    case "SAVING_DB":
      return "saving";
    case "COMPLETED":
      return "complete";
    default:
      return "finalizing";
  }
}
