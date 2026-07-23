import { describe, it, expect } from "vitest";
import {
  escapeXml,
  toOaiDatestamp,
  toDcDate,
  parseOaiDateArg,
  isOaiDateTimeGranularity,
  normalizeDcLanguages,
  buildOaiIdentifier,
  parseOaiIdentifier,
  encodeResumptionToken,
  decodeResumptionToken,
  buildDcMetadata,
  buildHeader,
  buildRecordXml,
  buildRequestTag,
  buildErrorXml,
  buildOaiPmhXml,
  buildResumptionTokenTag,
  oaiDomain,
  OaiError,
  type OaiRecord,
  type ResumptionState,
} from "./xml";

const record: OaiRecord = {
  setSpec: "thesis",
  localId: "impact-of-reading-habits",
  datestamp: "2026-07-01T10:00:00Z",
  title: 'Reading & "Writing" <Habits>',
  creators: ["Sok San", "Chan Dara"],
  date: "2026-06-15",
  subjects: ["Education", "Literacy"],
  description: "An abstract with kh ភាសាខ្មែរ text.",
  identifierUrl: "https://library.ptec.edu.kh/theses/impact-of-reading-habits",
  languages: ["km", "en"],
  type: "Thesis",
};

describe("escapeXml", () => {
  it("escapes the five XML special characters", () => {
    expect(escapeXml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;");
  });

  it("strips control characters that are invalid even when escaped", () => {
    expect(escapeXml("a\u0000b\u0008c\u001Fd")).toBe("abcd");
  });

  it("keeps tab, newline, CR and non-ASCII (Khmer) text", () => {
    expect(escapeXml("a\tb\nc\rភាសាខ្មែរ")).toBe("a\tb\nc\rភាសាខ្មែរ");
  });
});

describe("date helpers", () => {
  it("toOaiDatestamp emits seconds-granularity UTC", () => {
    expect(toOaiDatestamp(new Date("2026-07-09T12:34:56.789Z"))).toBe("2026-07-09T12:34:56Z");
  });

  it("toDcDate returns YYYY-MM-DD and null for junk", () => {
    expect(toDcDate("2026-06-15T08:00:00Z")).toBe("2026-06-15");
    expect(toDcDate("not-a-date")).toBeNull();
    expect(toDcDate(null)).toBeNull();
  });

  it("parseOaiDateArg widens date-only values to day boundaries", () => {
    expect(parseOaiDateArg("2026-07-01", "start")?.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(parseOaiDateArg("2026-07-01", "end")?.toISOString()).toBe("2026-07-01T23:59:59.000Z");
  });

  it("parseOaiDateArg accepts full datetime granularity", () => {
    expect(parseOaiDateArg("2026-07-01T10:20:30Z", "start")?.toISOString()).toBe("2026-07-01T10:20:30.000Z");
  });

  it("parseOaiDateArg rejects malformed input", () => {
    expect(parseOaiDateArg("2026-7-1", "start")).toBeNull();
    expect(parseOaiDateArg("2026-07-01T10:20:30", "start")).toBeNull(); // missing Z
    expect(parseOaiDateArg("garbage", "start")).toBeNull();
    expect(parseOaiDateArg("2026-13-40", "start")).toBeNull(); // matches shape but invalid date
  });

  it("isOaiDateTimeGranularity distinguishes the two granularities", () => {
    expect(isOaiDateTimeGranularity("2026-07-01T10:20:30Z")).toBe(true);
    expect(isOaiDateTimeGranularity("2026-07-01")).toBe(false);
  });
});

describe("normalizeDcLanguages", () => {
  it("maps the app's language values to ISO codes", () => {
    expect(normalizeDcLanguages("English")).toEqual(["en"]);
    expect(normalizeDcLanguages("Khmer")).toEqual(["km"]);
    expect(normalizeDcLanguages("km")).toEqual(["km"]);
    expect(normalizeDcLanguages("km_en")).toEqual(["km", "en"]);
  });

  it("passes unrecognised values through and drops empties", () => {
    expect(normalizeDcLanguages("French")).toEqual(["French"]);
    expect(normalizeDcLanguages("")).toEqual([]);
    expect(normalizeDcLanguages(null)).toEqual([]);
  });
});

describe("OAI identifiers", () => {
  it("round-trips build → parse", () => {
    const id = buildOaiIdentifier("book", "my-book-slug");
    expect(id).toBe(`oai:${oaiDomain()}:book/my-book-slug`);
    expect(parseOaiIdentifier(id)).toEqual({ setSpec: "book", localId: "my-book-slug" });
  });

  it("rejects foreign domains, unknown sets, and malformed ids", () => {
    expect(parseOaiIdentifier("oai:example.org:book/slug")).toBeNull();
    expect(parseOaiIdentifier(`oai:${oaiDomain()}:post/slug`)).toBeNull();
    expect(parseOaiIdentifier(`oai:${oaiDomain()}:book/`)).toBeNull();
    expect(parseOaiIdentifier("not-an-identifier")).toBeNull();
  });
});

describe("resumption tokens", () => {
  const state: ResumptionState = {
    verb: "ListRecords",
    metadataPrefix: "oai_dc",
    from: "2026-01-01",
    until: "2026-12-31",
    set: "thesis",
    offset: 100,
  };

  it("round-trips encode → decode", () => {
    expect(decodeResumptionToken(encodeResumptionToken(state))).toEqual(state);
  });

  it("round-trips with optional fields absent", () => {
    const minimal: ResumptionState = { verb: "ListIdentifiers", metadataPrefix: "oai_dc", offset: 0 };
    expect(decodeResumptionToken(encodeResumptionToken(minimal))).toEqual({
      verb: "ListIdentifiers",
      metadataPrefix: "oai_dc",
      from: undefined,
      until: undefined,
      set: undefined,
      offset: 0,
    });
  });

  it("rejects garbage, wrong verbs, and negative offsets", () => {
    expect(decodeResumptionToken("not-base64-json!!")).toBeNull();
    expect(decodeResumptionToken(Buffer.from("{}").toString("base64url"))).toBeNull();
    expect(
      decodeResumptionToken(
        Buffer.from(JSON.stringify({ verb: "Identify", metadataPrefix: "oai_dc", offset: 0 })).toString("base64url"),
      ),
    ).toBeNull();
    expect(
      decodeResumptionToken(
        Buffer.from(JSON.stringify({ verb: "ListRecords", metadataPrefix: "oai_dc", offset: -5 })).toString("base64url"),
      ),
    ).toBeNull();
    expect(
      decodeResumptionToken(
        Buffer.from(JSON.stringify({ verb: "ListRecords", metadataPrefix: "oai_dc", offset: 0, set: "post" })).toString(
          "base64url",
        ),
      ),
    ).toBeNull();
  });
});

// The publisher name is a required argument now: it comes from the published
// system settings at request time, never from a compiled-in constant.
const PUBLISHER = "Phnom Penh Teacher Education College";

describe("record XML", () => {
  it("buildHeader emits identifier, datestamp and setSpec", () => {
    const xml = buildHeader(record);
    expect(xml).toContain(`<identifier>oai:${oaiDomain()}:thesis/impact-of-reading-habits</identifier>`);
    expect(xml).toContain("<datestamp>2026-07-01T10:00:00Z</datestamp>");
    expect(xml).toContain("<setSpec>thesis</setSpec>");
  });

  it("buildDcMetadata maps every populated field and escapes text", () => {
    const xml = buildDcMetadata(record, PUBLISHER);
    expect(xml).toContain("<dc:title>Reading &amp; &quot;Writing&quot; &lt;Habits&gt;</dc:title>");
    expect(xml).toContain("<dc:creator>Sok San</dc:creator>");
    expect(xml).toContain("<dc:creator>Chan Dara</dc:creator>");
    expect(xml).toContain(`<dc:publisher>${PUBLISHER}</dc:publisher>`);
    expect(xml).toContain("<dc:subject>Education</dc:subject>");
    expect(xml).toContain("<dc:date>2026-06-15</dc:date>");
    expect(xml).toContain("<dc:type>Thesis</dc:type>");
    expect(xml).toContain("<dc:identifier>https://library.ptec.edu.kh/theses/impact-of-reading-habits</dc:identifier>");
    expect(xml).toContain("<dc:language>km</dc:language>");
    expect(xml).toContain("<dc:language>en</dc:language>");
    expect(xml).toContain('xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/"');
  });

  it("buildDcMetadata omits empty optional fields", () => {
    const bare: OaiRecord = { ...record, creators: [], date: null, subjects: [], description: null, languages: [] };
    const xml = buildDcMetadata(bare, PUBLISHER);
    expect(xml).not.toContain("<dc:creator>");
    expect(xml).not.toContain("<dc:date>");
    expect(xml).not.toContain("<dc:subject>");
    expect(xml).not.toContain("<dc:description>");
    expect(xml).not.toContain("<dc:language>");
    // required-by-our-mapping fields always present
    expect(xml).toContain("<dc:title>");
    expect(xml).toContain("<dc:identifier>");
  });

  it("buildRecordXml nests header and metadata inside <record>", () => {
    const xml = buildRecordXml(record, PUBLISHER);
    expect(xml.startsWith("<record><header>")).toBe(true);
    expect(xml).toContain("<metadata><oai_dc:dc");
    expect(xml.endsWith("</oai_dc:dc></metadata></record>")).toBe(true);
  });
});

describe("envelope + errors", () => {
  it("buildRequestTag reflects verb and arguments as attributes", () => {
    const tag = buildRequestTag("https://x.test/api/oai", "ListRecords", {
      verb: "ListRecords",
      metadataPrefix: "oai_dc",
      set: "book",
    });
    expect(tag).toBe('<request verb="ListRecords" metadataPrefix="oai_dc" set="book">https://x.test/api/oai</request>');
  });

  it("buildErrorXml omits all attributes on badVerb", () => {
    const xml = buildErrorXml("https://x.test/api/oai", "Bogus", { verb: "Bogus" }, [
      new OaiError("badVerb", "Illegal verb"),
    ]);
    expect(xml).toContain("<request>https://x.test/api/oai</request>");
    expect(xml).toContain('<error code="badVerb">Illegal verb</error>');
  });

  it("buildErrorXml keeps attributes for non-badVerb errors", () => {
    const xml = buildErrorXml("https://x.test/api/oai", "ListRecords", { verb: "ListRecords", metadataPrefix: "junk" }, [
      new OaiError("cannotDisseminateFormat", "nope"),
    ]);
    expect(xml).toContain('<request verb="ListRecords" metadataPrefix="junk">https://x.test/api/oai</request>');
    expect(xml).toContain('<error code="cannotDisseminateFormat">nope</error>');
  });

  it("buildOaiPmhXml produces a namespaced OAI-PMH document with responseDate", () => {
    const xml = buildOaiPmhXml("<request>https://x.test/api/oai</request>", "<Identify></Identify>");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/"');
    expect(xml).toMatch(/<responseDate>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/responseDate>/);
    expect(xml.trimEnd().endsWith("</OAI-PMH>")).toBe(true);
  });

  it("buildResumptionTokenTag carries cursor and completeListSize", () => {
    expect(buildResumptionTokenTag("abc", 50, 123)).toBe(
      '<resumptionToken cursor="50" completeListSize="123">abc</resumptionToken>',
    );
    expect(buildResumptionTokenTag("", 100, 123)).toBe(
      '<resumptionToken cursor="100" completeListSize="123"></resumptionToken>',
    );
  });
});
