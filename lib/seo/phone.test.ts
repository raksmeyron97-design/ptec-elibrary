import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toInternationalKhPhone } from "./phone";

describe("a published local number, in the form a machine can dial", () => {
  it("converts a number of the shape this site publishes", () => {
    // The live Library and Organization nodes carry a local 0XX XXX XXX
    // number (read 2026-09-21). The literal is deliberately fictional here:
    // lib/settings-consistency.test.ts keeps the real one in lib/ptec.ts and
    // nowhere else, and that rule caught this file on the first run.
    expect(toInternationalKhPhone("012 345 678")).toBe("+855 12 345 678");
  });

  it("drops the trunk zero rather than prefixing the string", () => {
    expect(toInternationalKhPhone("023 123 456")).toBe("+855 23 123 456");
    expect(toInternationalKhPhone("0123456789")).toBe("+855 12 345 6789");
  });

  it("accepts a bare subscriber number", () => {
    expect(toInternationalKhPhone("12345678")).toBe("+855 12 345 678");
  });
});

describe("what it refuses to touch", () => {
  it("leaves an already-international number alone", () => {
    expect(toInternationalKhPhone("+855 12 345 678")).toBe("+855 12 345 678");
    expect(toInternationalKhPhone("+44 20 7123 4567")).toBe("+44 20 7123 4567");
  });

  it("passes through anything that is not a phone number", () => {
    for (const v of ["", "   ", "n/a", "ext. 12", "1234"]) {
      expect(toInternationalKhPhone(v)).toBe(v.trim());
    }
  });

  it("never returns a partial number", () => {
    expect(toInternationalKhPhone("0")).toBe("0");
    expect(toInternationalKhPhone("012345678901234")).toBe("012345678901234");
  });
});

describe("the visible number is NOT converted", () => {
  it("only the JSON-LD nodes call it", () => {
    // The footer shows what the institution published. Converting there
    // would be changing the organisation's own presentation of itself.
    const shell = readFileSync(
      join(process.cwd(), "components/layout/RootShell.tsx"),
      "utf8",
    );
    expect(shell).toMatch(/telephone: toInternationalKhPhone\(cfg\.phone\)/);
    // Exactly two call sites — the Library node and the Organization node —
    // and nothing else in the shell converted.
    expect(shell.match(/toInternationalKhPhone\(/g)?.length).toBe(2);
  });
});
