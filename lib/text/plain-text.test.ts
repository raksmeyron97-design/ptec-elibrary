import { describe, it, expect } from "vitest";
import { plainParagraphs, plainText } from "./plain-text";

describe("plainText / plainParagraphs", () => {
  it("decodes numeric and the common named references", () => {
    expect(plainText("Teachers&#8217; skills &#x2014; and &mdash; more&hellip; &copy;")).toBe("Teachers’ skills — and — more… ©");
    expect(plainText("Tom &amp; Jerry &quot;cats&quot; &apos;n&#39; mice")).toBe(`Tom & Jerry "cats" 'n' mice`);
  });

  it("unescapes exactly once, so no reference becomes a tag", () => {
    expect(plainText("&amp;lt;b&amp;gt;")).toBe("&lt;b&gt;");
    expect(plainText("&#38;lt;script&#38;gt;")).toBe("&lt;script&gt;");
    expect(plainText("&lt;script&gt;alert(1)&lt;/script&gt;")).toBe("scriptalert(1)/script");
    expect(plainText("&#60;img src=x&#62;")).toBe("img src=x");
  });

  it("keeps a reference it does not know, and refuses control characters", () => {
    expect(plainText("&unknown; &#0; &#x1F600;")).toBe("&unknown; &#0; \u{1F600}");
  });

  it("keeps paragraphs", () => {
    expect(plainParagraphs("<p>One</p><p>Two <b>bold</b></p><li>Three</li>")).toBe("One\n\nTwo bold\n\nThree");
  });
});
