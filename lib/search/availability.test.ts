import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_VALUES,
  DIGITAL_AVAILABILITY,
  PHYSICAL_AVAILABILITY,
  canonicalAvailabilitySelection,
  canonicalLanguage,
  digitalAvailability,
  physicalAvailability,
} from "./availability";

describe("availability vocabulary", () => {
  it("is exactly three digital and three physical values", () => {
    expect([...DIGITAL_AVAILABILITY, ...PHYSICAL_AVAILABILITY].sort()).toEqual([...AVAILABILITY_VALUES].sort());
  });
});

describe("digitalAvailability", () => {
  it("distinguishes downloadable from read-online from no file", () => {
    expect(digitalAvailability({ hasFile: true, canDownload: true })).toBe("downloadable");
    expect(digitalAvailability({ hasFile: true, canDownload: false })).toBe("read_online");
    expect(digitalAvailability({ hasFile: false, canDownload: true })).toBe("metadata_only");
  });
});

describe("physicalAvailability", () => {
  it("reads copy counters and never invents a count", () => {
    expect(physicalAvailability({ copiesTotal: 2, copiesAvailable: 2 })).toBe("physical_available");
    expect(physicalAvailability({ copiesTotal: 2, copiesAvailable: 0 })).toBe("physical_unavailable");
    expect(physicalAvailability({ copiesTotal: 0, copiesAvailable: 0 })).toBe("physical_record");
    expect(physicalAvailability({ copiesTotal: null, copiesAvailable: null })).toBe("physical_record");
  });
});

describe("canonicalAvailabilitySelection", () => {
  it("maps legacy chips and passes canonical values through", () => {
    expect(canonicalAvailabilitySelection(["Digital"])).toEqual(["downloadable", "read_online"]);
    expect(canonicalAvailabilitySelection(["downloadable", "Available"])).toEqual(["downloadable", "physical_available"]);
    expect(canonicalAvailabilitySelection(["On shelf record"])).toEqual(["physical_unavailable", "physical_record"]);
    expect(canonicalAvailabilitySelection(["read_online", "read_online"])).toEqual(["read_online"]);
  });

  it("keeps an unknown value so it can still be unchecked", () => {
    expect(canonicalAvailabilitySelection(["Guided path"])).toEqual(["Guided path"]);
  });
});

describe("canonicalLanguage", () => {
  it("folds the stored spellings of the two collection languages", () => {
    for (const v of ["en", "English", "ENGLISH", "eng"]) expect(canonicalLanguage(v)).toBe("English");
    for (const v of ["kh", "km", "Khmer", "khmer", "ខ្មែរ"]) expect(canonicalLanguage(v)).toBe("Khmer");
    expect(canonicalLanguage("French")).toBe("French");
    expect(canonicalLanguage("")).toBeNull();
  });
});
