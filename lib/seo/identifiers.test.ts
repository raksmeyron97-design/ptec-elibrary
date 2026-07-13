import { describe, it, expect } from "vitest";
import {
  normalizeDoi,
  isValidDoi,
  doiUrl,
  normalizeOrcid,
  isValidOrcid,
  orcidUrl,
  normalizeIsbn,
  isValidIsbn,
  normalizeIssn,
  isValidIssn,
  normalizeLicense,
  isRedistributableLicense,
} from "./identifiers";

describe("normalizeDoi", () => {
  it("accepts and passes through a real DOI", () => {
    expect(normalizeDoi("10.1021/ed500143m")).toBe("10.1021/ed500143m");
  });

  it("strips resolver prefixes", () => {
    expect(normalizeDoi("https://doi.org/10.1021/ed500143m")).toBe("10.1021/ed500143m");
    expect(normalizeDoi("https://dx.doi.org/10.1021/ed500143m")).toBe("10.1021/ed500143m");
    expect(normalizeDoi("doi:10.1021/ed500143m")).toBe("10.1021/ed500143m");
    expect(normalizeDoi("  10.1021/ed500143m  ")).toBe("10.1021/ed500143m");
  });

  it("rejects the exact placeholder used in the live record", () => {
    expect(normalizeDoi("10.1234/eds")).toBeNull();
    expect(isValidDoi("10.1234/eds")).toBe(false);
  });

  it("rejects other placeholder prefixes", () => {
    expect(normalizeDoi("10.5555/12345678")).toBeNull();
    expect(normalizeDoi("10.0000/foo")).toBeNull();
  });

  it("rejects structurally invalid values", () => {
    expect(normalizeDoi("not-a-doi")).toBeNull();
    expect(normalizeDoi("10./missing")).toBeNull();
    expect(normalizeDoi("10.12/space in suffix")).toBeNull();
    expect(normalizeDoi("")).toBeNull();
    expect(normalizeDoi(null)).toBeNull();
    expect(normalizeDoi(undefined)).toBeNull();
  });

  it("builds a canonical resolver URL only for valid DOIs", () => {
    expect(doiUrl("10.1021/ed500143m")).toBe("https://doi.org/10.1021/ed500143m");
    expect(doiUrl("10.1234/eds")).toBeNull();
  });
});

describe("normalizeOrcid", () => {
  it("accepts a checksum-valid ORCID and canonicalises grouping", () => {
    // 0000-0002-1825-0097 is the ORCID spec's own worked example (check digit 7).
    expect(normalizeOrcid("0000-0002-1825-0097")).toBe("0000-0002-1825-0097");
    expect(normalizeOrcid("0000000218250097")).toBe("0000-0002-1825-0097");
    expect(normalizeOrcid("https://orcid.org/0000-0002-1825-0097")).toBe("0000-0002-1825-0097");
  });

  it("accepts an X check digit", () => {
    expect(normalizeOrcid("0000-0002-1694-233X")).toBe("0000-0002-1694-233X");
  });

  it("rejects the live placeholder `001`", () => {
    expect(normalizeOrcid("001")).toBeNull();
    expect(isValidOrcid("001")).toBe(false);
  });

  it("rejects a value with a wrong checksum", () => {
    expect(normalizeOrcid("0000-0002-1825-0098")).toBeNull();
    expect(normalizeOrcid("0000-0002-1825-0000")).toBeNull();
  });

  it("rejects the all-zero ORCID and malformed lengths", () => {
    expect(normalizeOrcid("0000-0000-0000-0000")).toBeNull();
    expect(normalizeOrcid("0000-0002-1825")).toBeNull();
    expect(normalizeOrcid(null)).toBeNull();
  });

  it("builds an orcid.org URL only for valid values", () => {
    expect(orcidUrl("0000-0002-1825-0097")).toBe("https://orcid.org/0000-0002-1825-0097");
    expect(orcidUrl("001")).toBeNull();
  });
});

describe("normalizeIsbn", () => {
  it("validates ISBN-13 by checksum", () => {
    // The reviewed book in the live record.
    expect(normalizeIsbn("978-0-470-50552-6")).toBe("9780470505526");
    expect(isValidIsbn("978-0-470-50552-6")).toBe(true);
  });

  it("validates ISBN-10 including X", () => {
    expect(normalizeIsbn("0-306-40615-2")).toBe("0306406152");
    expect(normalizeIsbn("080442957X")).toBe("080442957X");
  });

  it("rejects a bad checksum and sentinels", () => {
    expect(normalizeIsbn("978-0-470-50552-7")).toBeNull();
    expect(normalizeIsbn("N/A")).toBeNull();
    expect(normalizeIsbn("123")).toBeNull();
    expect(normalizeIsbn(null)).toBeNull();
  });
});

describe("normalizeIssn", () => {
  it("validates the Journal of Chemical Education ISSNs", () => {
    expect(normalizeIssn("0021-9584")).toBe("0021-9584");
    expect(normalizeIssn("00219584")).toBe("0021-9584");
    expect(normalizeIssn("1938-1328")).toBe("1938-1328");
  });

  it("rejects a bad checksum", () => {
    expect(normalizeIssn("0021-9585")).toBeNull();
    expect(isValidIssn("0021-9585")).toBe(false);
    expect(normalizeIssn("123")).toBeNull();
  });
});

describe("normalizeLicense", () => {
  it("rejects the invalid live value `CC BY 44`", () => {
    expect(normalizeLicense("CC BY 44")).toBeNull();
    expect(isRedistributableLicense("CC BY 44")).toBe(false);
  });

  it("resolves canonical CC strings to a deed URL + redistributable flag", () => {
    expect(normalizeLicense("CC BY 4.0")).toEqual({
      name: "CC BY 4.0",
      url: "https://creativecommons.org/licenses/by/4.0/",
      redistributable: true,
    });
    expect(normalizeLicense("cc-by-nc-nd-4.0")).toEqual({
      name: "CC BY-NC-ND 4.0",
      url: "https://creativecommons.org/licenses/by-nc-nd/4.0/",
      redistributable: true,
    });
  });

  it("defaults a bare `CC BY` to 4.0", () => {
    expect(normalizeLicense("CC BY")?.name).toBe("CC BY 4.0");
  });

  it("recognises a canonical CC URL", () => {
    expect(normalizeLicense("https://creativecommons.org/licenses/by-sa/3.0/")).toEqual({
      name: "CC BY-SA 3.0",
      url: "https://creativecommons.org/licenses/by-sa/3.0/",
      redistributable: true,
    });
  });

  it("recognises CC0 / public domain", () => {
    expect(normalizeLicense("CC0")?.redistributable).toBe(true);
    expect(normalizeLicense("CC0")?.name).toBe("CC0 1.0");
  });

  it("returns null for unknown bespoke strings (no open-access claim)", () => {
    expect(normalizeLicense("All rights reserved")).toBeNull();
    expect(normalizeLicense("Copyright © 2014 ACS")).toBeNull();
    expect(normalizeLicense(null)).toBeNull();
  });
});
