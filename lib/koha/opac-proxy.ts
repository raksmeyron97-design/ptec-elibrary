// The public Koha OPAC's host rules: which names this app proxies to Koha, and
// which are redirected to the one public name.
//
// Relative imports only, and no runtime dependencies: next.config.ts imports
// this module directly and path aliases are not resolved inside it (same rule
// as lib/seo/subject-slug-redirects.ts). No process.env either — the proxy
// destination is passed in by next.config.ts (lib/koha/boundary.test.ts).
//
// ── How koha.ptec.edu.kh reaches Koha ────────────────────────────────────────
//
// koha.ptec.edu.kh is a Cloudflare for SaaS custom hostname. The tunnel has no
// ingress rule for it, so it falls through to the catch-all and reaches this
// container, which proxies it to the OPAC's LAN port (#263). Middleware lets
// every koha.* host through untouched, and lib/canonical-host.ts exempts them.
// The OPAC is public but not indexed: every page is noindex,nofollow
// (ptec-koha-deployment docs/SEO-URL-POLICY.md). Nothing here changes that.
//
// ── Why the second name is a redirect, not a proxy ──────────────────────────
//
// koha.storage-ptec.online served the same OPAC: a second public name for
// every page, and a second cookie jar for a reader who signs in there. It does
// not reach this app today. The tunnel has an ingress rule of its own for it,
// straight to Koha. Measured 2026-09-28: a path ending in "/" gets Next's 308
// on koha.ptec.edu.kh and a plain 200 from Koha on koha.storage-ptec.online, so
// the rewrite that used to sit here for it was never used. PTEC redirects that
// name at Cloudflare. This rule says the same thing for the day the ingress
// rule goes and the name falls through to this app; the old rewrite would then
// have served the duplicate again.
//
// It cannot loop. cloudflared chooses an ingress rule by the Host it received,
// and koha.ptec.edu.kh requests reach this app, so they did not arrive named
// koha.storage-ptec.online. A rule matching only that name never sees them.
// opac-proxy.test.ts pins that no redirect matches the public name.

// The public name lives with the outbound links to it (lib/opac/links.ts), so
// the name the proxy answers and the name the site links to cannot diverge.
import { KOHA_OPAC_PUBLIC_HOST } from "../opac/links";

export { KOHA_OPAC_PUBLIC_HOST };

/** Other public names for the OPAC. Each is redirected to KOHA_OPAC_PUBLIC_HOST. */
export const KOHA_OPAC_RETIRED_HOSTS = ["koha.storage-ptec.online"] as const;

/** Host header values proxied to the OPAC: the public name, and the two
 *  host:port forms #263 added for requests that carry the box's port. */
export const KOHA_OPAC_PROXIED_HOSTS = [
  KOHA_OPAC_PUBLIC_HOST,
  `${KOHA_OPAC_PUBLIC_HOST}:13000`,
  `${KOHA_OPAC_PUBLIC_HOST}:3000`,
] as const;

type HostCondition = { type: "host"; value: string };

export type KohaOpacRewrite = { source: string; has: HostCondition[]; destination: string };
export type KohaOpacRedirect = KohaOpacRewrite & { permanent: true };

/** beforeFiles rewrites: every proxied name → `destination` (the OPAC, `…/:path*`). */
export function kohaOpacRewriteRules(destination: string): KohaOpacRewrite[] {
  return KOHA_OPAC_PROXIED_HOSTS.map((value) => ({
    source: "/:path*",
    has: [{ type: "host", value }],
    destination,
  }));
}

/** 308s from every retired name to the same path on the public name. Next
 *  passes the query string through (next-config-js/redirects). */
export function kohaOpacRedirectRules(): KohaOpacRedirect[] {
  return KOHA_OPAC_RETIRED_HOSTS.map((value) => ({
    source: "/:path*",
    has: [{ type: "host", value }],
    destination: `https://${KOHA_OPAC_PUBLIC_HOST}/:path*`,
    permanent: true,
  }));
}
