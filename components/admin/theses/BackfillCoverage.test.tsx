import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import BackfillCoverage from "./BackfillCoverage";
import type { BackfillCoverage as Coverage } from "@/lib/admin/theses-shared";

afterEach(cleanup);

const renderCard = (coverage: Coverage | null) =>
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <BackfillCoverage coverage={coverage} />
    </NextIntlClientProvider>,
  );

describe("BackfillCoverage", () => {
  it("counts each field over the theses that owe it, and links the worklist", () => {
    renderCard({ considered: 50, khmerApplicable: 31, titleKm: 12, abstractKm: 8, contents: 20, complete: 27 });
    expect(screen.getByRole("heading", { name: /the 50 most-viewed theses/ })).toBeTruthy();
    expect(screen.getByText("23 still need a Khmer title, a Khmer abstract or their contents.")).toBeTruthy();
    expect(screen.getByText("12 of 31")).toBeTruthy();
    expect(screen.getByText("20 of 50")).toBeTruthy();
    // Khmer theses were left out of a denominator, so the card says so.
    expect(screen.getByText(/counted over English and bilingual theses/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Open the worklist/ }).getAttribute("href")).toBe(
      "/admin/theses?backfill=any&sort=most-viewed&status=published",
    );
  });

  it("says when nothing is left, and offers no worklist to open", () => {
    renderCard({ considered: 4, khmerApplicable: 4, titleKm: 4, abstractKm: 4, contents: 4, complete: 4 });
    expect(screen.getByText(/Every one has its Khmer title/)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/counted over English and bilingual/)).toBeNull();
  });

  it("renders nothing when the count could not be read — never '0 of 50'", () => {
    const { container } = renderCard(null);
    expect(container.textContent).toBe("");
  });
});
