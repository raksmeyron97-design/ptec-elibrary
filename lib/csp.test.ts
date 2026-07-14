import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildNonceCsp,
  buildPublicCsp,
  getThemeScriptHash,
  needsEval,
  usesNonceCsp,
  NONCE_PATH_PREFIXES,
  THEME_INIT_SCRIPT,
} from "./csp";

const ROOT = path.join(__dirname, "..");

function directive(csp: string, name: string): string {
  const found = csp.split("; ").find((d) => d.startsWith(`${name} `));
  return found ?? "";
}

describe("CSP policy split", () => {
  describe("public policy (CDN-cacheable pages)", () => {
    const csp = buildPublicCsp({ withEval: false });

    it("carries no nonce and no hash, so 'unsafe-inline' actually applies", () => {
      // THE TRAP this pins: per CSP spec, a nonce or hash source in script-src
      // makes browsers IGNORE 'unsafe-inline'. Adding either one here would
      // silently block every inline script Next emits — including the RSC
      // payload — and break hydration on every public page.
      const scriptSrc = directive(csp, "script-src");
      expect(scriptSrc).toContain("'unsafe-inline'");
      expect(scriptSrc).not.toContain("nonce-");
      expect(scriptSrc).not.toContain("sha256-");
    });

    it("drops 'unsafe-eval' — stricter than the single policy it replaced", () => {
      expect(directive(csp, "script-src")).not.toContain("'unsafe-eval'");
    });

    it("keeps the directives that carry the real hardening", () => {
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("form-action 'self'");
      expect(csp).toContain("default-src 'self'");
    });

    it("still allows eval on the pdf.js reader routes only", () => {
      expect(needsEval("/books/some-slug/read")).toBe(true);
      expect(needsEval("/offline-books")).toBe(true);
      expect(needsEval("/books/some-slug")).toBe(false);
      expect(needsEval("/home")).toBe(false);
      expect(
        directive(buildPublicCsp({ withEval: true }), "script-src"),
      ).toContain("'unsafe-eval'");
    });
  });

  describe("nonce policy (authenticated surfaces)", () => {
    it("allowlists the theme script by hash, since it carries no nonce attribute", async () => {
      // The root layout must stay free of headers(), so it cannot stamp a nonce
      // onto the theme-init script. The hash is what lets that script run under
      // the nonce policy — and it is derived from the script text at runtime, so
      // editing the script cannot leave a stale hash behind.
      const hash = await getThemeScriptHash();
      expect(hash).toMatch(/^sha256-[A-Za-z0-9+/]+=*$/);

      const csp = buildNonceCsp("NONCE123", hash, { withEval: true });
      const scriptSrc = directive(csp, "script-src");
      expect(scriptSrc).toContain("'nonce-NONCE123'");
      expect(scriptSrc).toContain(`'${hash}'`);
      expect(scriptSrc).not.toContain("'unsafe-inline'");
    });

    it("hashes the exact script the root layout renders", async () => {
      const shell = fs.readFileSync(
        path.join(ROOT, "components/layout/RootShell.tsx"),
        "utf8",
      );
      // RootShell must inject THEME_INIT_SCRIPT itself, not a copy — a copy
      // could drift from the hashed constant and get blocked on /admin.
      expect(shell).toContain("__html: THEME_INIT_SCRIPT");
      expect(shell).not.toContain("nonce=");
      expect(THEME_INIT_SCRIPT).toContain("ptec.theme");
    });
  });

  describe("routing", () => {
    it("routes authenticated surfaces to the nonce policy", () => {
      for (const p of ["/admin", "/admin/users", "/auth/login", "/api/me", "/dashboard", "/profile", "/lists/abc"]) {
        expect(usesNonceCsp(p), p).toBe(true);
      }
    });

    it("routes public pages to the public policy", () => {
      for (const p of ["/home", "/books", "/books/x", "/theses", "/publications", "/paths", "/about/team", "/contact", "/search"]) {
        expect(usesNonceCsp(p), p).toBe(false);
      }
    });

    it("does not let a prefix match bleed into a sibling route", () => {
      // "/listsomething" must not match the "/lists" prefix.
      expect(usesNonceCsp("/listsomething")).toBe(false);
      expect(usesNonceCsp("/administration")).toBe(false);
    });
  });

  describe("INVARIANT: every nonce-policy route renders dynamically", () => {
    // A statically prerendered page served under the nonce policy would have no
    // nonce attributes on its scripts (the nonce is minted per request, after
    // the prerender), so every script on it would be blocked and the page would
    // be dead on arrival. The two must therefore agree.
    //
    // /admin, /auth and /api are structurally dynamic (session-gated, and Next
    // renders them on demand). The public-tree exceptions are the ones that need
    // pinning: they live under app/[locale]/(public), where everything else is
    // prerendered, so nothing but an explicit opt-out keeps them dynamic.
    const publicTreeNonceRoutes = NONCE_PATH_PREFIXES.filter(
      (p) => !["/admin", "/auth", "/api"].includes(p),
    );

    it.each(publicTreeNonceRoutes)(
      "%s is force-dynamic (or does not exist)",
      (prefix) => {
        const dir = path.join(ROOT, "app/[locale]/(public)", prefix);
        if (!fs.existsSync(dir)) return; // /profile has no page today

        const pages = fs
          .readdirSync(dir, { recursive: true, withFileTypes: true })
          .filter((e) => e.isFile() && e.name === "page.tsx")
          .map((e) => path.join(e.parentPath ?? dir, e.name));

        expect(pages.length, `no page under ${prefix}`).toBeGreaterThan(0);

        for (const page of pages) {
          const src = fs.readFileSync(page, "utf8");
          expect(
            /export const dynamic\s*=\s*["']force-dynamic["']/.test(src),
            `${path.relative(ROOT, page)} is served the nonce CSP (see lib/csp.ts ` +
              `NONCE_PATH_PREFIXES) but is not force-dynamic. If it gets ` +
              `prerendered, its scripts will carry no nonce and the page will ` +
              `break. Add force-dynamic, or move the route out of the nonce list.`,
          ).toBe(true);
        }
      },
    );
  });
});
