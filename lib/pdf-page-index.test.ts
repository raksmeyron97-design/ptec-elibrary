import { describe, it, expect } from "vitest";
import { budgetedBatches, MAX_PAGE_CHARS, sanitizeLogId } from "./pdf-page-index";

describe("sanitizeLogId", () => {
  it("keeps an ordinary record id untouched", () => {
    expect(sanitizeLogId("6f1e2a3b-0000-4000-8000-000000000000")).toBe(
      "6f1e2a3b-0000-4000-8000-000000000000",
    );
  });

  it("strips control characters that could forge a log line", () => {
    expect(sanitizeLogId("abc\ndef")).toBe("abcdef");
    expect(sanitizeLogId("abc\rdef")).toBe("abcdef");
    expect(sanitizeLogId("abc\r\n[fake] admin login succeeded")).toBe(
      "abc[fake] admin login succeeded",
    );
  });

  it("strips ANSI escape and NUL bytes", () => {
    const esc = String.fromCharCode(0x1b);
    expect(sanitizeLogId(`abc${esc}[31mred${esc}[0m`)).toBe("abc[31mred[0m");
    expect(sanitizeLogId(`abc${String.fromCharCode(0)}def`)).toBe("abcdef");
  });

  it("caps length so a huge value cannot flood the log", () => {
    expect(sanitizeLogId("x".repeat(500))).toHaveLength(200);
  });
});

const page = (pageNo: number, chars: number) => ({ pageNo, content: "x".repeat(chars) });
const charsIn = (batch: { content: string }[]) => batch.reduce((n, p) => n + p.content.length, 0);

/**
 * The regression these guard against is live in production: three books hold
 * exactly 100 rows with a max page number of 101–103, because the old fixed
 * batch of 100 rows committed once and then exceeded the statement timeout.
 * `book_pages.content` carries a GIN trigram index, so the cost of a statement
 * is the TEXT it carries — and a row here is anything from 20 to 8,000
 * characters.
 */
describe("budgetedBatches", () => {
  it("bounds a statement by text, not by row count", () => {
    const dense = Array.from({ length: 200 }, (_, i) => page(i + 1, 4_000));
    const sparse = Array.from({ length: 200 }, (_, i) => page(i + 1, 250));

    const denseBatches = budgetedBatches(dense);
    const sparseBatches = budgetedBatches(sparse);

    // Far more rows per statement for short pages, and a comparable amount of
    // work in each case — which is the entire point of the change.
    expect(denseBatches[0].length).toBeLessThan(sparseBatches[0].length);
    for (const batch of [...denseBatches, ...sparseBatches]) {
      expect(charsIn(batch)).toBeLessThanOrEqual(120_000 + MAX_PAGE_CHARS);
    }
  });

  it("loses no page and preserves order", () => {
    const pages = Array.from({ length: 617 }, (_, i) => page(i + 1, 100 + ((i * 37) % 3_000)));
    const flattened = budgetedBatches(pages).flat();
    expect(flattened).toHaveLength(pages.length);
    expect(flattened.map((p) => p.pageNo)).toEqual(pages.map((p) => p.pageNo));
  });

  it("sends an oversized page on its own rather than dropping it", () => {
    const pages = [page(1, 500), page(2, MAX_PAGE_CHARS), page(3, 500)];
    const batches = budgetedBatches(pages);
    expect(batches.flat().map((p) => p.pageNo)).toEqual([1, 2, 3]);
  });

  it("caps row count even when every page is tiny", () => {
    const pages = Array.from({ length: 2_000 }, (_, i) => page(i + 1, 25));
    for (const batch of budgetedBatches(pages)) expect(batch.length).toBeLessThanOrEqual(400);
  });

  it("is empty-input safe", () => {
    expect(budgetedBatches([])).toEqual([]);
  });
});
