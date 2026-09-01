import { describe, it, expect } from "vitest";
import { markdownLink } from "./route";

describe("markdownLink", () => {
  it("renders an ordinary title as a normal Markdown link", () => {
    expect(markdownLink("Intro to Algebra", "https://example.org/a")).toBe(
      "[Intro to Algebra](https://example.org/a)",
    );
  });

  it("escapes brackets in the title", () => {
    expect(markdownLink("Notes [draft]", "https://example.org/a")).toBe(
      "[Notes \\[draft\\]](https://example.org/a)",
    );
  });

  it("escapes a pre-existing backslash so it can't cancel the bracket escape", () => {
    // Without escaping "\" first, title `a\]b` would render as `a\\]b` —
    // Markdown reads "\\" as one literal backslash, leaving "]" real and
    // unescaped, closing the link text early.
    const rendered = markdownLink("a\\]b", "https://example.org/a");
    expect(rendered).toBe("[a\\\\\\]b](https://example.org/a)");
    // The escaped text must contain no bare, unescaped "]" before the "](".
    const linkTextEnd = rendered.indexOf("](");
    const linkText = rendered.slice(1, linkTextEnd);
    expect(linkText.match(/(?<!\\)(\\\\)*\]/)).toBeNull();
  });
});
