import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { READER_SHORTCUTS, shortcutFor, type ReaderAction } from "./shortcuts";

describe("shortcutFor", () => {
  it("resolves plain keys", () => {
    expect(shortcutFor({ key: "ArrowRight" })).toBe("nextPage");
    expect(shortcutFor({ key: "PageUp" })).toBe("prevPage");
    expect(shortcutFor({ key: "Home" })).toBe("firstPage");
    expect(shortcutFor({ key: "End" })).toBe("lastPage");
    expect(shortcutFor({ key: "=" })).toBe("zoomIn");
    expect(shortcutFor({ key: "-" })).toBe("zoomOut");
    expect(shortcutFor({ key: "F" })).toBe("focusMode");
    expect(shortcutFor({ key: "r" })).toBe("rotate");
    expect(shortcutFor({ key: "/" })).toBe("search");
    expect(shortcutFor({ key: "b" })).toBe("bookmark");
    expect(shortcutFor({ key: "?" })).toBe("shortcuts");
    expect(shortcutFor({ key: "Escape" })).toBe("escape");
  });
  it("leaves browser shortcuts alone — Ctrl/⌘/Alt + a plain key is nobody's", () => {
    expect(shortcutFor({ key: "f", ctrlKey: true })).toBeNull();
    expect(shortcutFor({ key: "-", metaKey: true })).toBeNull();
    expect(shortcutFor({ key: "ArrowRight", altKey: true })).toBeNull();
  });
  it("claims Ctrl/⌘+0 only WITH the modifier", () => {
    expect(shortcutFor({ key: "0", metaKey: true })).toBe("resetZoom");
    expect(shortcutFor({ key: "0", ctrlKey: true })).toBe("resetZoom");
    expect(shortcutFor({ key: "0" })).toBeNull();
  });
  it("ignores unbound keys", () => {
    expect(shortcutFor({ key: "x" })).toBeNull();
  });
});

describe("the help dialog cannot advertise a key that does nothing", () => {
  const handlerSource = readFileSync(path.resolve(__dirname, "../../components/ui/reader/PDFViewer.tsx"), "utf8");
  const actions = READER_SHORTCUTS.map((s) => s.action).filter((a): a is Exclude<ReaderAction, "escape"> => a !== "escape");

  it.each(actions)("the viewer handles the %s action", (action) => {
    expect(handlerSource).toContain(`case "${action}":`);
  });

  it("gives every shortcut a label key that exists in both catalogues", async () => {
    const en = (await import("@/messages/en.json")).default as unknown as { reader: Record<string, string> };
    const km = (await import("@/messages/km.json")).default as unknown as { reader: Record<string, string> };
    for (const s of READER_SHORTCUTS) {
      expect(en.reader[s.labelKey], `en: ${s.labelKey}`).toBeTruthy();
      expect(km.reader[s.labelKey], `km: ${s.labelKey}`).toBeTruthy();
    }
  });

  it("has no duplicate keys across bindings", () => {
    const seen = new Map<string, string>();
    for (const s of READER_SHORTCUTS) {
      for (const k of s.keys) {
        const id = `${s.modifier ?? ""}${k}`;
        expect(seen.has(id), `${k} bound twice (${seen.get(id)} and ${s.action})`).toBe(false);
        seen.set(id, s.action);
      }
    }
  });
});
