import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { copyLocations, unshelvedCount } from "./copy-location";

describe("where a record's copies are comes from the copies", () => {
  it("groups by library and Koha shelf, counting available copies", () => {
    const groups = copyLocations([
      { status: "available", shelf_location: "GEN", holding_library: "PTEC Library" },
      { status: "on_loan", shelf_location: "GEN", holding_library: "PTEC Library" },
      { status: "available", shelf_location: "READ", holding_library: "PTEC Library" },
    ]);
    expect(groups).toEqual([
      { library: "PTEC Library", shelf: "GEN", count: 2, available: 1 },
      { library: "PTEC Library", shelf: "READ", count: 1, available: 1 },
    ]);
  });

  it("leaves withdrawn copies out — nobody can go and find them", () => {
    expect(copyLocations([{ status: "withdrawn", shelf_location: "GEN" }])).toEqual([]);
  });

  it("counts copies with no shelf instead of dropping them, and lists shelved groups first", () => {
    const groups = copyLocations([
      { status: "available", shelf_location: null, holding_library: "PTEC Library" },
      { status: "available", shelf_location: "  ", holding_library: "PTEC Library" },
      { status: "available", shelf_location: "REF", holding_library: "PTEC Library" },
    ]);
    expect(groups[0].shelf).toBe("REF");
    expect(unshelvedCount(groups)).toBe(2);
  });

  it("the production shape today: copies with a library and no shelf", () => {
    const groups = copyLocations(Array.from({ length: 5 }, () => ({ status: "available", shelf_location: null, holding_library: "PTEC" })));
    expect(groups).toEqual([{ library: "PTEC", shelf: null, count: 5, available: 5 }]);
  });
});

describe("/admin/catalogs no longer presents the book-level shelf as the shelf", () => {
  const src = readFileSync(path.resolve(__dirname, "../../app/(admin)/admin/(protected)/catalogs/page.tsx"), "utf8");
  it("the Location column reads the copies, and no cell renders book.shelf_location", () => {
    expect(src).toMatch(/copyLocations\(book\.catalog_copies\)/);
    expect(src).not.toMatch(/\{book\.shelf_location/);
  });
  it("the column holding catalog_books.ddc is labelled as a call number", () => {
    expect(src).toMatch(/tl\("colCallNumber"\)/);
    // The old header array, which labelled the call number "DDC" and the book-level field "Shelf".
    expect(src).not.toMatch(/"DDC", "Shelf"/);
  });
});
