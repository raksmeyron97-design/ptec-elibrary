import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { IOS_LAUNCH_IMAGES, PWA_INK, iosLaunchLinks } from "./launch";

const ROOT = path.join(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

describe("PWA launch surface", () => {
  it("points every iOS startup image at a file that exists", () => {
    // iOS silently falls back to a BLANK screen when a matched
    // apple-touch-startup-image 404s, which is indistinguishable from having no
    // startup image at all — the exact bug this set was added to fix. A missing
    // file must therefore fail the build, not degrade quietly.
    const missing = iosLaunchLinks()
      .map((l) => l.href)
      .filter((href) => !existsSync(path.join(ROOT, "public", href)));
    expect(missing).toEqual([]);
  });

  it("emits media queries iOS can actually match", () => {
    for (const { media } of iosLaunchLinks()) {
      // iOS matches on all four conditions or not at all.
      expect(media).toMatch(/\(device-width: \d+px\)/);
      expect(media).toMatch(/\(device-height: \d+px\)/);
      expect(media).toMatch(/\(-webkit-device-pixel-ratio: \d+\)/);
      expect(media).toMatch(/\(orientation: (portrait|landscape)\)/);
    }
  });

  it("gives each device geometry exactly one image per orientation", () => {
    const hrefs = iosLaunchLinks().map((l) => l.media);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("keeps the device table in sync with the generator", () => {
    // The generator writes the files; this module names them. If the two lists
    // drift, some devices get a 404 (see the first test) and others get an
    // orphaned PNG in the repo.
    const script = read("scripts/generate-pwa-assets.mjs");
    for (const device of IOS_LAUNCH_IMAGES) {
      expect(script).toContain(`name: "${device.name}"`);
    }
  });

  it("uses the same ink for the manifest, the viewport and the boot screen", () => {
    // The whole point of the launch colour is that four systems agree on it.
    // A literal that drifts from PWA_INK reintroduces the white-splash flash.
    expect(PWA_INK).toBe("#060B1A");
    expect(read("app/globals.css")).toContain(`background-color: ${PWA_INK}`);
    expect(read("app/manifest.ts")).toContain("background_color: PWA_INK");
    expect(read("app/manifest.ts")).toContain("theme_color: PWA_INK");
    expect(read("app/root-metadata.ts")).toContain("themeColor: PWA_INK");
    expect(read("components/pwa/PTECBootScreen.tsx")).toContain("background:${PWA_INK}");
  });

  it("keeps the boot screen dismissable without JavaScript", () => {
    const boot = read("components/pwa/PTECBootScreen.tsx");
    // A full-viewport fixed overlay that only a script can remove is a way to
    // brick the site. All three guards must survive refactors:
    //   1. it is not rendered at all where the hiding rule cannot be evaluated,
    //   2. the marker in the DOM hides it,
    //   3. a stalled response uncovers the page anyway.
    expect(boot).toContain("@supports selector(body:has(*))");
    expect(boot).toContain("body:has([data-ptec-shell-ready]) #ptec-boot");
    expect(boot).toContain("ptec-boot-failsafe");
    // No timer may gate the dismissal itself — the splash must represent real
    // work, never a minimum display time. (Comments discuss setTimeout by
    // name, so assert against the code with comments stripped.)
    const code = boot
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/setTimeout|setInterval/);

    // RootShell has to render both halves, in the right order.
    const shell = read("components/layout/RootShell.tsx");
    expect(shell.indexOf("<PTECBootScreen")).toBeGreaterThan(-1);
    expect(shell.indexOf("<PTECShellReadyMarker />")).toBeGreaterThan(
      shell.indexOf("<PTECBootScreen"),
    );
  });

  it("never lets a new worker seize control of an open page", () => {
    const sw = read("app/sw.ts");
    // skipWaiting:true activated the new worker under pages still running the
    // previous build, whose route chunks that build no longer serves — worst
    // case mid-PDF or mid-form. The handover must be the reader's choice.
    expect(sw).toContain("skipWaiting: false");
    expect(sw).toContain('"SKIP_WAITING"');
    // ...which is only useful if something offers it, or users sit on stale
    // code until every tab closes.
    expect(read("components/layout/RootShell.tsx")).toContain("<UpdateAvailable />");
    const ui = read("components/pwa/UpdateAvailable.tsx");
    expect(ui).toContain("controllerchange"); // reload after the real handover
    expect(ui).toContain("navigator.serviceWorker.controller"); // no prompt on first install
  });

  it("keeps the iOS launch images out of the precache", async () => {
    // @serwist/next precaches all of public/, and iOS reads a startup image
    // before the worker is running, so precaching them is pure install weight.
    const { shouldPrecache } = await import("@/lib/sw-policy");
    for (const { href } of iosLaunchLinks()) {
      expect(shouldPrecache(href), href).toBe(false);
    }
    expect(read("app/sw.ts")).toContain("shouldPrecache");
  });

  it("does not runtime-cache the startup images into a bounded cache by accident", () => {
    // They are images, so sw.ts rule 6 would store them — that is fine and
    // intended (they are small and versioned by path). What must NOT happen is
    // the splash set pushing real book covers out of an 80-entry cache.
    expect(iosLaunchLinks().length).toBeLessThan(30);
  });
});
