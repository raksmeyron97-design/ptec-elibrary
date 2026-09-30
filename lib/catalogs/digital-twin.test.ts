import { describe, expect, it } from "vitest";
import { authorKeys, buildTwinIndex, findDigitalTwin } from "./digital-twin";

const index = buildTwinIndex([
  { slug: "the-baby-sitters-club", title: "The Baby-Sitters Club", isbn: "978-0-590-43388-6", authors: ["Ann M. Martin"] },
  { slug: "research-methods-5", title: "Research Methods in Education (5th Edition)", authors: ["Louis Cohen"] },
  { slug: "research-methods-8", title: "Research Methods in Education (8th Edition)", authors: ["Louis Cohen"] },
  { slug: "khmer-grammar", title: "វេយ្យាករណ៍ខ្មែរ", authors: ["ជា សុខ"] },
  { slug: "twin-a", title: "Shared Title", authors: ["Same Person"] },
  { slug: "twin-b", title: "Shared Title", authors: ["Same Person"] },
]);

describe("findDigitalTwin", () => {
  it("matches on the ISBN in any of its written forms", () => {
    expect(findDigitalTwin(index, { isbn: "0590433881", title: "Anything" })).toBe("the-baby-sitters-club");
    expect(findDigitalTwin(index, { isbn: "9780590433886" })).toBe("the-baby-sitters-club");
  });
  it("matches title AND author, including a surname-first byline and ISBD spacing", () => {
    expect(findDigitalTwin(index, { title: "The Baby-Sitters Club", author: "Martin, Ann M." })).toBe(
      "the-baby-sitters-club",
    );
    expect(findDigitalTwin(index, { title: "វេយ្យាករណ៍ខ្មែរ", author: "ជា សុខ" })).toBe("khmer-grammar");
  });
  it("never matches a title without its author", () => {
    expect(findDigitalTwin(index, { title: "The Baby-Sitters Club" })).toBeNull();
    expect(findDigitalTwin(index, { title: "The Baby-Sitters Club", author: "Someone Else" })).toBeNull();
  });
  it("links nowhere when more than one e-book matches", () => {
    expect(findDigitalTwin(index, { title: "Shared Title", author: "Same Person" })).toBeNull();
  });
  it("does not treat two editions as one work", () => {
    expect(findDigitalTwin(index, { title: "Research Methods in Education", author: "Louis Cohen" })).toBeNull();
    expect(findDigitalTwin(index, { title: "Research Methods in Education (8th Edition)", author: "Cohen, Louis" })).toBe(
      "research-methods-8",
    );
  });
  it("ignores placeholder authors and splits several people", () => {
    expect(authorKeys("Unknown")).toEqual([]);
    expect(authorKeys("Martin, Ann M.; Doe, Jane")).toEqual(["ann m martin", "doe jane"]);
  });
  it("matches a surname-first byline with no comma, as the PMB import writes them", () => {
    const pallant = buildTwinIndex([{ slug: "spss", title: "SPSS Survival Manual", authors: ["Julie Pallant"] }]);
    expect(findDigitalTwin(pallant, { title: "SPSS Survival Manual", author: "Pallant Julie" })).toBe("spss");
  });
  it("still refuses a name that shares only some of its parts", () => {
    const smith = buildTwinIndex([{ slug: "s", title: "Teaching", authors: ["John Smith"] }]);
    expect(findDigitalTwin(smith, { title: "Teaching", author: "J. Smith" })).toBeNull();
    expect(findDigitalTwin(smith, { title: "Teaching", author: "John A. Smith" })).toBeNull();
  });
});
