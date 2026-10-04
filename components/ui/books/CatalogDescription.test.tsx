// The description on /catalogs/[slug]: paragraphs as paragraphs, a kept line
// break as a <br>, and a long text folded behind a control that the SERVER
// already renders — so a reader on a slow phone never meets clipped text with
// no way to open it — while the whole text stays in the HTML.

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import CatalogDescription from "./CatalogDescription";

const LONG = [["Excerpt of The Body Institute by Carol Riggs", "Five more reps, and I should be done with this body for good."], ["Twenty-six…twenty-seven."], ["Or so he says."]];
const labels = { showMoreLabel: "Read more", showLessLabel: "Show less" };

describe("CatalogDescription", () => {
  it("renders paragraphs, keeping an intentional line break", () => {
    const { container } = render(<CatalogDescription paragraphs={LONG} collapsible={false} {...labels} />);
    const ps = container.querySelectorAll("p");
    expect(ps).toHaveLength(3);
    expect(ps[0].querySelectorAll("br")).toHaveLength(1);
    expect(ps[0].textContent).toBe("Excerpt of The Body Institute by Carol RiggsFive more reps, and I should be done with this body for good.");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("server HTML of a long text: folded, with the fade and the control, and every word present", () => {
    const html = renderToStaticMarkup(<CatalogDescription paragraphs={LONG} collapsible {...labels} />);
    expect(html).toContain("max-height:16.5em");
    expect(html).toContain("Read more");
    expect(html).toContain("Or so he says.");
    // Without JavaScript the fold is undone and its controls hidden.
    expect(html).toMatch(/<noscript><style>#catalog-description-[^{]+\{max-height:none!important\}\[data-fold-control=/);
  });

  it("opens and closes", () => {
    // jsdom lays nothing out; give the folded text the height a browser would.
    const heights = { scrollHeight: 900, clientHeight: 300 };
    for (const [k, v] of Object.entries(heights)) Object.defineProperty(HTMLElement.prototype, k, { configurable: true, get: () => v });
    render(<CatalogDescription paragraphs={LONG} collapsible {...labels} />);
    const button = screen.getByRole("button", { name: /Read more/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    const content = document.getElementById(button.getAttribute("aria-controls")!)!;
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: /Show less/ })).toHaveAttribute("aria-expanded", "true");
    expect(content.style.maxHeight).toBe("");
    for (const k of Object.keys(heights)) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[k];
  });

  it("hides the control once it measures that nothing is clipped", () => {
    render(<CatalogDescription paragraphs={[["Short."]]} collapsible {...labels} />);
    expect(screen.queryByRole("button")).toBeNull(); // jsdom: 0 of 0 pixels clipped
  });
});
