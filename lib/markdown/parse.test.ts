import { describe, it, expect } from "vitest";
import {
  computeReadingTime,
  extractToc,
  isSafeHref,
  parseDocument,
  parseInline,
  inlineText,
  type BlockNode,
} from "./parse";

function blocks(src: string): BlockNode[] {
  return parseDocument(src);
}

function first<T extends BlockNode["type"]>(src: string, type: T) {
  const block = blocks(src).find((b) => b.type === type);
  expect(block, `no ${type} block in ${JSON.stringify(src)}`).toBeDefined();
  return block as Extract<BlockNode, { type: T }>;
}

describe("inline grammar", () => {
  it("formats the text inside a link, rather than printing its markup", () => {
    const [link] = parseInline("[**PTEC** library](/books)");
    expect(link).toMatchObject({ type: "link", href: "/books" });
    expect(inlineText([link])).toBe("PTEC library");
    expect(link.type === "link" && link.children[0].type).toBe("strong");
  });

  it("reads an image before a link, so no stray '!' is left behind", () => {
    const nodes = parseInline("![cover](/hero/a.jpg)");
    expect(nodes).toEqual([{ type: "image", src: "/hero/a.jpg", alt: "cover" }]);
  });

  it("keeps a code span literal", () => {
    expect(parseInline("`**not bold**`")).toEqual([{ type: "code", value: "**not bold**" }]);
  });

  it("supports strikethrough and honours backslash escapes", () => {
    expect(parseInline("~~gone~~")[0]).toMatchObject({ type: "del" });
    expect(parseInline("\\*not italic\\*")).toEqual([{ type: "text", value: "*not italic*" }]);
  });

  it("still bolds `** text **`, the way published posts were written", () => {
    // CommonMark reads this as literal asterisks; the previous renderer
    // bolded it, and live articles depend on that.
    const [strong] = parseInline("** បណ្ណាល័យ វ.គ.ភ. **");
    expect(strong.type).toBe("strong");
    expect(inlineText([strong]).trim()).toBe("បណ្ណាល័យ វ.គ.ភ.");
  });

  it("does not italicise arithmetic", () => {
    expect(parseInline("2 * 3 * 4")).toEqual([{ type: "text", value: "2 * 3 * 4" }]);
  });

  it("leaves underscores inside a word alone", () => {
    expect(parseInline("book_request_id")).toEqual([{ type: "text", value: "book_request_id" }]);
  });

  it("nests emphasis", () => {
    const [strong] = parseInline("**bold with *italic* inside**");
    expect(strong.type).toBe("strong");
    expect(strong.type === "strong" && strong.children.some((c) => c.type === "em")).toBe(true);
  });

  it("turns two trailing spaces into a hard break and a bare newline into a space", () => {
    const hard = first("line one  \nline two", "paragraph").children;
    expect(hard.some((n) => n.type === "break")).toBe(true);
    const soft = first("line one\nline two", "paragraph").children;
    expect(inlineText(soft)).toBe("line one line two");
    expect(soft.some((n) => n.type === "break")).toBe(false);
  });

  it("linkifies an autolink", () => {
    expect(parseInline("<https://library.ptec.edu.kh>")[0]).toMatchObject({
      type: "link",
      href: "https://library.ptec.edu.kh",
    });
  });
});

describe("link safety", () => {
  it("accepts the schemes a post body legitimately uses", () => {
    for (const href of ["https://a.kh", "http://a.kh", "mailto:a@b.kh", "tel:+855", "/books", "#top", "./x"]) {
      expect(isSafeHref(href), href).toBe(true);
    }
  });

  it("rejects executable schemes, including control-character spellings", () => {
    for (const href of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>", "vbscript:x", "java\tscript:alert(1)"]) {
      expect(isSafeHref(href), href).toBe(false);
    }
  });

  it("keeps the label but drops the destination of an unsafe link", () => {
    const nodes = parseInline("[click me](javascript:alert(1))");
    expect(nodes.every((n) => n.type !== "link")).toBe(true);
    expect(inlineText(nodes)).toBe("click me");
  });
});

describe("tables", () => {
  const src = [
    "| Course | Credits |",
    "| :--- | ---: |",
    "| Khmer Literature | 3 |",
    "| **Pedagogy** | 4 |",
  ].join("\n");

  it("parses the header, alignment and rows the admin editor's table tool inserts", () => {
    const table = first(src, "table");
    expect(table.align).toEqual(["left", "right"]);
    expect(table.header.map(inlineText)).toEqual(["Course", "Credits"]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[1][0][0].type).toBe("strong");
  });

  it("does not read prose containing a pipe as a table", () => {
    const notATable = blocks("a | b\n---\ntext");
    expect(notATable.some((b) => b.type === "table")).toBe(false);
    expect(notATable.some((b) => b.type === "thematicBreak")).toBe(true);
  });

  it("pads a short row so every row has the header's cell count", () => {
    const table = first("| a | b |\n| --- | --- |\n| only |", "table");
    expect(table.rows[0]).toHaveLength(2);
  });
});

describe("lists", () => {
  it("nests a list indented under its parent item", () => {
    const list = first("- parent\n  - child\n- sibling", "list");
    expect(list.items).toHaveLength(2);
    expect(list.items[0].children.some((c) => c.type === "list")).toBe(true);
  });

  it("keeps the author's starting number", () => {
    expect(first("3. three\n4. four", "list").start).toBe(3);
  });

  it("marks a list loose when its items are separated by blank lines", () => {
    expect(first("- a\n- b", "list").tight).toBe(true);
    expect(first("- a\n\n- b", "list").tight).toBe(false);
  });

  it("reads GFM task items", () => {
    const list = first("- [x] done\n- [ ] todo\n- plain", "list");
    expect(list.items.map((i) => i.checked)).toEqual([true, false, null]);
    expect(inlineText((list.items[0].children[0] as Extract<BlockNode, { type: "paragraph" }>).children)).toBe("done");
  });

  it("does not read a thematic break as a bullet", () => {
    expect(blocks("- - -")[0].type).toBe("thematicBreak");
  });
});

describe("blocks", () => {
  it("captures a fenced block's language and leaves its content untouched", () => {
    const code = first("```sql\nselect 1 -- **not bold**\n```", "codeBlock");
    expect(code.lang).toBe("sql");
    expect(code.value).toBe("select 1 -- **not bold**");
  });

  it("parses block content inside a blockquote", () => {
    const quote = first("> intro\n>\n> - one\n> - two", "blockquote");
    expect(quote.children.map((c) => c.type)).toEqual(["paragraph", "list"]);
  });

  it("turns a standalone image into a figure", () => {
    expect(first("![Graduation day](/hero/x.jpg)", "figure")).toMatchObject({
      src: "/hero/x.jpg",
      alt: "Graduation day",
    });
  });

  it("does not treat `---` under a paragraph as a setext heading", () => {
    const parsed = blocks("A closing line\n---\n");
    expect(parsed.map((b) => b.type)).toEqual(["paragraph", "thematicBreak"]);
  });

  it("terminates an unclosed fence at the end of the document", () => {
    expect(first("```\nstill code", "codeBlock").value).toBe("still code");
  });
});

describe("table of contents", () => {
  it("lists level-2 headings with the ids the renderer emits", () => {
    expect(extractToc("# Title\n\n## Overview\n\n### Detail")).toEqual([
      { id: "overview", text: "Overview" },
    ]);
  });

  it("de-duplicates repeated headings so each entry scrolls somewhere different", () => {
    const toc = extractToc("## Overview\n\n## Overview");
    expect(toc.map((t) => t.id)).toEqual(["overview", "overview-2"]);

    const ids = parseDocument("## Overview\n\n## Overview")
      .filter((b) => b.type === "heading")
      .map((b) => (b as Extract<BlockNode, { type: "heading" }>).id);
    expect(ids).toEqual(["overview", "overview-2"]);
  });

  it("ignores a '##' comment inside a fenced code block", () => {
    expect(extractToc("```bash\n## not a heading\n```\n\n## Real heading")).toEqual([
      { id: "real-heading", text: "Real heading" },
    ]);
  });

  it("slugs a heading by its text, not its markup", () => {
    expect(extractToc("## **Rules** of the `library`")[0].id).toBe("rules-of-the-library");
  });

  it("falls back to a usable id when a heading slugs to nothing", () => {
    expect(extractToc("## ???")[0].id).toBe("section");
  });
});

describe("reading time", () => {
  it("rounds up to at least a minute", () => {
    expect(computeReadingTime("")).toBe(1);
    expect(computeReadingTime("one two three")).toBe(1);
  });

  it("counts words, not Markdown syntax", () => {
    const words = Array.from({ length: 450 }, () => "word").join(" ");
    expect(computeReadingTime(words)).toBe(3);
    // The same prose, wrapped in links and emphasis, must not read longer.
    const dressed = Array.from({ length: 450 }, () => "[**word**](https://example.com/a/very/long/path)").join(" ");
    expect(computeReadingTime(dressed)).toBe(3);
  });

  it("measures Khmer, which writes without spaces between words", () => {
    // One space-free Khmer run: a word count would call this a single word.
    const khmer = "សូមស្វាគមន៍មកកាន់បណ្ណាល័យឌីជីថលរបស់វិទ្យាស្ថាន".repeat(40);
    expect(khmer.split(/\s+/)).toHaveLength(1);
    expect(computeReadingTime(khmer)).toBeGreaterThan(1);
  });
});

describe("parseDocument", () => {
  it("returns the same tree for the same source, so one page render parses once", () => {
    const src = "## Cached\n\nBody copy.";
    expect(parseDocument(src)).toBe(parseDocument(src));
  });
});
