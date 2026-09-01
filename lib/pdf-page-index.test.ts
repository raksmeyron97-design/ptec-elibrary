import { describe, it, expect } from "vitest";
import { sanitizeLogId } from "./pdf-page-index";

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
