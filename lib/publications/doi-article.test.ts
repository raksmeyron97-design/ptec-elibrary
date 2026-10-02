import { describe, expect, it } from "vitest";
import { creativeCommonsName, parseCrossrefArticle } from "./doi-article";
import jce from "./__fixtures__/crossref-jce-ed500287q.json";
import oa from "./__fixtures__/crossref-oa-sample.json";

// Fixtures are trimmed copies of the live Crossref records (2026-10-02).

describe("parseCrossrefArticle — J. Chem. Educ. (Set Seng et al., 2014)", () => {
  const a = parseCrossrefArticle(jce)!;

  it("reads the identity the publisher deposited", () => {
    expect(a.doi).toBe("10.1021/ed500287q");
    expect(a.title).toBe(
      "Development of a Handmade Conductivity Measurement Device for a Thin-Film Semiconductor and Its Application to Polypyrrole",
    );
    expect(a.journalTitle).toBe("Journal of Chemical Education");
    expect(a.issns).toEqual(["0021-9584", "1938-1328"]);
    expect([a.volume, a.issue, a.pageStart, a.pageEnd]).toEqual(["91", "11", "1971", "1975"]);
    expect(a.publicationDate).toBe("2014-11-11"); // the print date, as the record already stores
    expect(a.language).toBe("en");
  });

  it("authors in order, first author flagged, affiliations as deposited", () => {
    // As deposited: ACS swapped given and family for the two Japanese authors.
    expect(a.authors.map((x) => x.fullName)).toEqual(["Set Seng", "Tomita Shinpei", "Inada Yoshihiko"]);
    // …so the other order is offered for the exact match against our records.
    expect(a.authors[1].reversedName).toBe("Shinpei Tomita");
    expect(a.authors[0].isFirst).toBe(true);
    expect(a.authors[0].affiliations).toEqual(["Faculty of Education, Okayama University, Okayama 700-8530, Japan"]);
  });

  it("states nothing the publisher did not: no abstract, no licence", () => {
    expect(a.abstract).toBeNull();
    expect(a.license).toBeNull();
  });

  it("references: unstructured text kept, structured ones assembled, DOIs carried", () => {
    expect(a.references[0].text).toMatch(/^The Nobel Prize in Chemistry 2000/);
    const withDoi = a.references.find((r) => r.doi === "10.1021/ed083p1212");
    expect(withDoi?.text).toBe("Ramanaviciene A. (2006). J. Chem. Educ., 83, 1212.");
  });
});

describe("parseCrossrefArticle — an open-access record", () => {
  const a = parseCrossrefArticle(oa)!;

  it("a JATS abstract becomes paragraphs of plain text", () => {
    expect(a.abstract).toBeTruthy();
    expect(a.abstract).not.toMatch(/<|jats:/);
    expect(a.abstract!.split("\n\n").length).toBeGreaterThan(1);
  });

  it("a Creative Commons licence URL is named; ORCIDs are normalised", () => {
    expect(a.license).toBe("CC BY-SA 4.0");
    expect(a.authors[0].orcid).toBe("0009-0001-3621-6351");
    expect(a.authors[1].orcid).toBeNull();
  });

  it("a print date without a day is not padded — the full online date is used", () => {
    expect(a.publicationDate).toBe("2025-11-27");
    expect(a.year).toBe(2026);
  });
});

describe("guards", () => {
  it("null for anything that is not a work with a valid DOI", () => {
    expect(parseCrossrefArticle({ status: "error", message: "Resource not found." })).toBeNull();
    expect(parseCrossrefArticle(null)).toBeNull();
    expect(parseCrossrefArticle({ message: { DOI: "nope", title: ["T"] } })).toBeNull();
  });

  it("markup in a title is reduced to text and cannot carry a tag", () => {
    const a = parseCrossrefArticle({ message: { DOI: "10.1234/x", title: ["<i>In vivo</i> &amp;lt;b&amp;gt; &lt;script&gt;"] } });
    expect(a?.title).toBe("In vivo &lt;b&gt; script");
  });

  it("only Creative Commons licences are named", () => {
    expect(creativeCommonsName("https://creativecommons.org/licenses/by/4.0/")).toBe("CC BY 4.0");
    expect(creativeCommonsName("https://creativecommons.org/publicdomain/zero/1.0/")).toBe("CC0 1.0");
    expect(creativeCommonsName("https://pubs.acs.org/page/policy/authorchoice_termsofuse.html")).toBeNull();
    expect(creativeCommonsName(undefined)).toBeNull();
  });
});
