import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import Markdown from "@/app/[locale]/(public)/posts/[slug]/Markdown";
import { extractToc } from "./parse";

afterEach(cleanup);

function html(source: string): string {
  return render(<Markdown content={source} />).container.innerHTML;
}

describe("<Markdown />", () => {
  it("renders the table the admin editor's table tool inserts", () => {
    const { container } = render(
      <Markdown content={"| Course | Credits |\n| :--- | ---: |\n| Pedagogy | 4 |"} />
    );
    expect(container.querySelectorAll("th")).toHaveLength(2);
    expect(container.querySelector("td")?.textContent).toBe("Pedagogy");
    expect(container.querySelectorAll("th")[1].getAttribute("style")).toContain("right");
  });

  it("opens external links in a new tab and internal ones in place", () => {
    render(<Markdown content={"[out](https://example.com) and [in](/books) and [top](#intro)"} />);
    expect(screen.getByText("out")).toHaveAttribute("target", "_blank");
    expect(screen.getByText("out")).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("in")).not.toHaveAttribute("target");
    expect(screen.getByText("top")).not.toHaveAttribute("target");
  });

  it("never emits an anchor for an unsafe scheme", () => {
    const { container } = render(<Markdown content={"[tap here](javascript:alert(1))"} />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("tap here");
  });

  it("leaves pasted HTML as text instead of markup", () => {
    const { container } = render(<Markdown content={'<img src=x onerror="alert(1)"> <b>hi</b>'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<b>hi</b>");
  });

  it("gives level-2 headings the ids the table of contents links to", () => {
    const source = "## Overview\n\nText\n\n## Overview";
    const { container } = render(<Markdown content={source} />);
    for (const entry of extractToc(source)) {
      expect(container.querySelector(`#${entry.id}`), entry.id).not.toBeNull();
    }
  });

  it("renders task items as checkboxes rather than literal brackets", () => {
    const { container } = render(<Markdown content={"- [x] done\n- [ ] todo"} />);
    const boxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    expect(boxes[0].checked).toBe(true);
    expect(boxes[1].checked).toBe(false);
    expect(container.textContent).not.toContain("[x]");
  });

  it("labels a fenced block with its language", () => {
    const { container } = render(<Markdown content={"```sql\nselect 1\n```"} />);
    expect(container.querySelector("code")?.className).toContain("language-sql");
    expect(container.textContent).toContain("sql");
  });

  it("nests a sub-list inside its parent item", () => {
    const { container } = render(<Markdown content={"- parent\n  - child"} />);
    expect(container.querySelector("li ul li")?.textContent).toBe("child");
  });

  it("renders nothing for an empty body", () => {
    expect(html("")).toBe("");
    expect(html("   \n\n ")).toBe("");
  });
});
