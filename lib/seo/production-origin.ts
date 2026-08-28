/**
 * The one canonical public origin for this deployment.
 *
 * It lives in its own leaf module because two modules need it and they already
 * depend on each other in one direction: lib/seo/site.ts imports
 * isIndexableEnvironment() from lib/seo/indexing.ts, and since the move off
 * Vercel, indexing.ts needs the canonical host to recognise self-hosted
 * production. Keeping the constant here avoids a cycle.
 *
 * Re-exported from lib/seo/site.ts, which remains the public import site.
 *
 * Keep this module dependency-free: next.config.ts imports lib/seo/indexing.ts
 * with a RELATIVE path (path aliases are not resolved there), so anything
 * indexing.ts pulls in is loaded by the Next config transpiler too.
 */
export const PRODUCTION_SITE_URL = "https://library.ptec.edu.kh";

/** Hostname of {@link PRODUCTION_SITE_URL} — "library.ptec.edu.kh". */
export const PRODUCTION_SITE_HOST = "library.ptec.edu.kh";
