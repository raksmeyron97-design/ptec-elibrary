import { describe, it, expect } from "vitest";
import { resolveBookDownloadAccess, bookDownloadAllowed } from "./access";

const FILE = "https://cdn.example/books/x/book.pdf";

describe("resolveBookDownloadAccess", () => {
  it("allows both actions for an ordinary book", () => {
    expect(resolveBookDownloadAccess({ allow_download: true, fileUrl: FILE })).toEqual({
      canDownload: true,
      canReadOnline: true,
      canServeBytes: true,
      canQuoteText: true,
      canSaveOffline: true,
      canAdvertiseFile: true,
      fileAccess: "public",
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
      canServeBytes: false,
      canQuoteText: false,
      canSaveOffline: false,
      canAdvertiseFile: false,
      fileAccess: "public",
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

// ── 0151: catalogue-record-only ──────────────────────────────────────────────

describe("resolveBookDownloadAccess — file_access (0151)", () => {
  const FILE_URL = "https://storage.example/book.pdf";

  it("answers the whole capability table", () => {
    const table = [
      { file_access: "public", download: true, read: true, bytes: true, quote: true, offline: true, advertise: true },
      { file_access: "read_online", download: false, read: true, bytes: true, quote: true, offline: false, advertise: false },
      { file_access: "catalogue_only", download: false, read: false, bytes: false, quote: false, offline: false, advertise: false },
    ] as const;
    for (const row of table) {
      const a = resolveBookDownloadAccess({ file_access: row.file_access, fileUrl: FILE_URL });
      expect({
        download: a.canDownload,
        read: a.canReadOnline,
        bytes: a.canServeBytes,
        quote: a.canQuoteText,
        offline: a.canSaveOffline,
        advertise: a.canAdvertiseFile,
      }).toEqual({
        download: row.download,
        read: row.read,
        bytes: row.bytes,
        quote: row.quote,
        offline: row.offline,
        advertise: row.advertise,
      });
    }
  });

  // The 0131 rule, carried forward to the new column. A select that does not
  // ask for file_access, or a row written before 0151, must read as public —
  // a partial select can never silently withdraw a book.
  it("treats an absent, null or unrecognised value as public", () => {
    for (const value of [undefined, null, "", "PUBLIC", "restricted", "catalogue-only"]) {
      const a = resolveBookDownloadAccess({ file_access: value, fileUrl: FILE_URL });
      expect(a.fileAccess).toBe("public");
      expect(a.canDownload).toBe(true);
      expect(a.canServeBytes).toBe(true);
    }
  });

  it("still honours a legacy allow_download = false on its own", () => {
    // A caller that selected the 0131 column and not the 0151 one. The
    // database trigger keeps the two in step, so this is the same book.
    const a = resolveBookDownloadAccess({ allow_download: false, fileUrl: FILE_URL });
    expect(a.canDownload).toBe(false);
    expect(a.canReadOnline).toBe(true);
    expect(a.canServeBytes).toBe(true);
    expect(a.fileAccess).toBe("read_online");
  });

  it("never lets a legacy allow_download = true loosen catalogue_only", () => {
    // The application half of the trigger's RAISE: even handed both columns
    // in contradiction, the stricter one decides.
    const a = resolveBookDownloadAccess({
      file_access: "catalogue_only",
      allow_download: true,
      fileUrl: FILE_URL,
    });
    expect(a.canServeBytes).toBe(false);
    expect(a.canQuoteText).toBe(false);
    expect(a.reason).toBe("catalogue-only");
  });

  it("distinguishes 'we hold the record, not the file' from 'you may not keep it'", () => {
    // Two different sentences to a reader, so they must be two reasons.
    expect(resolveBookDownloadAccess({ file_access: "read_online", fileUrl: FILE_URL }).reason).toBe("policy");
    expect(resolveBookDownloadAccess({ file_access: "catalogue_only", fileUrl: FILE_URL }).reason).toBe("catalogue-only");
  });

  it("reports the missing file before the policy, for catalogue_only too", () => {
    const a = resolveBookDownloadAccess({ file_access: "catalogue_only", fileUrl: null });
    expect(a.reason).toBe("no-file");
  });

  it("carries the librarian's own wording into the catalogue-only state", () => {
    const a = resolveBookDownloadAccess({
      file_access: "catalogue_only",
      download_disabled_reason: "  Rights under review  ",
      fileUrl: FILE_URL,
    });
    expect(a.message).toBe("Rights under review");
  });
});
