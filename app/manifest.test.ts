import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/system-settings/config", () => ({
  getSiteConfig: async () => ({
    seo: { siteName: "PTEC Library", siteDescription: { en: "The library." } },
    name: { short: "PTEC" },
  }),
}));

import manifest from "./manifest";

// MUX-11: store-style screenshots turn Android's one-line install prompt into
// Chrome's richer install sheet. Chrome's rules, pinned here: at least one
// "narrow" screenshot, ONE aspect ratio per form factor, every side between
// 320 and 3840 px, and the long side at most 2.3× the short. And the manifest
// must never name a file that is not there — or a size the file is not.

const PUBLIC = path.join(process.cwd(), "public");

/** A PNG's real pixel size, from its IHDR chunk. */
function pngSize(file: string): [number, number] {
  const buf = fs.readFileSync(file);
  expect(buf.subarray(1, 4).toString("latin1"), `${file} is a PNG`).toBe("PNG");
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

afterEach(() => vi.restoreAllMocks());

describe("manifest install screenshots", () => {
  it("lists the three committed screenshots, each narrow, labelled and PNG", async () => {
    const shots = (await manifest()).screenshots ?? [];
    expect(shots.map((s) => s.src)).toEqual([
      "/pwa/screenshots/home.png",
      "/pwa/screenshots/books.png",
      "/pwa/screenshots/path.png",
    ]);
    for (const s of shots) {
      expect(s.form_factor).toBe("narrow");
      expect(s.type).toBe("image/png");
      expect(s.label?.length).toBeGreaterThan(0);
    }
  });

  it("declares each file's REAL size, and Chrome's ratio and side rules hold", async () => {
    const shots = (await manifest()).screenshots ?? [];
    const ratios = new Set<string>();
    for (const s of shots) {
      const file = path.join(PUBLIC, s.src);
      expect(fs.existsSync(file), s.src).toBe(true);
      const [w, h] = pngSize(file);
      expect(s.sizes, s.src).toBe(`${w}x${h}`);
      expect(Math.min(w, h)).toBeGreaterThanOrEqual(320);
      expect(Math.max(w, h)).toBeLessThanOrEqual(3840);
      expect(Math.max(w, h) / Math.min(w, h)).toBeLessThanOrEqual(2.3);
      ratios.add((w / h).toFixed(4));
    }
    expect(ratios.size, "one aspect ratio per form factor").toBe(1);
  });

  it("never names a file that is not on disk", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    expect((await manifest()).screenshots).toEqual([]);
  });

  it("keeps the installed app portrait (only reader focus mode unlocks rotation)", async () => {
    expect((await manifest()).orientation).toBe("portrait-primary");
  });
});
