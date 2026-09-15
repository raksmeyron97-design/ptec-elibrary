import { describe, expect, it } from "vitest";
import { articlePath } from "@/lib/journals/urls";
import { suggestionDetailHref } from "./suggestion-href";

describe("suggestionDetailHref", () => {
  it("opens the detail page each kind of suggestion names", () => {
    expect(suggestionDetailHref({ type: "book", slug: "b", label: "B", sub: "" })).toBe("/books/b");
    expect(suggestionDetailHref({ type: "research", id: "r1", slug: "r", label: "R", sub: "" })).toBe("/theses/r");
    expect(suggestionDetailHref({ type: "research", id: "r1", slug: null, label: "R", sub: "" })).toBe("/theses/r1");
    expect(suggestionDetailHref({ type: "publication", slug: "p", label: "P", sub: "" })).toBe(articlePath("p"));
    expect(suggestionDetailHref({ type: "catalog", slug: "c", label: "C", sub: "" })).toBe("/catalogs/c");
    expect(suggestionDetailHref({ type: "learning_path", slug: "l", label: "L", sub: "" })).toBe("/paths/l");
    expect(suggestionDetailHref({ type: "post", slug: "n", label: "N", sub: "" })).toBe("/posts/n");
  });

  it("names no page for an author or a subject — the caller searches for the label instead", () => {
    expect(suggestionDetailHref({ type: "author", label: "Paulo Freire" })).toBeNull();
    expect(suggestionDetailHref({ type: "category", label: "គណិតវិទ្យា" })).toBeNull();
  });
});
