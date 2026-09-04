import { describe, expect, it } from "vitest";
import { classifyPdfError, errorActions } from "./errors";

describe("classifyPdfError", () => {
  it("maps pdf.js exception names and HTTP statuses to a screen", () => {
    expect(classifyPdfError({ name: "MissingPDFException", message: "Missing PDF" })).toBe("missing");
    expect(classifyPdfError({ message: "Unexpected server response (404)" })).toBe("missing");
    expect(classifyPdfError({ name: "UnexpectedResponseException", message: "Unexpected server response (401)" })).toBe("permission");
    expect(classifyPdfError({ message: "403 Forbidden" })).toBe("permission");
    expect(classifyPdfError({ name: "InvalidPDFException", message: "Invalid PDF structure" })).toBe("invalid");
    expect(classifyPdfError({ name: "PasswordException", message: "No password given" })).toBe("invalid");
    expect(classifyPdfError({ message: "TypeError: Failed to fetch" })).toBe("network");
    expect(classifyPdfError({ message: "Load failed" })).toBe("network");
  });
  it("never guesses", () => {
    expect(classifyPdfError({ message: "something odd" })).toBe("unknown");
    expect(classifyPdfError(null)).toBe("unknown");
    expect(classifyPdfError(undefined)).toBe("unknown");
  });
});

describe("errorActions", () => {
  it("offers retry only where a retry can help, report only where the file is at fault", () => {
    expect(errorActions("permission", false)).toEqual({ retry: false, report: false, back: true });
    expect(errorActions("invalid", false)).toEqual({ retry: false, report: true, back: true });
    expect(errorActions("missing", false)).toEqual({ retry: true, report: true, back: true });
    expect(errorActions("network", false)).toEqual({ retry: true, report: false, back: false });
    expect(errorActions("unknown", false)).toEqual({ retry: true, report: true, back: true });
  });
  it("offline is a connection problem whatever the underlying kind", () => {
    expect(errorActions("invalid", true)).toEqual({ retry: true, report: false, back: true });
  });
});
