import { describe, it, expect } from "vitest";
import { resolveBookDownloadAccess, bookDownloadAllowed } from "./access";

const FILE = "https://cdn.example/books/x/book.pdf";

describe("resolveBookDownloadAccess", () => {
  it("allows both actions for an ordinary book", () => {
    expect(resolveBookDownloadAccess({ allow_download: true, fileUrl: FILE })).toEqual({
      canDownload: true,
      canReadOnline: true,
      reason: null,
      message: null,
    });
  });

  // THE backward-compatibility invariant. Every book that existed before 0131
  // is read either with the column defaulted to true or, on a select that does
  // not ask for it, with the field absent. Both must stay downloadable.
  it.each([
    ["column absent (pre-migration / partial select)", undefined],
    ["column null", null],
    ["column true", true],
  ])("stays downloadable when allow_download is %s", (_label, value) => {
    const access = resolveBookDownloadAccess({ allow_download: value, fileUrl: FILE });
    expect(access.canDownload).toBe(true);
    expect(access.reason).toBeNull();
  });

  it("refuses the download but keeps online reading when the library switched it off", () => {
    const access = resolveBookDownloadAccess({ allow_download: false, fileUrl: FILE });
    expect(access.canDownload).toBe(false);
    expect(access.canReadOnline).toBe(true);
    expect(access.reason).toBe("policy");
  });

  it("carries the librarian's wording, and ignores a blank one", () => {
    expect(
      resolveBookDownloadAccess({
        allow_download: false,
        download_disabled_reason: "Publisher licence covers reading only.",
        fileUrl: FILE,
      }).message,
    ).toBe("Publisher licence covers reading only.");

    expect(
      resolveBookDownloadAccess({
        allow_download: false,
        download_disabled_reason: "   ",
        fileUrl: FILE,
      }).message,
    ).toBeNull();
  });

  it("refuses BOTH actions when there is no file — 'no-file' is not 'read online only'", () => {
    const access = resolveBookDownloadAccess({ allow_download: true, fileUrl: null });
    expect(access).toEqual({
      canDownload: false,
      canReadOnline: false,
      reason: "no-file",
      message: null,
    });
  });

  it("reports the missing file before the policy — a restriction message on nothing has nowhere to go", () => {
    expect(
      resolveBookDownloadAccess({ allow_download: false, fileUrl: null }).reason,
    ).toBe("no-file");
  });
});

describe("bookDownloadAllowed", () => {
  it("mirrors the full resolution for the flag-only callers", () => {
    expect(bookDownloadAllowed(true)).toBe(true);
    expect(bookDownloadAllowed(undefined)).toBe(true);
    expect(bookDownloadAllowed(null)).toBe(true);
    expect(bookDownloadAllowed(false)).toBe(false);
    expect(bookDownloadAllowed(true, false)).toBe(false);
  });
});
