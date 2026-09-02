// The control that decides whether one person keeps one row.
//
// The behaviours pinned here are the ones that make it safe rather than merely
// convenient: a canonical id is attached only by an explicit human choice, it
// is DETACHED the moment the name is edited, and a similar name is labelled as
// similar instead of being silently substituted.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import AuthorPicker, { type AuthorSelection } from "./AuthorPicker";
import { searchBookAuthors } from "@/app/actions/book-duplicates";

vi.mock("@/app/actions/book-duplicates", () => ({ searchBookAuthors: vi.fn() }));

const searchMock = vi.mocked(searchBookAuthors);

const AUTHORS = [
  { id: "aaaaaaaa-1111-4111-8111-111111111111", name: "John Smith", bookCount: 42, matchKind: "prefix" as const },
  { id: "bbbbbbbb-2222-4222-8222-222222222222", name: "John A. Smith", bookCount: 8, matchKind: "contains" as const },
  { id: "cccccccc-3333-4333-8333-333333333333", name: "J. Smith", bookCount: 3, matchKind: "fuzzy" as const },
];

function setup(initial: AuthorSelection = { id: null, name: "" }) {
  const onChange = vi.fn();
  let value = initial;
  const view = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AuthorPicker id="author" value={value} onChange={onChange} ariaLabel="Author" />
    </NextIntlClientProvider>,
  );
  const rerender = (next: AuthorSelection) => {
    value = next;
    view.rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <AuthorPicker id="author" value={value} onChange={onChange} ariaLabel="Author" />
      </NextIntlClientProvider>,
    );
  };
  // `...view` first: React Testing Library exposes its own `rerender`, and
  // spreading it last would shadow the one that carries the new value.
  return { ...view, onChange, rerender };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchMock.mockResolvedValue({ ok: true, authors: AUTHORS });
});

describe("AuthorPicker", () => {
  it("is a real combobox a librarian can always type into", () => {
    setup();
    const input = screen.getByRole("combobox", { name: "Author" });
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("submits the name and the canonical id as separate hidden fields", () => {
    const { container } = setup({ id: AUTHORS[0].id, name: "John Smith" });
    expect(container.querySelector('input[name="author"]')).toHaveValue("John Smith");
    expect(container.querySelector('input[name="authorId"]')).toHaveValue(AUTHORS[0].id);
    // The visible box is unnamed: FormData must carry the resolved pair, not
    // a half-typed string.
    expect(screen.getByRole("combobox")).not.toHaveAttribute("name");
  });

  it("offers existing authors with how many books each already holds", async () => {
    const { rerender } = setup();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "John Sm" } });
    rerender({ id: null, name: "John Sm" });

    await waitFor(() => expect(searchMock).toHaveBeenCalledWith("John Sm"));
    expect(await screen.findByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("42 books")).toBeInTheDocument();
    expect(screen.getByText("3 books")).toBeInTheDocument();
  });

  it("labels a merely SIMILAR name as similar instead of substituting it", async () => {
    const { rerender } = setup();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "John Sm" } });
    rerender({ id: null, name: "John Sm" });
    await screen.findByText("J. Smith");
    expect(screen.getByText(/confirm this is the same person/i)).toBeInTheDocument();
  });

  it("attaches the canonical id only when a human picks one", async () => {
    const { onChange, rerender } = setup();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "John Sm" } });
    rerender({ id: null, name: "John Sm" });
    // Typing alone never selects anything, however close the match.
    expect(onChange).toHaveBeenLastCalledWith({ id: null, name: "John Sm" });

    fireEvent.click(await screen.findByText("John Smith"));
    expect(onChange).toHaveBeenLastCalledWith({ id: AUTHORS[0].id, name: "John Smith" });
  });

  it("is operable from the keyboard alone", async () => {
    const { onChange, rerender } = setup();
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "John Sm" } });
    rerender({ id: null, name: "John Sm" });
    await screen.findByText("John Smith");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith({ id: AUTHORS[1].id, name: "John A. Smith" });
  });

  it("offers an explicit 'create new author' choice", async () => {
    const { onChange, rerender } = setup();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Someone New" } });
    rerender({ id: null, name: "Someone New" });
    searchMock.mockResolvedValue({ ok: true, authors: [] });

    const create = await screen.findByText(/create new author/i);
    fireEvent.click(create);
    expect(onChange).toHaveBeenLastCalledWith({ id: null, name: "Someone New" });
  });

  it("DETACHES the canonical id the moment the name is edited", () => {
    const { onChange } = setup({ id: AUTHORS[0].id, name: "John Smith" });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "John Smithe" } });
    // An id that outlived the name it stood for would attach the book to the
    // wrong person.
    expect(onChange).toHaveBeenLastCalledWith({ id: null, name: "John Smithe" });
  });

  it("confirms a selection and lets it be undone", () => {
    const { onChange } = setup({ id: AUTHORS[0].id, name: "John Smith" });
    expect(screen.getByRole("status")).toHaveTextContent(/existing author selected/i);
    fireEvent.click(screen.getByRole("button", { name: /change/i }));
    expect(onChange).toHaveBeenLastCalledWith({ id: null, name: "John Smith" });
  });

  it("surfaces a lookup failure instead of pretending nobody matched", async () => {
    searchMock.mockResolvedValue({ ok: false, error: "Too many lookups — pause for a moment." });
    const { rerender } = setup();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "John" } });
    rerender({ id: null, name: "John" });
    expect(await screen.findByText(/too many lookups/i)).toBeInTheDocument();
  });

  it("recovers when the lookup REJECTS rather than returning an error", async () => {
    // A Server Action can reject outright — a dropped connection, or a
    // deployment swapped under an open form. The spinner used to run forever.
    searchMock.mockRejectedValue(new Error("network down"));
    const { rerender } = setup();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "John" } });
    rerender({ id: null, name: "John" });
    expect(await screen.findByText(/author list could not be loaded/i)).toBeInTheDocument();
  });

  it("does not query on an empty box", async () => {
    setup();
    await waitFor(() => expect(searchMock).not.toHaveBeenCalled());
  });
});
