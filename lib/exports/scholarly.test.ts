import { describe, it, expect } from "vitest";
import {
  toCslJson,
  toDublinCoreJson,
  toDublinCoreXml,
  toBibtex,
  toRis,
  buildJsonFeed,
  buildDcXmlFeed,
  buildTextFeed,
  parseExportFormat,
  EXPORT_SCHEMA_VERSION,
  type ScholarlyWork,
} from "./scholarly";

const khmerThesis: ScholarlyWork = {
  type: "thesis",
  slug: "khmer-literacy-study-2024",
  title: "ការសិក្សាអំណានភាសាខ្មែរ <ថ្នាក់ដំបូង> & ការវាយតម្លៃ",
  creators: ["សុខ សុភា", "ចាន់ ដារា"],
  contributors: ["គ្រូណែនាំ វណ្ណា"],
  institution: "PTEC e-Library",
  department: "ភាសាខ្មែរ",
  program: "b_ed_12_4",
  date: "2024-06-15",
  year: "2024",
  language: "km",
  abstract: "អរូបី៖ ការស្រាវជ្រាវនេះសិក្សាពីអំណាន…",
  keywords: ["អំណាន", "អក្ខរកម្ម"],
  landingUrl: "https://library.ptec.edu.kh/theses/khmer-literacy-study-2024",
  fileUrl: "https://library.ptec.edu.kh/api/theses/abc/download",
  format: "application/pdf",
  doi: "10.9999/ptec.2024.001",
  isbn: null,
  rights: "cc_by",
  journal: null,
  volume: null,
  issue: null,
  pageStart: null,
  pageEnd: null,
  modified: "2026-07-01T00:00:00Z",
  verifiedAt: "2026-07-01T00:00:00Z",
};

const englishBook: ScholarlyWork = {
  ...khmerThesis,
  type: "book",
  slug: "teaching-methods",
  title: "Modern Teaching Methods",
  creators: ["Jane Doe"],
  contributors: [],
  department: "Education",
  language: "en",
  doi: null,
  isbn: "978-9924-000-00-0",
  keywords: ["pedagogy"],
  landingUrl: "https://library.ptec.edu.kh/books/teaching-methods",
};

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const err = doc.querySelector("parsererror");
  if (err) throw new Error(`XML parse error: ${err.textContent}`);
  return doc;
}

describe("toCslJson", () => {
  it("emits authors as literals so Khmer names survive unmangled", () => {
    const item = toCslJson(khmerThesis);
    expect(item.author).toEqual([{ literal: "សុខ សុភា" }, { literal: "ចាន់ ដារា" }]);
    expect(item.type).toBe("thesis");
    expect(item.issued).toEqual({ "date-parts": [[2024, 6, 15]] });
    expect(item.URL).toContain("/theses/khmer-literacy-study-2024");
  });
  it("strips DOI resolver prefixes and maps journal fields", () => {
    const pub: ScholarlyWork = {
      ...englishBook,
      type: "publication",
      doi: "https://doi.org/10.1234/x",
      journal: "PTEC Journal",
      volume: "3",
      issue: "1",
      pageStart: "10",
      pageEnd: "24",
    };
    const item = toCslJson(pub);
    expect(item.DOI).toBe("10.1234/x");
    expect(item["container-title"]).toBe("PTEC Journal");
    expect(item.page).toBe("10-24");
    expect(item.type).toBe("article-journal");
  });
  it("falls back to the bare year when no full date exists", () => {
    expect(toCslJson({ ...englishBook, date: null, year: "1998" }).issued).toEqual({ "date-parts": [[1998]] });
    expect(toCslJson({ ...englishBook, date: null, year: null }).issued).toBeUndefined();
  });
});

describe("Dublin Core", () => {
  it("dc-json carries the roadmap field set where available", () => {
    const dc = toDublinCoreJson(khmerThesis);
    expect(dc["dc:title"]).toContain("ការសិក្សា");
    expect(dc["dc:creator"]).toHaveLength(2);
    expect(dc["dc:contributor"]).toEqual(["គ្រូណែនាំ វណ្ណា"]);
    expect(dc["dc:type"]).toBe("Thesis");
    expect(dc["dc:rights"]).toBe("cc_by");
    expect(dc["dc:format"]).toBe("application/pdf");
    expect(dc["dc:identifier"]).toContain("10.9999/ptec.2024.001");
    expect(String(dc["dc:relation"])).toContain("/download");
  });

  it("dc-xml is well-formed, escapes markup, and round-trips Khmer", () => {
    const doc = parseXml(toDublinCoreXml(khmerThesis));
    const titles = doc.getElementsByTagName("dc:title");
    expect(titles).toHaveLength(1);
    // The raw title contains <, > and & — parsing back must reproduce them.
    expect(titles[0].textContent).toBe("ការសិក្សាអំណានភាសាខ្មែរ <ថ្នាក់ដំបូង> & ការវាយតម្លៃ");
    expect(doc.getElementsByTagName("dc:creator")[0].textContent).toBe("សុខ សុភា");
    expect(doc.documentElement.getAttribute("xmlns:dc")).toBe("http://purl.org/dc/elements/1.1/");
  });

  it("omits empty elements instead of emitting blanks", () => {
    const xml = toDublinCoreXml({ ...englishBook, abstract: null, rights: null });
    expect(xml).not.toContain("<dc:description>");
    expect(xml).not.toContain("<dc:rights>");
  });
});

describe("bibtex / ris delegates", () => {
  it("produces a parseable BibTeX entry with the landing URL", () => {
    const bib = toBibtex(englishBook);
    expect(bib).toMatch(/^@book\{/);
    expect(bib).toContain("books/teaching-methods");
    expect(bib).toContain("Jane Doe");
  });
  it("RIS uses thesis type and ends with ER", () => {
    const out = toRis(khmerThesis);
    expect(out).toContain("TY  - THES");
    expect(out.trimEnd().endsWith("ER  -")).toBe(true);
    expect(out).toContain("សុខ សុភា");
  });
});

describe("feed envelopes", () => {
  const meta = { type: "thesis" as const, page: 1, pageSize: 50, total: 2, generatedAt: "2026-07-11T00:00:00Z" };

  it("JSON feed carries schema version, paging, and items", () => {
    const feed = JSON.parse(buildJsonFeed([khmerThesis, englishBook], meta, "csl-json"));
    expect(feed.schemaVersion).toBe(EXPORT_SCHEMA_VERSION);
    expect(feed.total).toBe(2);
    expect(feed.hasMore).toBe(false);
    expect(feed.items).toHaveLength(2);
    expect(feed.items[0].author[0].literal).toBe("សុខ សុភា");
  });

  it("hasMore flips when total exceeds the page window", () => {
    const feed = JSON.parse(buildJsonFeed([khmerThesis], { ...meta, total: 120 }, "dc-json"));
    expect(feed.hasMore).toBe(true);
  });

  it("XML feed parses and wraps each record with its identifier", () => {
    const doc = parseXml(buildDcXmlFeed([khmerThesis, englishBook], meta));
    expect(doc.getElementsByTagName("record")).toHaveLength(2);
    expect(doc.documentElement.getAttribute("schemaVersion")).toBe(EXPORT_SCHEMA_VERSION);
    expect(doc.getElementsByTagName("identifier")[0].textContent).toContain("/theses/");
  });

  it("text feeds separate entries with a blank line", () => {
    const out = buildTextFeed([khmerThesis, englishBook], "bibtex");
    expect(out.split("\n\n")).toHaveLength(2);
  });
});

describe("parseExportFormat", () => {
  it("defaults to csl-json and rejects unknown formats", () => {
    expect(parseExportFormat(null)).toBe("csl-json");
    expect(parseExportFormat("dc-xml")).toBe("dc-xml");
    expect(parseExportFormat("datacite")).toBeNull();
  });
});
