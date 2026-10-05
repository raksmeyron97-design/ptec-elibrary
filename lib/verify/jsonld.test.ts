import { describe, it, expect } from "vitest";
import { ORGANIZATION_ID } from "@/lib/seo/entity-ids";
import { findNode, hasType, INSTITUTION_ID, isInstitutionRef, jsonLdNodes } from "./jsonld";

const page = (...docs: unknown[]) =>
  docs.map((d) => `<script type="application/ld+json">${JSON.stringify(d)}</script>`).join("\n");

// The shape production serves since 2026-10-01 (measured on /books/practical-research-methods).
const GRAPH = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "CollegeOrUniversity", "@id": "https://www.ptec.edu.kh/#org", name: "PTEC" },
    { "@type": "Library", "@id": "https://library.ptec.edu.kh/#library" },
    { "@type": "Book", "@id": "https://library.ptec.edu.kh/books/x#book", author: [{ "@type": "Person", name: "Catherine Dawson" }] },
    { "@type": "BreadcrumbList", "@id": "https://library.ptec.edu.kh/books/x#breadcrumb" },
  ],
};

describe("jsonLdNodes", () => {
  it("follows the @graph — the regression that turned every fixture red", () => {
    const nodes = jsonLdNodes(page(GRAPH));
    expect(nodes.map((n) => n["@type"])).toEqual(["CollegeOrUniversity", "Library", "Book", "BreadcrumbList"]);
    expect(findNode(nodes, "Book").author).toEqual([{ "@type": "Person", name: "Catherine Dawson" }]);
  });

  it("still reads the older shapes: one node per script, and a top-level array", () => {
    const nodes = jsonLdNodes(page({ "@type": "Book", name: "A" }, [{ "@type": "ProfilePage" }, { "@type": "BreadcrumbList" }]));
    expect(nodes.map((n) => n["@type"])).toEqual(["Book", "ProfilePage", "BreadcrumbList"]);
  });

  it("skips a block that does not parse, and finds nothing on a page without JSON-LD", () => {
    expect(jsonLdNodes(`<script type="application/ld+json">{oops</script>${page({ "@type": "Book" })}`)).toHaveLength(1);
    expect(jsonLdNodes("<html><body>No data</body></html>")).toEqual([]);
  });

  it("a list @type counts", () => {
    expect(hasType({ "@type": ["Book", "Product"] }, "Book")).toBe(true);
    expect(hasType({ "@type": "Book" }, "Person")).toBe(false);
  });
});

describe("the institution", () => {
  it("is the id the site itself uses — the two cannot drift apart again", () => {
    expect(INSTITUTION_ID).toBe(ORGANIZATION_ID);
  });

  it("must be a bare reference to a node the page's graph declares", () => {
    const nodes = jsonLdNodes(page(GRAPH));
    expect(isInstitutionRef({ "@id": INSTITUTION_ID }, nodes)).toBe(true);
    // A second node describing the institution is the 2026-09-13 defect.
    expect(isInstitutionRef({ "@id": INSTITUTION_ID, "@type": "Organization", name: "PTEC" }, nodes)).toBe(false);
    // The old id, and a reference to nothing the page declares.
    expect(isInstitutionRef({ "@id": "https://library.ptec.edu.kh/#organization" }, nodes)).toBe(false);
    expect(isInstitutionRef({ "@id": INSTITUTION_ID }, nodes.filter((n) => n["@type"] !== "CollegeOrUniversity"))).toBe(false);
  });
});
