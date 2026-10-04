import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { crossrefAbstract, doiFromUrl, extractPublisherDescription, looksLikeBotWall } from "./publisher-description";

const springer = readFileSync(path.join(__dirname, "__fixtures__/springer-book-9780387097428.html"), "utf8");
const long = "A practical guide for teachers who want their students to reason about mathematics rather than memorise it.";

describe("extractPublisherDescription", () => {
  it("reads Springer's About this book section, paragraphs and list kept", () => {
    const d = extractPublisherDescription(springer)!;
    expect(d.source).toBe("about_section");
    expect(d.truncated).toBe(false);
    expect(d.text.startsWith("For too many students, mathematics consists of facts in a vacuum")).toBe(true);
    expect(d.text).toContain("• Whole-class discussion methods for teaching mathematics reasoning.");
    expect(d.text).toContain("• Overcoming student resistance to mathematical conversations.");
    expect(d.text).toContain("makes a wealth of cutting-edge strategies available");
    expect(d.text).not.toContain("About this book");
    expect(d.text).not.toContain("Another book entirely");
    expect(d.text).not.toMatch(/[<>]/);
    expect(d.text).toContain("A sampling of the topics covered:\n\n\u2022 Whole-class discussion methods for teaching mathematics reasoning.\n\u2022 Learning");
  });

  it("without the section, takes the longest metadata — Springer's JSON-LD is cut at 200 characters", () => {
    const noSection = springer.replace(/<section data-title="About this book">[\s\S]*?<\/section>/, "");
    const d = extractPublisherDescription(noSection)!;
    expect(d.source).toBe("meta");
    expect(d.text.length).toBeGreaterThan(1500);
  });

  it("prefers an untruncated text, and says when only a shortened one exists", () => {
    const html = `<meta property="og:description" content="${long} And much more besides, at length, here...">
      <meta name="description" content="${long}">`;
    expect(extractPublisherDescription(html)).toEqual({ text: long, source: "meta", truncated: false });
    const cut = extractPublisherDescription(`<meta name="description" content="${long} Also&#8230;">`)!;
    expect(cut.truncated).toBe(true);
    expect(cut.text.endsWith("Also…")).toBe(true);
  });

  it("takes a book's JSON-LD description, never the publisher organisation's", () => {
    const html = `<script type="application/ld+json">[{"@type":"Organization","description":"Sage Publishing is an independent academic publisher founded in 1965, publishing more than 1,000 journals."},
      {"@context":"https://schema.org","@graph":[{"@type":"Book","name":"X","description":"<p>${long}</p>"}]}]</script>`;
    expect(extractPublisherDescription(html)).toEqual({ text: long, source: "json_ld", truncated: false });
  });

  it("reads a section under a real heading, not a tab label", () => {
    const html = `<a role="tab">Description</a><div>Price: £30</div>
      <h2>Description</h2><div><p>${long}</p><p>Second paragraph of the blurb, also long enough.</p><button>Read More</button></div><h2>Table of Contents</h2><p>1. Intro</p>`;
    expect(extractPublisherDescription(html)).toEqual({ text: `${long}\n\nSecond paragraph of the blurb, also long enough.`, source: "about_section", truncated: false });
  });

  it("ignores a page with nothing long enough to be a description", () => {
    expect(extractPublisherDescription(`<meta name="description" content="Buy this book">`)).toBeNull();
    expect(extractPublisherDescription("<html><body>Hello</body></html>")).toBeNull();
  });
});

describe("looksLikeBotWall", () => {
  it("recognises the challenge Springer serves a fake browser", () => {
    expect(looksLikeBotWall(`<html><head><title>Client Challenge</title><link href="/_fs-ch-1T1wmsGaOgGaSxcX/assets/styles.css"></head></html>`)).toBe(true);
    expect(looksLikeBotWall(`<title>Just a moment...</title>`)).toBe(true);
    expect(looksLikeBotWall(`<html><head><title></title><script>window.gokuProps = {"key":"x"};</script><script src="https://x.token.awswaf.com/challenge.js"></script>`)).toBe(true);
    expect(looksLikeBotWall(springer)).toBe(false);
  });
});

describe("doiFromUrl", () => {
  it("finds the DOI in publisher URLs", () => {
    expect(doiFromUrl("https://link.springer.com/book/10.1007/978-0-387-09742-8")).toBe("10.1007/978-0-387-09742-8");
    expect(doiFromUrl("https://www.taylorfrancis.com/books/mono/10.4324/9780203123456/title-author")).toBe("10.4324/9780203123456/title-author");
    expect(doiFromUrl("https://onlinelibrary.wiley.com/doi/book/10.1002/9781119586425?x=1")).toBe("10.1002/9781119586425");
    expect(doiFromUrl("https://www.routledge.com/Some-Book/p/book/9781138550117")).toBeNull();
    expect(doiFromUrl("not a url")).toBeNull();
  });
});

describe("crossrefAbstract", () => {
  it("returns a JATS abstract as plain paragraphs, without its heading", () => {
    expect(crossrefAbstract({ message: { abstract: `<jats:title>Abstract</jats:title><jats:p>${long}</jats:p>` } })).toBe(long);
    expect(crossrefAbstract({ message: {} })).toBeNull();
    expect(crossrefAbstract(null)).toBeNull();
  });
});
