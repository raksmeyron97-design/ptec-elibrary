import { describe, expect, it } from "vitest";
import {
  changedSuggestionFields,
  issnForRequest,
  mergeSuggestions,
  parseCrossrefJournal,
  parseIssnPortalRecord,
} from "./lookup";

// Shapes captured from the live services on 2026-10-02 (trimmed).
const CROSSREF_JCE = {
  status: "ok",
  message: {
    title: "Journal of Chemical Education",
    publisher: "American Chemical Society",
    ISSN: ["0021-9584", "1938-1328"],
    "issn-type": [
      { type: "print", value: "0021-9584" },
      { type: "electronic", value: "1938-1328" },
    ],
    subjects: [],
  },
};

const PORTAL_JCE = `
<dl class="record__field"><dt class="record__field-label">Title proper:</dt>
  <dd class="record__field-value" data-key="title-proper">Journal of chemical education.</dd></dl>
<dl class="record__field"><dt class="record__field-label text--s">
      ISSN-L:
    </dt>
  <dd class="record__field-value"><a href="/resource/ISSN-L/0021-9584?issn=0021-9584">0021-9584</a></dd></dl>
<dl class="record__field"><dt class="record__field-label">Medium:</dt>
  <dd class="record__field-value" data-key="medium">Print</dd></dl>
<dl class="record__field"><dt class="record__field-label">Other media:</dt>
  <dd class="record__field-value" data-key="other-media">      <a href="/resource/ISSN/1938-1328" class="link">Online</a>
</dd></dl>
<dl class="record__field"><dt class="record__field-label">Country:</dt>
  <dd class="record__field-value" data-key="country">UNITED STATES</dd></dl>`;

describe("issnForRequest", () => {
  it("rebuilds a valid ISSN, with or without the hyphen, including an X check digit", () => {
    expect(issnForRequest("0021-9584")).toBe("0021-9584");
    expect(issnForRequest(" 00219584 ")).toBe("0021-9584");
    expect(issnForRequest("2049-3630")).toBe("2049-3630");
    expect(issnForRequest("0000-006x")).toBe("0000-006X");
  });

  it("refuses anything that is not a valid ISSN — nothing else can reach a URL", () => {
    expect(issnForRequest("2789-0001")).toBeNull(); // bad check digit (the CJTE fixture)
    expect(issnForRequest("0021-9584/../admin")).toBeNull();
    expect(issnForRequest("abcd-efgh")).toBeNull();
    expect(issnForRequest("")).toBeNull();
  });
});

describe("parseCrossrefJournal", () => {
  it("reads title, publisher and which ISSN is print or electronic", () => {
    expect(parseCrossrefJournal(CROSSREF_JCE)).toEqual({
      title: "Journal of Chemical Education",
      publisher_name: "American Chemical Society",
      print_issn: "0021-9584",
      e_issn: "1938-1328",
    });
  });

  it("keeps subject names and drops an invalid ISSN", () => {
    const r = parseCrossrefJournal({
      message: {
        title: "X",
        "issn-type": [{ type: "print", value: "1234-5678" }],
        subjects: [{ name: "Education" }, { name: "Education" }, { name: " " }],
      },
    });
    expect(r).toEqual({ title: "X", subjects: ["Education"] });
  });

  it("null for a body that is not a record", () => {
    expect(parseCrossrefJournal({ status: "error", message: "Not found" })).toBeNull();
    expect(parseCrossrefJournal(null)).toBeNull();
  });
});

describe("parseIssnPortalRecord", () => {
  it("reads ISSN-L, both media and the country by label", () => {
    expect(parseIssnPortalRecord(PORTAL_JCE, "0021-9584")).toEqual({
      title: "Journal of chemical education",
      issn_l: "0021-9584",
      print_issn: "0021-9584",
      e_issn: "1938-1328",
      country: "US",
    });
  });

  it("looked up by the ONLINE number, the medium says so", () => {
    const html = PORTAL_JCE.replace(">Print<", ">Online<").replace("1938-1328\" class=\"link\">Online", "0021-9584\" class=\"link\">Print");
    const r = parseIssnPortalRecord(html, "1938-1328");
    expect(r?.e_issn).toBe("1938-1328");
    expect(r?.print_issn).toBe("0021-9584");
  });

  it("an unknown country name contributes nothing rather than a guess", () => {
    const r = parseIssnPortalRecord(PORTAL_JCE.replace("UNITED STATES", "ATLANTIS"), "0021-9584");
    expect(r?.country).toBeUndefined();
  });

  it("decodes entities once, and no tag survives in any spelling", () => {
    const record = (title: string) =>
      `<dl><dt>Title proper:</dt><dd>${title}</dd></dl><dl><dt>Medium:</dt><dd>Print</dd></dl>`;
    // &amp;lt; is the literal text "&lt;" — never unescaped a second time into "<".
    expect(parseIssnPortalRecord(record("A &amp;lt;b&amp;gt; journal"), "0021-9584")?.title).toBe("A &lt;b&gt; journal");
    // An escaped tag decodes to text with its brackets removed; a malformed tag leaves no "<".
    expect(parseIssnPortalRecord(record("A &lt;script&gt; journal"), "0021-9584")?.title).toBe("A script journal");
    expect(parseIssnPortalRecord(record("A <scr<script>ipt> journal"), "0021-9584")?.title).not.toMatch(/[<>]/);
    expect(parseIssnPortalRecord(record("Science &amp; Education"), "0021-9584")?.title).toBe("Science & Education");
  });

  it("null for a page with no record", () => {
    expect(parseIssnPortalRecord("<html><body>No result</body></html>", "0021-9584")).toBeNull();
  });
});

describe("mergeSuggestions", () => {
  it("prefers Crossref's spelling of the title and adds the portal's ISSN-L and country", () => {
    const merged = mergeSuggestions(parseCrossrefJournal(CROSSREF_JCE), parseIssnPortalRecord(PORTAL_JCE, "0021-9584"));
    expect(merged).toEqual({
      title: "Journal of Chemical Education",
      publisher_name: "American Chemical Society",
      print_issn: "0021-9584",
      e_issn: "1938-1328",
      issn_l: "0021-9584",
      country: "US",
    });
  });

  it("when the registries disagree about which number is print, suggests neither", () => {
    const merged = mergeSuggestions({ print_issn: "0021-9584" }, { print_issn: "1938-1328" });
    expect(merged.print_issn).toBeUndefined();
  });

  it("works from either registry alone", () => {
    expect(mergeSuggestions(null, { issn_l: "0021-9584" })).toEqual({ issn_l: "0021-9584" });
    expect(mergeSuggestions({ title: "T" }, null)).toEqual({ title: "T" });
  });
});

describe("changedSuggestionFields", () => {
  it("asks only about fields that would change, ignoring case and spacing", () => {
    expect(
      changedSuggestionFields(
        { title: "Journal of Chemical Education", publisher_name: "American Chemical Society", country: "US" },
        { title: "journal of chemical education ", publisher_name: "", country: null },
      ),
    ).toEqual(["publisher_name", "country"]);
  });
});
