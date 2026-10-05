import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseTitleSearch, titleSearchUrl, TITLE_SEARCH_LIMIT } from "./title-search";

describe("the search URL", () => {
  it("is Open Library's fixed host, with the title (and author when given), limited and field-trimmed", () => {
    const url = new URL(titleSearchUrl("  Visible   Learning ", "Hattie")!);
    expect(url.origin).toBe("https://openlibrary.org");
    expect(url.pathname).toBe("/search.json");
    expect(url.searchParams.get("title")).toBe("Visible Learning");
    expect(url.searchParams.get("author")).toBe("Hattie");
    expect(url.searchParams.get("limit")).toBe(String(TITLE_SEARCH_LIMIT));
  });
  it("carries Khmer as text, needs two letters, and drops an empty author", () => {
    const url = new URL(titleSearchUrl("គណិតវិទ្យា", "")!);
    expect(url.searchParams.get("title")).toBe("គណិតវិទ្យា");
    expect(url.searchParams.has("author")).toBe(false);
    expect(titleSearchUrl("a", null)).toBeNull();
  });
});

describe("reading the answer", () => {
  it("keeps only valid ISBNs, as ISBN-13, deduplicated", () => {
    const [r] = parseTitleSearch({
      docs: [{ key: "/works/OL1W", title: "Visible learning", author_name: ["John Hattie"], first_publish_year: 2008, isbn: ["0415476178", "9780415476171", "9780415476172", "junk"] }],
    });
    expect(r.isbn13s).toEqual(["9780415476171"]);
    expect(r.authors).toEqual(["John Hattie"]);
    expect(r.year).toBe(2008);
  });
  it("a result with no ISBN is still a result — it just suggests nothing to fetch", () => {
    expect(parseTitleSearch({ docs: [{ key: "/works/OL2W", title: "Untitled" }] })[0].isbn13s).toEqual([]);
  });
  it("ignores malformed answers and caps the list", () => {
    expect(parseTitleSearch(null)).toEqual([]);
    expect(parseTitleSearch({ docs: "x" })).toEqual([]);
    const many = { docs: Array.from({ length: 20 }, (_, i) => ({ key: `/works/OL${i}W`, title: `T${i}` })) };
    expect(parseTitleSearch(many)).toHaveLength(TITLE_SEARCH_LIMIT);
  });
});

describe("the search only suggests an ISBN", () => {
  const actions = readFileSync(path.resolve(__dirname, "../../app/(admin)/admin/(protected)/catalogs/isbn-actions.ts"), "utf8");
  const body = actions.slice(actions.indexOf("export async function searchOpenLibraryByTitle"));
  it("guards, rate-limits, then asks a fixed host — the URL is built from text, never taken from the browser", () => {
    const guard = body.indexOf('requirePermission("catalog", "write")');
    const limit = body.indexOf("rateLimit(");
    const fetchAt = body.indexOf("fetchJson(");
    expect(guard).toBeGreaterThan(-1);
    expect(limit).toBeGreaterThan(guard);
    expect(fetchAt).toBeGreaterThan(limit);
    expect(body).toMatch(/titleSearchUrl\(/);
  });
  it("the editor's only use of a result is the ISBN field", () => {
    const wizard = readFileSync(path.resolve(__dirname, "../../app/(admin)/admin/(protected)/catalogs/edit/[id]/_components/EditBookWizard.tsx"), "utf8");
    const block = wizard.slice(wizard.indexOf("onUseIsbn={(isbn13) => {"), wizard.indexOf("disabled={loading}", wizard.indexOf("onUseIsbn={(isbn13) => {")));
    expect(block).toMatch(/namedItem\("isbn"\)/);
    expect(block).not.toMatch(/applyFetched|namedItem\("(publisher|year|description|title|author)"\)/);
  });
});
