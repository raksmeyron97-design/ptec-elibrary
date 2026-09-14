import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }: any) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

import EntityBadge from "./EntityBadge";
import ResourceTypeBadge from "./ResourceTypeBadge";
import CollectionHeader from "./CollectionHeader";
import AlphabetIndex from "./AlphabetIndex";
import CollectionEmptyState from "./CollectionEmptyState";

describe("EntityBadge", () => {
  it("renders Author badge for individual person/author kinds", () => {
    const { container: authorContainer } = render(<EntityBadge kind="author" />);
    expect(authorContainer.textContent).toContain("Author");

    const { container: personContainer } = render(<EntityBadge kind="person" />);
    expect(personContainer.textContent).toContain("Author");
  });

  it("renders Organization badge for organization/institution kinds", () => {
    const { container: orgContainer } = render(<EntityBadge kind="organization" />);
    expect(orgContainer.textContent).toContain("Organization");

    const { container: instContainer } = render(<EntityBadge kind="institution" />);
    expect(instContainer.textContent).toContain("Organization");
  });

  it("respects localized custom labels", () => {
    const { container } = render(
      <EntityBadge
        kind="organization"
        labels={{ organization: "ស្ថាប័ន", author: "អ្នកនិពន្ធ" }}
      />,
    );
    expect(container.textContent).toBe("ស្ថាប័ន");
  });

  it("returns null when kind is not provided, avoiding false claims", () => {
    const { container } = render(<EntityBadge kind={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("ResourceTypeBadge", () => {
  it("renders distinct badge styling for all 4 academic resource types", () => {
    const { container: ebook } = render(<ResourceTypeBadge type="ebook" label="E-book" />);
    expect(ebook.textContent).toBe("E-book");
    expect(ebook.firstChild).toHaveClass("text-sky-700");

    const { container: thesis } = render(<ResourceTypeBadge type="thesis" label="Thesis" />);
    expect(thesis.textContent).toBe("Thesis");
    expect(thesis.firstChild).toHaveClass("text-purple-700");

    const { container: pub } = render(<ResourceTypeBadge type="publication" label="Article" />);
    expect(pub.textContent).toBe("Article");
    expect(pub.firstChild).toHaveClass("text-indigo-700");

    const { container: catalog } = render(<ResourceTypeBadge type="catalog" label="Physical book" />);
    expect(catalog.textContent).toBe("Physical book");
    expect(catalog.firstChild).toHaveClass("text-amber-800");
  });
});

describe("CollectionHeader", () => {
  it("renders eyebrow, title, description, and stats pills", () => {
    const { container } = render(
      <CollectionHeader
        eyebrow="Taxonomy"
        title="Browse by Subject"
        description="Every discipline collected in the library."
        stats={<span data-testid="stats-pill">25 subjects</span>}
      />,
    );

    expect(container.querySelector("h1")?.textContent).toBe("Browse by Subject");
    expect(container.textContent).toContain("Taxonomy");
    expect(container.textContent).toContain("Every discipline collected in the library.");
    expect(screen.getByTestId("stats-pill").textContent).toBe("25 subjects");
  });
});

describe("AlphabetIndex", () => {
  it("renders alphabet navigation and triggers callback on click", () => {
    const onSelect = vi.fn();
    render(
      <AlphabetIndex
        availableLetters={["A", "B", "C"]}
        activeLetter="A"
        onSelectLetter={onSelect}
        allLabel="All"
      />,
    );

    const activeBtn = screen.getByRole("button", { name: "A" });
    expect(activeBtn).toHaveAttribute("aria-pressed", "true");

    const bBtn = screen.getByRole("button", { name: "B" });
    expect(bBtn).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(bBtn);
    expect(onSelect).toHaveBeenCalledWith("B");

    const allBtn = screen.getByRole("button", { name: "All" });
    fireEvent.click(allBtn);
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

describe("CollectionEmptyState", () => {
  it("renders message and call to action", () => {
    const handleReset = vi.fn();
    render(
      <CollectionEmptyState
        title="No results found"
        description="Try searching with a different term."
        action={{ label: "Reset", onClick: handleReset }}
      />,
    );

    expect(screen.getByText("No results found")).toBeInTheDocument();
    expect(screen.getByText("Try searching with a different term.")).toBeInTheDocument();
    const resetBtn = screen.getByRole("button", { name: "Reset" });
    expect(resetBtn).toBeInTheDocument();
    fireEvent.click(resetBtn);
    expect(handleReset).toHaveBeenCalledTimes(1);
  });
});
