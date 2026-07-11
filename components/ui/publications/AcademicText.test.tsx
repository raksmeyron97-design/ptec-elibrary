import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import type { PublicationReference } from "@/lib/publications";
import AcademicText from "./AcademicText";

const references: PublicationReference[] = [
  { id: "ref-atoms", index: 1, text: "Rutherford, E. Atomic structure." },
  { id: "ref-models", index: 2, text: "Johnstone, A. H. Mental models." },
];

describe("AcademicText", () => {
  it("splits paragraphs on blank lines and renders line breaks", () => {
    const { container } = render(
      <AcademicText
        text={"First paragraph.\nSame paragraph.\n\nSecond paragraph."}
        references={[]}
        sourceId="abstract-en"
      />,
    );

    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].querySelector("br")).not.toBeNull();
    expect(paragraphs[1].textContent).toBe("Second paragraph.");
  });

  it("renders bold, italic, subscript, and superscript as semantic elements", () => {
    const { container } = render(
      <AcademicText
        text={"**Water** is H<sub>2</sub>O and *x*<sup>2</sup> grows _fast_."}
        references={[]}
        sourceId="abstract-en"
      />,
    );

    expect(container.querySelector("strong")?.textContent).toBe("Water");
    expect(container.querySelector("sub")?.textContent).toBe("2");
    expect(container.querySelector("sup")?.textContent).toBe("2");
    const italics = [...container.querySelectorAll("em")].map((el) => el.textContent);
    expect(italics).toEqual(["x", "fast"]);
  });

  it("renders citations as numbered links with occurrence-stable anchors", () => {
    const { container } = render(
      <AcademicText
        text={"Atoms [cite:ref-atoms] and models [cite:2]; atoms again [cite:ref-atoms]."}
        references={references}
        sourceId="abstract-en"
        citationLabel={(number) => `Reference ${number}`}
      />,
    );

    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => a.textContent)).toEqual(["(1)", "(2)", "(1)"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "#reference-ref-atoms",
      "#reference-ref-models",
      "#reference-ref-atoms",
    ]);
    // IDs must match collectCitationOccurrences() so backlinks resolve.
    expect(links.map((a) => a.id)).toEqual([
      "citation-abstract-en-ref-atoms-1",
      "citation-abstract-en-ref-models-1",
      "citation-abstract-en-ref-atoms-2",
    ]);
    expect(links[1].getAttribute("aria-label")).toBe("Reference 2");
  });

  it("renders spans instead of links when linkCitations is false", () => {
    const { container } = render(
      <AcademicText
        text={"Atoms [cite:ref-atoms]."}
        references={references}
        sourceId="preview-en"
        linkCitations={false}
      />,
    );

    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("#citation-preview-en-ref-atoms-1")?.textContent).toBe("(1)");
  });

  it("marks unresolvable tokens only when a label is provided", () => {
    const marked = render(
      <AcademicText
        text={"Claim [cite:ref-missing]."}
        references={references}
        sourceId="abstract-en"
        missingCitationLabel={() => "Unknown reference"}
      />,
    );
    expect(marked.container.textContent).toContain("(?)");

    const hidden = render(
      <AcademicText
        text={"Claim [cite:ref-missing]."}
        references={references}
        sourceId="abstract-en"
      />,
    );
    expect(hidden.container.textContent).toBe("Claim .");
  });

  it("never injects markup from the stored text", () => {
    const { container } = render(
      <AcademicText
        text={'<script>alert(1)</script> <img src=x onerror=alert(1)> **safe**'}
        references={[]}
        sourceId="abstract-en"
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });
});
