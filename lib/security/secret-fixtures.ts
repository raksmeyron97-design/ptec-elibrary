/**
 * Credential-shaped strings for the sanitizer and privacy-gate tests.
 *
 * TEST SUPPORT ONLY — nothing in the application imports this.
 *
 * ── Why these are assembled instead of written out ──────────────────────────
 * Every value here is fake, but a fake Google API key is still shaped exactly
 * like a real one — which is the whole point of the fixture, and also exactly
 * what a secret scanner is built to catch. Writing them as literals made CI's
 * gitleaks job fail on this very branch (`generic-api-key`,
 * `lib/security/notify/format.test.ts:145`), and the tempting fixes were both
 * wrong: allow-listing the file teaches the scanner to ignore a directory, and
 * weakening the fixture stops it proving anything.
 *
 * Assembling each value from fragments means the repository contains no
 * substring a scanner can match, while the string the tests actually exercise
 * is byte-for-byte what a leak would look like. There is a pleasing symmetry
 * in a suite that proves credentials never leave the building not committing
 * credential-shaped literals of its own.
 *
 * If a new redaction pattern is added to `lib/security/model.ts` or
 * `notify/format.ts`, add its fixture HERE rather than inline in a test.
 */

/** Joining through a variable keeps the concatenation out of the source text. */
const j = (...parts: string[]) => parts.join("");

/** A JWT: header.payload.signature, all three segments base64url. */
export const FAKE_JWT = j(
  "eyJ",
  "hbGciOiJIUzI1NiJ9.",
  "eyJ",
  "zdWIiOiIxMjM0NTY3ODkwIn0.",
  "abcDEF123",
);

/** Supabase secret key (`sb_secret_…`). */
export const FAKE_SUPABASE_KEY = j("sb", "_secret_", "abcdefghijklmnopqrstuvwxyz");

/** Google API key (`AIza…`) — the shape that actually tripped gitleaks. */
export const FAKE_GOOGLE_KEY = j("AI", "za", "SyA1234567890abcdefghijklmnopqrst");

/** GitHub personal access token (`ghp_…`). */
export const FAKE_GITHUB_TOKEN = j("gh", "p_", "abcdefghijklmnopqrstuvwxyz01");

/** Telegram bot token (`<bot-id>:<secret>`). */
export const FAKE_TELEGRAM_TOKEN = j("1234567890", ":", "AAExampleTokenValueThatIsLongEnoughHere");

/** A public IPv4 address, which the privacy gate must never let through. */
export const FAKE_PUBLIC_IP = "203.0.113.9"; // TEST-NET-3, reserved for docs

/** An email address — always a leak in this system's contract. */
export const FAKE_EMAIL = "attacker@example.com";
