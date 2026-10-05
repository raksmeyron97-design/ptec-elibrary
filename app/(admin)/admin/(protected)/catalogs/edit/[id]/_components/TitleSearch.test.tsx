import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import TitleSearch from "./TitleSearch";
import { searchOpenLibraryByTitle } from "../../../isbn-actions";

vi.mock("../../../isbn-actions", () => ({ searchOpenLibraryByTitle: vi.fn() }));
const search = vi.mocked(searchOpenLibraryByTitle);

function renderSearch(onUseIsbn = vi.fn(), defaultOpen = true) {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <TitleSearch readTitle={() => "Visible learning"} readAuthor={() => "Hattie"} onUseIsbn={onUseIsbn} defaultOpen={defaultOpen} initialTitle="គណិតវិទ្យា" initialAuthor="" />
    </NextIntlClientProvider>,
  );
  return onUseIsbn;
}

describe("Search by title and author", () => {
  it("open on arrival, it starts from the record's title, ready to search", () => {
    renderSearch();
    expect(screen.getByLabelText("Title")).toHaveValue("គណិតវិទ្យា");
    expect(screen.getByRole("button", { name: "Search" })).toBeEnabled();
  });

  it("a result offers its ISBN, and using it hands over the ISBN only", async () => {
    search.mockResolvedValue({ status: "ok", results: [{ key: "/works/OL1W", title: "Visible learning", subtitle: null, authors: ["John Hattie"], year: 2008, publishers: ["Routledge"], languages: ["eng"], isbn13s: ["9780415476171"] }] });
    const onUse = renderSearch(vi.fn(), false);
    fireEvent.click(screen.getByRole("button", { name: /Search Open Library by title and author/ }));
    expect(screen.getByLabelText("Title")).toHaveValue("Visible learning");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(await screen.findByRole("button", { name: "Use ISBN 9780415476171" }));
    expect(onUse).toHaveBeenCalledWith("9780415476171");
    expect(search).toHaveBeenCalledWith("Visible learning", "Hattie");
  });

  it("no result says what to do next for a book Open Library does not know", async () => {
    search.mockResolvedValue({ status: "ok", results: [] });
    renderSearch();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "គណិតវិទ្យា ថ្នាក់ទី៧" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("No result in Open Library")).toBeInTheDocument();
    expect(screen.getByText(/No ISBN printed/)).toBeInTheDocument();
  });

  it("a provider failure is said as such, not as no result", async () => {
    search.mockResolvedValue({ status: "error", kind: "timeout" });
    renderSearch();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Visible learning" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText(/could not be searched: Timed out/)).toBeInTheDocument();
    expect(screen.queryByText("No result in Open Library")).toBeNull();
  });
});
