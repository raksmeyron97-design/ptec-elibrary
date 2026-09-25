import { describe, it, expect } from "vitest";
import { createOpenLibraryProvider } from "./providers/open-library";
import { createGoogleBooksProvider, GOOGLE_QUOTA_PAUSE_MS } from "./providers/google-books";
import { plainText, yearFrom } from "./providers/fetch-json";
import type { FetchLike } from "./types";
import olEdition from "./__fixtures__/ol-edition-9780134685991.json";
import olSearch from "./__fixtures__/ol-search-9780134685991.json";
import google429 from "./__fixtures__/google-429.json";
import googleVolumes from "./__fixtures__/google-volumes-9780134685991.synthetic.json";

const json = (status: number, body: unknown) => new Response(body === null ? "" : JSON.stringify(body), { status });

/** Route by URL prefix; records every URL asked for. */
function router(routes: Record<string, () => Response | Promise<Response>>) {
  const asked: string[] = [];
  const fetch: FetchLike = async (url) => {
    asked.push(url);
    const hit = Object.keys(routes).find((p) => url.startsWith(p));
    if (!hit) throw new TypeError(`unexpected ${url}`);
    return routes[hit]();
  };
  return { fetch, asked };
}

describe("Open Library (recorded responses, 2026-09-25)", () => {
  it("takes edition facts from the edition and only authors from search", async () => {
    const { fetch, asked } = router({
      "https://openlibrary.org/isbn/9780134685991.json": () => json(200, olEdition),
      "https://openlibrary.org/search.json": () => json(200, olSearch),
    });
    const r = await createOpenLibraryProvider({ fetch })("9780134685991", "0134685997");
    expect(r.status).toBe("found");
    const c = r.status === "found" ? r.candidates[0] : null;
    expect(c).toMatchObject({
      provider: "open_library",
      providerRecordId: "/books/OL31838212M",
      title: "Effective Java",
      authors: ["Joshua Bloch"],
      // The EDITION's publisher and year — search.json listed four publishers and 2001–2018.
      publisher: "Addison-Wesley Professional",
      year: 2017,
      pageCount: 416,
      edition: "3rd Edition",
    });
    expect(c!.subjects[0]).toBe("Java (Computer program language)");
    expect(asked).toHaveLength(2);
  });

  it("404 on the edition is not found — search is never asked", async () => {
    const { fetch, asked } = router({ "https://openlibrary.org/isbn/": () => json(404, null) });
    expect(await createOpenLibraryProvider({ fetch })("9780000000002", null)).toEqual({ status: "not_found" });
    expect(asked).toHaveLength(1);
  });

  it("a failed author search still returns the edition", async () => {
    const { fetch } = router({
      "https://openlibrary.org/isbn/": () => json(200, olEdition),
      "https://openlibrary.org/search.json": () => json(503, {}),
    });
    const r = await createOpenLibraryProvider({ fetch })("9780134685991", "0134685997");
    expect(r).toMatchObject({ status: "found", candidates: [{ title: "Effective Java", authors: [] }] });
  });

  it("an outage is an error with its kind, not a missing book", async () => {
    const down = router({ "https://openlibrary.org/": () => { throw new TypeError("fetch failed"); } });
    expect(await createOpenLibraryProvider({ fetch: down.fetch })("9780134685991", null)).toMatchObject({ status: "error", kind: "unreachable" });
    const slow = router({ "https://openlibrary.org/": () => json(502, {}) });
    expect(await createOpenLibraryProvider({ fetch: slow.fetch })("9780134685991", null)).toMatchObject({ status: "error", kind: "http" });
  });
});

describe("Google Books", () => {
  it("keeps only volumes that carry this ISBN (synthetic volumes fixture)", async () => {
    const { fetch } = router({ "https://www.googleapis.com/books/v1/volumes": () => json(200, googleVolumes) });
    const r = await createGoogleBooksProvider({ fetch })("9780134685991", "0134685997");
    expect(r.status).toBe("found");
    const cs = r.status === "found" ? r.candidates : [];
    expect(cs).toHaveLength(1); // the 2001 near miss carries a different ISBN
    expect(cs[0]).toMatchObject({
      provider: "google_books", title: "Effective Java", authors: ["Joshua Bloch"], year: 2017, language: "en", pageCount: 414,
    });
    expect(cs[0].description).toBe("The Definitive Guide to Java Platform Best Practices–Updated for Java 9");
  });

  it("the recorded 429 is a quota error, and pauses further calls for an hour", async () => {
    let t = 0;
    const { fetch, asked } = router({ "https://www.googleapis.com/books/v1/volumes": () => json(429, google429) });
    const lookup = createGoogleBooksProvider({ fetch, now: () => t });
    const first = await lookup("9780134685991", null);
    expect(first).toMatchObject({ status: "error", kind: "quota" });
    expect(first.status === "error" && first.message).toMatch(/GOOGLE_BOOKS_API_KEY/);
    await lookup("9780134685991", null);
    expect(asked).toHaveLength(1); // paused, not asked again
    t = GOOGLE_QUOTA_PAUSE_MS;
    await lookup("9780134685991", null);
    expect(asked).toHaveLength(2);
  });

  it("sends the API key when set, and never puts it in a message", async () => {
    const { fetch, asked } = router({ "https://www.googleapis.com/books/v1/volumes": () => json(500, {}) });
    const r = await createGoogleBooksProvider({ fetch, apiKey: "SECRET-KEY" })("9780134685991", null);
    expect(asked[0]).toContain("&key=SECRET-KEY");
    expect(r.status === "error" && r.message).not.toContain("SECRET-KEY");
  });

  it("no items is not found", async () => {
    const { fetch } = router({ "https://www.googleapis.com/books/v1/volumes": () => json(200, { kind: "books#volumes", totalItems: 0 }) });
    expect(await createGoogleBooksProvider({ fetch })("9780000000002", null)).toEqual({ status: "not_found" });
  });
});

describe("provider text helpers", () => {
  it("finds a year in free-text dates and ignores non-years", () => {
    expect(yearFrom("December 27, 2017")).toBe(2017);
    expect(yearFrom("2016-01-05")).toBe(2016);
    expect(yearFrom("n.d.")).toBeNull();
    expect(yearFrom(1999)).toBeNull();
  });
  it("strips markup from descriptions and bounds them", () => {
    expect(plainText("<p>A&nbsp;<b>bold</b>   claim</p>")).toBe("A bold claim");
    expect(plainText("x".repeat(5000))!.length).toBe(2000);
  });
});
