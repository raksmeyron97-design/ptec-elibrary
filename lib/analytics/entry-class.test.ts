import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

vi.mock("server-only", () => ({}));

import {
  ENTRY_STORAGE_KEY,
  classifyEntry,
  isEntryClass,
  landingEntryClass,
} from "@/lib/analytics/entry-class";
import { entryClassEnabled, entryClassForLog } from "@/lib/analytics/entry-class-server";

const OWN = "library.ptec.edu.kh";

describe("classifyEntry — hosts", () => {
  it.each([
    ["www.google.com", "search"],
    ["google.com.kh", "search"],
    ["www.google.co.uk", "search"],
    ["bing.com", "search"],
    ["www.bing.com", "search"],
    ["duckduckgo.com", "search"],
    ["search.yahoo.co.jp", "search"],
    ["yandex.ru", "search"],
    ["www.baidu.com", "search"],
    ["facebook.com", "social"],
    ["m.facebook.com", "social"],
    ["l.facebook.com", "social"],
    ["lm.facebook.com", "social"],
    ["t.me", "social"],
    ["telegram.org", "social"],
    ["www.ptec.edu.kh", "referral"],
    ["sala.moeys.gov.kh", "referral"],
    ["googleusercontent.example.com", "referral"],
    ["notgoogle.com", "referral"],
  ])("%s → %s", (host, expected) => {
    expect(classifyEntry(host, OWN)).toBe(expected);
  });

  it("no referrer is direct", () => {
    expect(classifyEntry(null, OWN)).toBe("direct");
    expect(classifyEntry(undefined, OWN)).toBe("direct");
    expect(classifyEntry("", OWN)).toBe("direct");
    expect(classifyEntry("  ", OWN)).toBe("direct");
  });

  it("our own host is internal, with or without www and in any case", () => {
    expect(classifyEntry(OWN, OWN)).toBe("internal");
    expect(classifyEntry("WWW.Library.PTEC.edu.kh", OWN)).toBe("internal");
    expect(classifyEntry("localhost:3000", "localhost:3000")).toBe("internal");
  });

  it("refuses a URL — a referrer URL can carry the visitor's search query", () => {
    for (const url of [
      "https://www.google.com/search?q=grade+9",
      "www.google.com/search",
      "google.com?q=x",
      "user@google.com",
      "google.com#frag",
    ]) {
      expect(() => classifyEntry(url, OWN), url).toThrow(TypeError);
    }
  });
});

describe("landingEntryClass — the browser half", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  function referrer(value: string) {
    vi.spyOn(document, "referrer", "get").mockReturnValue(value);
  }

  it("classifies the landing referrer once and stores only the class", () => {
    referrer("https://www.google.com/search?q=private+words");
    expect(landingEntryClass()).toBe("search");
    expect(sessionStorage.getItem(ENTRY_STORAGE_KEY)).toBe("search");
    const stored = JSON.stringify({ ...sessionStorage });
    expect(stored).not.toContain("google");
    expect(stored).not.toContain("private");
  });

  it("a later page in the same tab keeps the landing class", () => {
    referrer("https://t.me/");
    expect(landingEntryClass()).toBe("social");
    referrer(`${window.location.origin}/books`);
    expect(landingEntryClass()).toBe("social");
  });

  it("ignores a tampered stored value", () => {
    sessionStorage.setItem(ENTRY_STORAGE_KEY, "https://evil.example/");
    referrer("");
    expect(landingEntryClass()).toBe("direct");
  });

  it("survives blocked storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    referrer("https://bing.com/");
    expect(landingEntryClass()).toBe("search");
  });
});

describe("the server keeps only a valid class, and only while the switch is on", () => {
  it("validates the browser's value", () => {
    expect(entryClassForLog("search", {})).toBe("search");
    expect(entryClassForLog("https://google.com", {})).toBeNull();
    expect(entryClassForLog(42, {})).toBeNull();
    expect(entryClassForLog(undefined, {})).toBeNull();
    expect(isEntryClass("internal")).toBe(true);
  });

  it("ENTRY_CLASS=off stores nothing; anything else stays on", () => {
    expect(entryClassEnabled({})).toBe(true);
    expect(entryClassEnabled({ ENTRY_CLASS: "on" })).toBe(true);
    expect(entryClassEnabled({ ENTRY_CLASS: "off" })).toBe(false);
    expect(entryClassForLog("search", { ENTRY_CLASS: "off" })).toBeNull();
  });
});

// ── Source scan: nothing that writes analytics stores a referrer ───────────

const ROOT = path.resolve(__dirname, "../..");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Every file that may write an analytics row, or hand one its values. */
function analyticsWriters(): string[] {
  const out = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "lib/analytics", "app/actions", "components/analytics", "components/ui/books/BookViewPing.tsx", "components/ui/reader"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return out.split("\n").filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));
}

export function referrerLeaks(file: string, rawSrc: string): string[] {
  const src = stripComments(rawSrc);
  const out: string[] = [];
  if (file !== "lib/analytics/entry-class.ts" && /document\.referrer/.test(src)) {
    out.push(`${file} reads document.referrer`);
  }
  // A logged row naming the referrer, a URL or a path is the leak itself.
  if (/\b(referrer|referer|referrer_url|referrer_host|landing_url|landing_path)\s*:/.test(src)) {
    out.push(`${file} writes a referrer/URL field`);
  }
  return out;
}

describe("no analytics writer stores a referrer, a URL or a path", () => {
  const files = analyticsWriters();

  it("finds the writers it scans", () => {
    expect(files).toContain("lib/analytics/events.ts");
    expect(files).toContain("app/actions/view-count.ts");
  });

  it("only the classifier reads document.referrer, and no row carries one", () => {
    const leaks = files.flatMap((f) => referrerLeaks(f, readFileSync(path.join(ROOT, f), "utf8")));
    expect(leaks).toEqual([]);
  });

  it("negative control: a ping that sends the referrer is caught", () => {
    const broken = `incrementViewCount(bookId, document.referrer)`;
    expect(referrerLeaks("components/ui/books/BookViewPing.tsx", broken)).toHaveLength(1);
  });

  it("negative control: a row with a referrer field is caught", () => {
    const broken = `await supabase.from("view_logs").insert({ content_id: id, referrer: url })`;
    expect(referrerLeaks("lib/analytics/events.ts", broken)).toHaveLength(1);
  });
});
