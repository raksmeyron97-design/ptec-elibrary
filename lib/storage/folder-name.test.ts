import { describe, expect, it } from "vitest";

import {
  STORAGE_SEGMENT_BUDGET,
  ZIMA_SEGMENT_MAX,
  buildStorageFolderName,
  clampStorageSegment,
  describeStorageKeyError,
  describeStoragePathError,
  folderNameNote,
  isSafeStorageSegment,
  storageSegmentIssue,
} from "./folder-name";
import { bookFolder, makeUid, postFolder, publicationFolder, slugify, thesisFolder } from "@/lib/book-utils";

/**
 * The storage server's own rule, copied verbatim from its
 * `lib/safeFiles.js` → `isValidFolderPath()`. Every expectation below is
 * ultimately checked against THIS, not against our belief about it: if the
 * server ever relaxes or tightens the rule, this is the single line to change.
 */
const SERVER_RULE = /^[a-zA-Z0-9_\- ក-៿]{1,80}$/;

/** What the server actually does to an `x-folder` value: split, test each. */
function serverAccepts(folderPath: string): boolean {
  return folderPath
    .split("/")
    .every((s) => SERVER_RULE.test(s) && s !== ".." && s.trim() !== "");
}

const UID = "jm0p7tqz";

// The real title from the failed 86-row import — 116 characters slugified.
const LONG_ASCII =
  "Interviewing as Qualitative Research: A Guide for Researchers in Education and the Social Sciences (3rd Edition)";

const LONG_KHMER =
  "សៀវភៅណែនាំអំពីវិធីសាស្ត្រស្រាវជ្រាវបែបគុណភាពសម្រាប់និស្សិតបរិញ្ញាបត្រជាន់ខ្ពស់នៃវិទ្យាស្ថានជាតិអប់រំ";

describe("the rule this module implements", () => {
  it("is a per-segment character cap, not a byte cap and not a whole-path cap", () => {
    // 80 Khmer characters is 240 UTF-8 bytes and still one segment the server
    // accepts — proof the quantifier counts characters. This is why a Khmer
    // title needs no smaller budget than an English one.
    expect(SERVER_RULE.test("ក".repeat(80))).toBe(true);
    expect(SERVER_RULE.test("ក".repeat(81))).toBe(false);
    expect(Buffer.byteLength("ក".repeat(80))).toBe(240);

    // Depth and total length are unconstrained: four 80-char segments pass.
    expect(serverAccepts(Array(4).fill("a".repeat(80)).join("/"))).toBe(true);
  });

  it("excludes the characters our builder must therefore never emit", () => {
    expect(SERVER_RULE.test("has.a.dot")).toBe(false);
    expect(SERVER_RULE.test("percent%20encoded")).toBe(false); // how Khmer arrives
    expect(SERVER_RULE.test("plus+sign")).toBe(false);
  });
});

describe("buildStorageFolderName", () => {
  it("fits a long ASCII title that previously produced a 400", () => {
    const name = buildStorageFolderName(LONG_ASCII, UID, "book");
    expect(name.length).toBeLessThanOrEqual(STORAGE_SEGMENT_BUDGET);
    expect(serverAccepts(name)).toBe(true);
    expect(name.endsWith(`-${UID}`)).toBe(true);
  });

  it("keeps the uid intact — it is all that separates two truncated titles", () => {
    const a = buildStorageFolderName(LONG_ASCII, "aaaaaaaa", "book");
    const b = buildStorageFolderName(LONG_ASCII, "bbbbbbbb", "book");
    expect(a).not.toBe(b);
    expect(a.endsWith("-aaaaaaaa")).toBe(true);
    expect(b.endsWith("-bbbbbbbb")).toBe(true);
  });

  it("separates two books that share their first 60 characters", () => {
    const shared = "Research Design Qualitative Quantitative and Mixed Methods Approaches";
    const a = bookFolder("Research", `${shared} Volume One`, makeUid());
    const b = bookFolder("Research", `${shared} Volume Two`, makeUid());
    expect(a).not.toBe(b);
    expect(serverAccepts(a)).toBe(true);
    expect(serverAccepts(b)).toBe(true);
  });

  it("cuts at a word boundary and leaves no trailing hyphen", () => {
    const name = buildStorageFolderName(LONG_ASCII, UID, "book");
    const base = name.slice(0, name.lastIndexOf("-"));
    expect(base).not.toMatch(/-$/);
    // Every retained word is a whole word from the original slug.
    expect("interviewing-as-qualitative-research-a-guide-for-researchers-in-education-and-the-social-sciences-3rd-edition").toContain(base);
  });

  it("still truncates when the title has no word boundary to cut at", () => {
    const runOn = "a".repeat(200);
    const name = buildStorageFolderName(runOn, UID, "book");
    expect(name.length).toBeLessThanOrEqual(STORAGE_SEGMENT_BUDGET);
    expect(name.endsWith(`-${UID}`)).toBe(true);
    expect(name.startsWith("aaa")).toBe(true); // not truncated to nothing
  });

  it("falls back to book-<uid> for a title that slugifies to nothing", () => {
    expect(buildStorageFolderName(LONG_KHMER, UID, "book")).toBe(`book-${UID}`);
    expect(buildStorageFolderName("", UID, "book")).toBe(`book-${UID}`);
    expect(buildStorageFolderName("!!! ***", UID, "book")).toBe(`book-${UID}`);
    expect(buildStorageFolderName(null, UID, "book")).toBe(`book-${UID}`);
  });

  it("produces a valid folder for a long Khmer-only title", () => {
    const folder = bookFolder("ការអប់រំ", LONG_KHMER, UID);
    expect(serverAccepts(folder)).toBe(true);
    // Both variable segments fell back rather than carrying Khmer, because a
    // non-ASCII x-folder header is percent-encoded and then refused.
    expect(folder).toBe(`books/uncategorized/book-${UID}`);
  });

  it("handles a mixed Khmer/English title by keeping the English part", () => {
    const folder = buildStorageFolderName("សៀវភៅភាសាអង់គ្លេស English Book", UID, "book");
    expect(folder).toBe(`english-book-${UID}`);
    expect(serverAccepts(folder)).toBe(true);
  });

  describe("at the boundary", () => {
    // A slug that lands exactly on the budget once the "-uid" is reserved.
    const room = STORAGE_SEGMENT_BUDGET - (UID.length + 1);
    const exact = "ab".repeat(Math.ceil(room / 2)).slice(0, room); // no hyphens: nothing to cut at

    it("passes a title exactly at the limit through untouched", () => {
      const name = buildStorageFolderName(exact, UID, "book");
      expect(name).toBe(`${exact}-${UID}`);
      expect(name.length).toBe(STORAGE_SEGMENT_BUDGET);
      expect(serverAccepts(name)).toBe(true);
    });

    it("truncates a title one character over the limit", () => {
      const name = buildStorageFolderName(`${exact}z`, UID, "book");
      expect(name.length).toBe(STORAGE_SEGMENT_BUDGET);
      expect(name).toBe(`${exact}-${UID}`);
    });

    it("never exceeds the server's hard cap for any title length", () => {
      for (let n = 0; n <= 300; n += 7) {
        const name = buildStorageFolderName("word ".repeat(n), UID, "book");
        expect(name.length).toBeLessThanOrEqual(ZIMA_SEGMENT_MAX);
        expect(serverAccepts(name)).toBe(true);
      }
    });
  });
});

describe("clampStorageSegment", () => {
  it("clamps a long category and falls back when it slugifies to nothing", () => {
    const long = clampStorageSegment("Educational Research and Evaluation Methods for Teacher Training Colleges", "uncategorized");
    expect(long.length).toBeLessThanOrEqual(STORAGE_SEGMENT_BUDGET);
    expect(serverAccepts(long)).toBe(true);
    expect(clampStorageSegment("ភាសាខ្មែរ", "uncategorized")).toBe("uncategorized");
    expect(clampStorageSegment("", "uncategorized")).toBe("uncategorized");
  });
});

describe("every folder builder in the app", () => {
  const titles = [LONG_ASCII, LONG_KHMER, "", "!!!", "a".repeat(300), "Normal Title"];

  it("emits a path the storage server accepts", () => {
    for (const title of titles) {
      const uid = makeUid();
      for (const folder of [
        bookFolder("Research Methods", title, uid),
        bookFolder(LONG_ASCII, title, uid),
        postFolder(title, uid),
        thesisFolder(title, uid),
        publicationFolder(title, uid),
      ]) {
        expect(serverAccepts(folder), folder).toBe(true);
        expect(describeStoragePathError(folder), folder).toBeNull();
      }
    }
  });
});

describe("makeUid", () => {
  it("is 8 url-safe characters", () => {
    expect(makeUid()).toMatch(/^[a-z0-9]{8}$/);
  });

  it("does not collide for ids minted in the same millisecond", () => {
    // The bulk importer builds every job in one synchronous pass, so a purely
    // time-derived uid handed the same millisecond to many rows — and once
    // long titles truncate to a shared prefix, the uid is the only thing left
    // keeping their folders apart.
    const ids = new Set(Array.from({ length: 500 }, () => makeUid()));
    expect(ids.size).toBe(500);
  });
});

describe("describeStoragePathError", () => {
  it("says nothing about a path the server accepts", () => {
    expect(describeStoragePathError("books/uncategorized/a-guide-jm0p7t")).toBeNull();
    expect(describeStoragePathError("books")).toBeNull();
  });

  it("reports the length against the real cap", () => {
    const over = "a".repeat(104);
    const msg = describeStoragePathError(`books/uncategorized/${over}`);
    expect(msg).toContain("104/80");
    expect(msg).toMatch(/too long/i);
  });

  it("distinguishes non-Latin from merely illegal characters", () => {
    expect(describeStoragePathError("books/ភាសាខ្មែរ")).toMatch(/non-Latin/);
    expect(describeStoragePathError("books/has.a.dot")).toMatch(/characters storage rejects/);
  });

  it("ignores the file name in a full object key", () => {
    // "book.pdf" carries a dot the folder charset forbids; only folders count.
    expect(describeStorageKeyError("books/uncategorized/a-guide-jm0p7t/book.pdf")).toBeNull();
    expect(describeStorageKeyError(`books/${"a".repeat(90)}/book.pdf`)).toMatch(/too long/i);
  });
});

describe("storageSegmentIssue / isSafeStorageSegment", () => {
  it("classifies each rejection reason", () => {
    expect(storageSegmentIssue("fine-name_1")).toBeNull();
    expect(storageSegmentIssue("")).toBe("empty");
    expect(storageSegmentIssue("a".repeat(81))).toBe("too-long");
    expect(storageSegmentIssue("ក")).toBe("non-ascii");
    expect(storageSegmentIssue("a.b")).toBe("bad-chars");
  });

  it("accepts only what the builder can emit", () => {
    expect(isSafeStorageSegment(buildStorageFolderName(LONG_ASCII, UID, "book"))).toBe(true);
    expect(isSafeStorageSegment("a name with spaces")).toBe(false); // legal server-side, never emitted
  });
});

describe("folderNameNote", () => {
  it("tells truncation and fallback apart", () => {
    // The distinction the bulk importer reports: a long English title is
    // shortened, a Khmer title has nothing to shorten and falls back. Reading
    // both as "truncated" is what made the nine book-<uid> folders from the
    // failed import look like damage rather than the documented normal case.
    expect(folderNameNote(LONG_ASCII, UID)).toBe("truncated");
    expect(folderNameNote(LONG_KHMER, UID)).toBe("fallback");
    expect(folderNameNote("", UID)).toBe("fallback");
    expect(folderNameNote("A Short Title", UID)).toBe("exact");
  });

  it("agrees with what the builder actually did", () => {
    for (const title of [LONG_ASCII, LONG_KHMER, "A Short Title", "a".repeat(200), ""]) {
      const name = buildStorageFolderName(title, UID, "book");
      const note = folderNameNote(title, UID);
      if (note === "exact") expect(name).toBe(`${asciiSlugOf(title)}-${UID}`);
      if (note === "fallback") expect(name).toBe(`book-${UID}`);
      if (note === "truncated") expect(name.length).toBeLessThan(asciiSlugOf(title).length + UID.length + 1);
    }
  });
});

/** Local mirror of the slugifier, so the assertion above states its own terms. */
function asciiSlugOf(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

describe("the public URL slug is NEVER clamped by the storage budget", () => {
  /**
   * Two values are derived from a title and only ONE of them may be shortened.
   * The public URL is already shared, bookmarked, indexed, and embedded in the
   * APA/BibTeX/RIS citations rendered on every book page; the Zima folder is
   * an internal storage key nobody links to. Clamping the wrong one of these
   * would break live URLs to fix an upload bug — so the separation is pinned
   * here rather than left to whoever next edits the folder builder.
   */
  const LIVE_URLS: Array<[string, string]> = [
    [
      "SPSS Survival Manual: A Step by Step Guide to Data Analysis Using IBM SPSS",
      "spss-survival-manual-a-step-by-step-guide-to-data-analysis-using-ibm-spss",
    ],
    [
      "The Action Research Planner: Doing Critical Participatory Action Research",
      "the-action-research-planner-doing-critical-participatory-action-research",
    ],
  ];

  it("still produces the exact slugs already published", () => {
    for (const [title, slug] of LIVE_URLS) {
      expect(slugify(title), `/books/${slug}`).toBe(slug);
    }
  });

  it("gives a newly uploaded long-titled book a FULL-length public URL", () => {
    const slug = slugify(LONG_ASCII);
    expect(slug).toBe(
      "interviewing-as-qualitative-research-a-guide-for-researchers-in-education-and-the-social-sciences-3rd-edition",
    );
    expect(slug.length).toBe(109);
    // …while the same title's storage folder is shortened.
    const segment = bookFolder("uncategorized", LONG_ASCII, UID).split("/").pop()!;
    expect(segment.length).toBeLessThanOrEqual(STORAGE_SEGMENT_BUDGET);
    expect(slug.length).toBeGreaterThan(segment.length);
  });

  it("keeps a Khmer title's public URL in Khmer, though its folder falls back", () => {
    // asciiSlug is for storage only. If the URL slugifier ever started using
    // it, every Khmer book's URL would collapse to "book-<something>".
    expect(slugify(LONG_KHMER)).toContain("ស");
    expect(buildStorageFolderName(LONG_KHMER, UID, "book")).toBe(`book-${UID}`);
  });
});
