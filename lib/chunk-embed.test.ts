import { describe, it, expect } from "vitest";
import { chunkPageText, chunkPages, CHUNK_SIZE, CHUNK_OVERLAP, MIN_CHUNK_CHARS } from "./chunk-embed";

// Content arrives whitespace-collapsed from book_pages (extractPdfPages),
// so test inputs use single spaces too.
const SENTENCE =
  "Integral calculus studies the accumulation of quantities and the areas under curves, building on limits and derivatives. ";

// Khmer with coeng stacks (្រ, ្យ, ្ត) and NO spaces — forces the
// grapheme-boundary fallback path, the case that must never split a cluster.
const KHMER =
  "គណិតវិទ្យាសាស្ត្រកម្រិតខ្ពស់សិក្សាអាំងតេក្រាលនិងដេរីវេនៃអនុគមន៍ជាមួយនឹងទ្រឹស្តីបទគ្រឹះនៃគណនាំ";

// Khmer combining marks that must never begin a chunk: dependent vowels and
// signs (U+17B6–U+17D3) attach to the preceding base consonant.
const KHMER_COMBINING = /^[ា-៓]/;

describe("chunkPageText", () => {
  it("returns short pages as a single chunk, untouched", () => {
    const text = SENTENCE.trim();
    expect(chunkPageText(text)).toEqual([text]);
  });

  it("drops fragments below MIN_CHUNK_CHARS", () => {
    expect(chunkPageText("too short")).toEqual([]);
    expect(chunkPageText("   ")).toEqual([]);
  });

  it("splits long English text into overlapping verbatim chunks", () => {
    const text = SENTENCE.repeat(50).trim(); // ~6000 chars
    const chunks = chunkPageText(text);

    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      // Verbatim substrings — chunking must never rewrite the text.
      expect(text).toContain(chunk);
      expect(chunk.length).toBeGreaterThanOrEqual(MIN_CHUNK_CHARS);
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE * 1.3 + 1);
    }
    // Overlap: the start of each chunk was already present in the previous one.
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i - 1]).toContain(chunks[i].slice(0, Math.floor(CHUNK_OVERLAP / 3)));
    }
    // Coverage: nothing lost at either end.
    expect(text.startsWith(chunks[0])).toBe(true);
    expect(text.endsWith(chunks[chunks.length - 1])).toBe(true);
  });

  it("splits space-less Khmer at grapheme boundaries without breaking clusters", () => {
    const text = KHMER.repeat(60); // ~5600 chars, no whitespace anywhere
    const chunks = chunkPageText(text);

    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      expect(text).toContain(chunk); // byte-for-byte intact, no lossy normalization
      // A chunk can never start mid-cluster (combining vowel/sign) …
      expect(chunk).not.toMatch(KHMER_COMBINING);
      // … nor end on a dangling coeng (U+17D2 expects the next consonant).
      expect(chunk.endsWith("្")).toBe(false);
    }
    expect(text.endsWith(chunks[chunks.length - 1])).toBe(true);
  });
});

describe("chunkPages", () => {
  it("keeps page numbers and per-page chunk order", () => {
    const pages = [
      { pageNo: 3, content: SENTENCE.repeat(30) },
      { pageNo: 7, content: SENTENCE.trim() },
    ];
    const chunks = chunkPages(pages);

    const page3 = chunks.filter((c) => c.pageNo === 3);
    const page7 = chunks.filter((c) => c.pageNo === 7);
    expect(page3.length).toBeGreaterThan(1);
    expect(page7).toHaveLength(1);
    expect(chunks).toHaveLength(page3.length + page7.length);
    // chunk_no restarts per page and is sequential.
    expect(page3.map((c) => c.chunkNo)).toEqual(page3.map((_, i) => i));
    expect(page7[0].chunkNo).toBe(0);
  });

  it("skips empty/scanned pages", () => {
    expect(chunkPages([{ pageNo: 1, content: "" }])).toEqual([]);
  });
});
