import { describe, expect, it } from "vitest";
import { countryCode, countryName, frequencyCode, indexServiceName, licenseName } from "./vocab";

describe("journal vocabularies", () => {
  it("legacy free-text frequency maps to a code, unknown text does not", () => {
    expect(frequencyCode("Monthly")).toBe("monthly");
    expect(frequencyCode("Bi-monthly")).toBe("bimonthly");
    expect(frequencyCode("Twice a year")).toBe("semiannual");
    expect(frequencyCode("Three issues a year")).toBeNull();
    expect(frequencyCode(null)).toBeNull();
  });

  it("a country is an ISO code or a known name; anything else is shown as typed", () => {
    expect(countryCode("United States")).toBe("US");
    expect(countryCode("kh")).toBe("KH");
    expect(countryCode("Atlantis")).toBeNull();
    expect(countryName("US", "en")).toBe("United States");
    expect(countryName("Atlantis", "en")).toBe("Atlantis");
    expect(countryName("", "en")).toBeNull();
  });

  it("names index services and licences; the publisher-terms licence is labelled by the caller", () => {
    expect(indexServiceName("scopus")).toBe("Scopus");
    expect(indexServiceName("made-up")).toBeNull();
    expect(licenseName("CC-BY-NC-ND-4.0")).toBe("CC BY-NC-ND 4.0");
    expect(licenseName("publisher")).toBeNull();
  });
});
