import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of an `Authorization: Bearer <secret>` header.
 *
 * Returns false when the secret is unset/empty (fail closed) or the header is
 * missing/malformed. The comparison is length-independent and constant-time so
 * it can't be turned into a remote timing oracle for a high-entropy secret.
 */
export function verifyBearer(
  authHeader: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!secret) return false;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const provided = authHeader.slice("Bearer ".length);
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  // timingSafeEqual throws on length mismatch — guard it, but keep the compare
  // itself constant-time for the equal-length case that matters.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
