import { describe, expect, it } from "vitest";
import {
  PHOTO_CATEGORIES,
  isPhotoCategory,
  localizePhoto,
  type HomepagePhoto,
} from "./homepage-photo";

// The gallery's public payload is built entirely by localizePhoto(): what a
// visitor sees, what a screen reader announces, and what never leaves the
// server. All three are worth pinning, because the only other place they are
// checked is by eye on the homepage.

const base: Parameters<typeof localizePhoto>[0] = {
  id: "photo-1",
  public_url: "https://cdn.example.org/files/homepage/a.webp",
  width: 1920,
  height: 1280,
  blur_data_url: "data:image/webp;base64,AAAA",
  category: "ptec-library",
  caption_km: "ចំណងជើង",
  caption_en: "Caption",
  alt_text_km: "អត្ថបទជំនួស",
  alt_text_en: "Students reading",
};

describe("localizePhoto", () => {
  it("prefers the requested locale", () => {
    expect(localizePhoto(base, "km").caption).toBe("ចំណងជើង");
    expect(localizePhoto(base, "km").alt).toBe("អត្ថបទជំនួស");
    expect(localizePhoto(base, "en").caption).toBe("Caption");
    expect(localizePhoto(base, "en").alt).toBe("Students reading");
  });

  it("falls back to the other language rather than dropping the text", () => {
    const kmOnly = { ...base, caption_en: null, alt_text_en: null };
    expect(localizePhoto(kmOnly, "en").caption).toBe("ចំណងជើង");
    expect(localizePhoto(kmOnly, "en").alt).toBe("អត្ថបទជំនួស");

    const enOnly = { ...base, caption_km: null, alt_text_km: null };
    expect(localizePhoto(enOnly, "km").caption).toBe("Caption");
    expect(localizePhoto(enOnly, "km").alt).toBe("Students reading");
  });

  it("treats a blank string as missing, so an empty field never wins the fallback", () => {
    const blankEn = { ...base, caption_en: "", alt_text_en: "" };
    expect(localizePhoto(blankEn, "en").caption).toBe("ចំណងជើង");
    expect(localizePhoto(blankEn, "en").alt).toBe("អត្ថបទជំនួស");
  });

  it("yields an empty alt only when both languages are missing", () => {
    const noAlt = { ...base, alt_text_km: null, alt_text_en: null };
    // alt="" is the correct DOM value for a decorative image; `null` would
    // render alt="null" and `undefined` would drop the attribute entirely,
    // which makes a screen reader read the file name instead.
    expect(localizePhoto(noAlt, "en").alt).toBe("");

    // A missing caption stays null — the components branch on it to decide
    // between the editor's words and the section's default copy.
    const noCaption = { ...base, caption_km: null, caption_en: null };
    expect(localizePhoto(noCaption, "en").caption).toBeNull();
  });

  it("carries only the public fields — never the storage key or uploader", () => {
    const row: HomepagePhoto = {
      ...base,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
      storage_key: "homepage/secret-name.webp",
      display_order: 0,
      is_active: true,
      uploaded_by: "a-user-id",
    };
    const serialized = JSON.stringify(localizePhoto(row, "en"));
    expect(serialized).not.toContain("secret-name");
    expect(serialized).not.toContain("a-user-id");
    expect(Object.keys(localizePhoto(row, "en")).sort()).toEqual([
      "alt", "blurDataUrl", "caption", "category", "height", "id", "url", "width",
    ]);
  });
});

describe("isPhotoCategory", () => {
  it("accepts every declared category", () => {
    for (const category of PHOTO_CATEGORIES) {
      expect(isPhotoCategory(category)).toBe(true);
    }
  });

  it("rejects anything else, so a value the DB check constraint gained later cannot slip through untyped", () => {
    for (const value of ["", "Events", "unknown", null, undefined, 3, {}]) {
      expect(isPhotoCategory(value)).toBe(false);
    }
  });
});
