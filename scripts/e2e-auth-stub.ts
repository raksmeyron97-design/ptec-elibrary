/**
 * Authorization stand-in for scripts/upload-e2e.mts.
 *
 * Reached only through the `paths` mapping in scripts/tsconfig.e2e.json, so it
 * cannot be imported by the application: nothing in `app/` or `lib/` resolves
 * `@/lib/auth/requireAdmin` to this file under the real build.
 *
 * WHY THIS IS STUBBED AT ALL. The real guards read the session cookie through
 * `next/headers` and enforce MFA, which cannot be satisfied outside a request
 * that came from a browser through a CAPTCHA and a TOTP prompt. None of that is
 * what the script is verifying — it is verifying the chunk protocol, the
 * session state machine, and the transfer into storage, all of which run
 * unchanged. The one authorization property the script DOES exercise is
 * session ownership, and that is enforced by lib/uploads/session.ts against the
 * caller id this stub returns, not by the guards.
 */

export type AdminAuthStatus = 401 | 403 | 500;

export class AdminAuthError extends Error {
  readonly status: AdminAuthStatus;
  constructor(message: string, status: AdminAuthStatus = 403) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
  }
}

export function isAdminAuthError(error: unknown): error is AdminAuthError {
  return error instanceof AdminAuthError;
}

/** Whoever the script says is calling. Settable so it can test ownership. */
let currentUserId = process.env.UPLOAD_E2E_OWNER ?? "00000000-0000-4000-8000-000000000000";

export function __setE2eUser(id: string): void {
  currentUserId = id;
}

export async function requireStaff() {
  return { user: { id: currentUserId } };
}

export async function requirePermission() {
  return { user: { id: currentUserId } };
}

export async function requireAdmin() {
  return { user: { id: currentUserId } };
}
