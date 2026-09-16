import { describe, expect, it } from "vitest";
import { resolveAbstractLanguage, wordCountIsMeaningful } from "./abstract-language";

const EN = "Teacher-preparation programmes are evaluated almost entirely on graduation.";
const KM = "កម្មវិធីបណ្តុះបណ្តាលគ្រូត្រូវបានវាយតម្លៃស្ទើរតែទាំងស្រុង។";

describe("resolveAbstractLanguage", () => {
  it("offers the switch only when both languages actually carry text", () => {
    expect(resolveAbstractLanguage(EN, KM, "en").switchable).toBe(true);
    expect(resolveAbstractLanguage(EN, null, "en").switchable).toBe(false);
    expect(resolveAbstractLanguage("", KM, "en").switchable).toBe(false);
  });

  it("opens in the reader's locale when that language exists", () => {
    expect(resolveAbstractLanguage(EN, KM, "km").active).toBe("km");
    expect(resolveAbstractLanguage(EN, KM, "en").active).toBe("en");
  });

  it("is a preference, not a coercion: a Khmer reader still gets an English-only abstract", () => {
    const choice = resolveAbstractLanguage(EN, null, "km");
    expect(choice).toEqual({ active: "en", switchable: false, none: false });
  });

  it("falls the other way too: an English reader gets a Khmer-only abstract", () => {
    const choice = resolveAbstractLanguage(null, KM, "en");
    expect(choice).toEqual({ active: "km", switchable: false, none: false });
  });

  it("treats whitespace-only text as absent, so the switch never reaches an empty panel", () => {
    expect(resolveAbstractLanguage(EN, "   \n  ", "km")).toEqual({
      active: "en",
      switchable: false,
      none: false,
    });
    expect(resolveAbstractLanguage("  ", "\t", "en").none).toBe(true);
  });

  it("reports 'none' rather than picking a language when the record has no abstract", () => {
    expect(resolveAbstractLanguage(null, null, "km").none).toBe(true);
    expect(resolveAbstractLanguage(undefined, undefined, "en").none).toBe(true);
  });

  it("treats an unknown locale as English rather than throwing", () => {
    expect(resolveAbstractLanguage(EN, KM, "fr").active).toBe("en");
  });
});

describe("wordCountIsMeaningful", () => {
  // Khmer is written without spaces and this repo has no segmenter, so a
  // whitespace count would report a 200-word abstract as one word.
  it("is false for Khmer and true for English", () => {
    expect(wordCountIsMeaningful("km")).toBe(false);
    expect(wordCountIsMeaningful("en")).toBe(true);
  });

  it("negative control: a whitespace count really does collapse Khmer", () => {
    expect(KM.split(/\s+/).filter(Boolean).length).toBe(1);
    expect(EN.split(/\s+/).filter(Boolean).length).toBeGreaterThan(5);
  });
});
