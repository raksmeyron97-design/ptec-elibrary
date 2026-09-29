import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { LICENSE_CODES, thesisLicense } from "@/lib/theses/license";

describe("thesisLicense", () => {
  it("resolves every stored code to itself", () => {
    for (const code of LICENSE_CODES) expect(thesisLicense(code)?.code).toBe(code);
  });

  it("tolerates stray case and whitespace from imports", () => {
    expect(thesisLicense("  CC_BY_NC ")?.code).toBe("cc_by_nc");
  });

  it("is not a claim when the licence is unknown or not a licence", () => {
    for (const raw of ["unknown", "", null, undefined, "none", "n/a", "cc-by", 42]) {
      expect(thesisLicense(raw)).toBeNull();
    }
  });

  it("links Creative Commons codes to their deeds and MoEYS Open to nothing", () => {
    expect(thesisLicense("cc_by")?.url).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(thesisLicense("moeys_open")?.url).toBeNull();
  });

  // The words come from `trust.license.*`, so every code this module can
  // return must have a translation in both catalogues, or the record page
  // would print the raw key.
  it.each(["en", "km"])("every code has a trust.license label in %s", (loc) => {
    const messages = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "messages", `${loc}.json`), "utf8"));
    for (const code of LICENSE_CODES) {
      expect(typeof messages.trust.license[code], code).toBe("string");
      expect(messages.trust.license[code].trim(), code).not.toBe("");
    }
  });

  // The list here must be the database's list, or a valid stored licence
  // would silently read as "not specified".
  it("matches the CHECK constraint in migration 0062", () => {
    const dir = path.join(__dirname, "..", "..", "supabase", "migrations");
    const sql = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
      .join("\n");
    const m = /license\s+text[^;]*?check\s*\(\s*license\s+in\s*\(([^)]*)\)/i.exec(sql);
    expect(m, "research_reports.license CHECK not found").not.toBeNull();
    const allowed = m![1].match(/'([^']+)'/g)!.map((s) => s.slice(1, -1)).filter((c) => c !== "unknown");
    expect([...allowed].sort()).toEqual([...LICENSE_CODES].sort());
  });
});
