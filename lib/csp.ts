// ─────────────────────────────────────────────────────────────────────────────
// Content-Security-Policy: two policies, chosen per request path.
//
// WHY TWO. A per-request nonce and a CDN-cacheable HTML response are mutually
// exclusive in the App Router. Next injects the nonce into its own inline RSC
// scripts at *render* time, so a page carrying a nonce can never be
// prerendered — reading it in the root layout (`headers().get("x-nonce")`) is
// what made every route in this app `ƒ Dynamic` and every public response
// `cache-control: private, no-store` with `x-vercel-cache: MISS`.
//
//   PUBLIC  (anonymous, read-only, CDN-cached)  → no nonce, 'unsafe-inline'
//   NONCE   (/admin, /auth, /api, /dashboard…)  → nonce, exactly as before
//
// SPEC TRAP: if script-src contains a nonce *or* a hash, browsers IGNORE
// 'unsafe-inline'. So the public policy must carry neither — which is why the
// theme-init script is hashed only into the nonce policy (where it has no
// nonce attribute of its own) and simply rides 'unsafe-inline' on public pages.
//
// INVARIANT: every path matched by `usesNonceCsp()` MUST render dynamically.
// A statically prerendered page served under the nonce policy would have no
// nonce attributes on its scripts and would break outright. lib/csp.test.ts
// pins this against the route files.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The only inline script this app authors. Runs before paint to apply the
 * stored theme (FOUC prevention). Rendered verbatim via dangerouslySetInnerHTML
 * from app/layout.tsx — its sha256 is allowlisted in the nonce policy, so
 * EDITING THIS STRING CHANGES THE HASH AUTOMATICALLY (it is hashed at runtime,
 * never hardcoded). Keep it dependency-free and synchronous.
 */
export const THEME_INIT_SCRIPT = `
(() => {
  try {
    const root = document.documentElement;
    const path = window.location.pathname;
    const isAdmin = path === "/admin" || path.startsWith("/admin/");
    const storedTheme = localStorage.getItem("ptec.theme");
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = isAdmin
      ? "light"
      : storedTheme === "light" || storedTheme === "dark"
        ? storedTheme
        : systemDark
          ? "dark"
          : "light";

    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", theme === "dark" ? "#0B1530" : "#172554");
    }
  } catch (_) {}
})();
`;

/** Path prefixes (already locale-stripped) that keep the nonce policy.
 *  Everything here must also be dynamically rendered — see the invariant above. */
export const NONCE_PATH_PREFIXES = [
  "/admin",
  "/auth",
  "/api",
  "/dashboard",
  "/profile",
  "/lists",
] as const;

/** Routes that legitimately need `eval` (pdf.js compiles glyph programs at
 *  runtime). Kept as narrow as possible so the rest of the public site runs
 *  without 'unsafe-eval' — a tightening over the previous single policy. */
export const EVAL_PATH_PATTERNS: readonly RegExp[] = [
  /^\/books\/[^/]+\/read$/,
  /^\/offline-books$/,
];

/**
 * @param pathname Locale-stripped pathname (`/km/books` → `/books`), except for
 *   /admin, /auth and /api which are never locale-prefixed to begin with.
 */
export function usesNonceCsp(pathname: string): boolean {
  return NONCE_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function needsEval(pathname: string): boolean {
  return EVAL_PATH_PATTERNS.some((re) => re.test(pathname));
}

// Directives that do not vary between the two policies. These carry most of
// the actual hardening (no plugins, no base-tag hijack, no framing, form posts
// stay same-origin) and are what keeps the public policy meaningful without a
// nonce.
const SHARED_DIRECTIVES = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com https://avatars.googleusercontent.com https://avatars.githubusercontent.com https://covers.openlibrary.org https://images-na.ssl-images-amazon.com https://*.r2.dev https://*.public.blob.vercel-storage.com https://*.supabase.co https://drive.google.com https://*.gstatic.com https://encrypted-tbn0.gstatic.com https://*.storage-ptec.online https://storage-ptec.online",
  "font-src 'self' data: https://fonts.gstatic.com",
  // blob: is load-bearing — offline PDF reading fetches from blob URLs.
  "connect-src 'self' blob: https://*.supabase.co wss://*.supabase.co https://*.public.blob.vercel-storage.com https://*.r2.dev https://*.r2.cloudflarestorage.com https://accounts.google.com https://challenges.cloudflare.com https://api.storage-ptec.online",
  "frame-src https://challenges.cloudflare.com https://www.google.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

const SCRIPT_HOSTS = "https://challenges.cloudflare.com https://va.vercel-scripts.com";

function assemble(scriptSrc: string): string {
  return [`script-src ${scriptSrc}`, ...SHARED_DIRECTIVES].join("; ");
}

/** Policy for CDN-cacheable public pages: no nonce, no hash (both would void
 *  'unsafe-inline'), and no 'unsafe-eval' unless the route actually needs it. */
export function buildPublicCsp({ withEval }: { withEval: boolean }): string {
  return assemble(
    `'self' 'unsafe-inline'${withEval ? " 'unsafe-eval'" : ""} ${SCRIPT_HOSTS}`,
  );
}

/** Policy for authenticated / always-dynamic surfaces — unchanged from before,
 *  plus the theme-script hash (that script no longer carries a nonce attribute
 *  because the root layout must stay free of `headers()`). */
export function buildNonceCsp(
  nonceB64: string,
  themeHash: string,
  { withEval }: { withEval: boolean },
): string {
  return assemble(
    `'self' 'nonce-${nonceB64}' '${themeHash}'${withEval ? " 'unsafe-eval'" : ""} ${SCRIPT_HOSTS}`,
  );
}

/** sha256 of the theme script, base64, as a CSP hash source. Computed once per
 *  isolate with WebCrypto so it works on the edge runtime and can never drift
 *  from THEME_INIT_SCRIPT. */
let themeHashPromise: Promise<string> | null = null;
export function getThemeScriptHash(): Promise<string> {
  themeHashPromise ??= (async () => {
    const bytes = new TextEncoder().encode(THEME_INIT_SCRIPT);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    let binary = "";
    for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
    return `sha256-${btoa(binary)}`;
  })();
  return themeHashPromise;
}
