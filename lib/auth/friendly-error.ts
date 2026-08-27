/**
 * Maps a raw Supabase Auth error message to a translation key for a
 * friendly, non-leaking message. Pure and framework-free so it is testable
 * without rendering a component — the caller does `t(classifyAuthError(msg))`.
 *
 * Never returns the raw message: an unrecognised error becomes "errDefault"
 * rather than surfacing internal database/auth-provider details to the user.
 */
export type AuthErrorKey =
  | "errUserExists"
  | "errReservedDomain"
  | "errPasswordLength"
  | "errPasswordWeak"
  | "errEmailInvalid"
  | "errTooManyRequests"
  | "errNetwork"
  | "errDefault";

export function classifyAuthError(message: string): AuthErrorKey {
  if (/user already registered/i.test(message)) return "errUserExists";
  // The Postgres trigger from migration 0068 raises this when an
  // admin-reserved domain signs up through the public form.
  if (/database error saving new user/i.test(message)) return "errReservedDomain";
  if (/password should be at least/i.test(message)) return "errPasswordLength";
  // Supabase's `password_requirements = "letters_digits"` check (see
  // lib/auth/password-policy.ts) fails with a message shaped like
  // "Password should contain at least one character of each: …".
  if (/password should contain at least one character/i.test(message)) return "errPasswordWeak";
  if (/invalid email/i.test(message)) return "errEmailInvalid";
  if (/too many requests|rate limit/i.test(message)) return "errTooManyRequests";
  if (/network/i.test(message)) return "errNetwork";
  return "errDefault";
}
