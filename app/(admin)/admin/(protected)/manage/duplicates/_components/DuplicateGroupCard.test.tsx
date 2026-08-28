// Pins the review card's job: explain the detector's evidence, make the
// "keep" decision the loudest thing on screen, and never let an administrator
// retire a record without seeing which URL redirects where.
//
// These are rendering guarantees the type system cannot express and a
// production build cannot catch — a mislabelled confidence tier or a retire
// button on the canonical row is a data-integrity bug that looks fine in a
// screenshot.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import ToastProvider from "@/components/admin/kit/ToastProvider";
import DuplicateGroupCard, { type UIBook, type UIGroup } from "./DuplicateGroupCard";
import { retireDuplicateBook } from "@/app/actions/duplicates";

vi.mock("@/app/actions/duplicates", () => ({ retireDuplicateBook: vi.fn() }));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));

const retireMock = vi.mocked(retireDuplicateBook);

function uiBook(partial: Partial<UIBook> & { id: string; slug: string; title: string }): UIBook {
  return {
    isbn: null,
    year: null,
    author: null,
    pages: null,
    fileSizeKb: null,
    coverUrl: null,
    hasHash: false,
    createdLabel: null,
    ...partial,
  };
}

const HIGH: UIGroup = {
  key: "group-high",
  confidence: "high",
  signals: ["isbn", "content-hash"],
  books: [
    uiBook({
      id: "11111111-1111-4111-8111-111111111111",
      slug: "educational-research",
      title: "Educational Research",
      isbn: "9780132689637",
      year: 2012,
      author: "John W. Creswell",
      pages: 320,
      fileSizeKb: 8205,
      hasHash: true,
      createdLabel: "4 Jan 2024",
    }),
    uiBook({
      id: "22222222-2222-4222-8222-222222222222",
      slug: "educational-research-1",
      title: "Educational Research",
      isbn: "9780132689637",
      year: 2012,
      author: "John W. Creswell",
      hasHash: true,
      createdLabel: "2 Mar 2025",
    }),
  ],
};

const MEDIUM: UIGroup = {
  key: "group-medium",
  confidence: "medium",
  signals: ["title", "author", "year"],
  books: [
    uiBook({ id: "33333333-3333-4333-8333-333333333333", slug: "prm", title: "Practical Research Methods" }),
    uiBook({ id: "44444444-4444-4444-8444-444444444444", slug: "prm-1", title: "Practical Research Methods" }),
    uiBook({ id: "55555555-5555-4555-8555-555555555555", slug: "prm-2", title: "Practical Research Methods" }),
  ],
};

const LOW: UIGroup = {
  key: "group-low",
  confidence: "low",
  signals: ["title-prefix", "author"],
  books: [
    uiBook({ id: "66666666-6666-4666-8666-666666666666", slug: "srm", title: "Social Research Methods" }),
    uiBook({ id: "77777777-7777-4777-8777-777777777777", slug: "srm-4th", title: "Social Research Methods, 4th Edition" }),
  ],
};

function renderCard(group: UIGroup) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ToastProvider>
        <DuplicateGroupCard group={group} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

/** The record rows only — the evidence chips above them are a list too. */
function recordRows(): HTMLElement[] {
  return within(screen.getByRole("list", { name: "Choose the record to keep" })).getAllByRole("listitem");
}

beforeEach(() => {
  retireMock.mockReset();
  refresh.mockReset();
});

describe("confidence and evidence", () => {
  it("names the tier in words, not only in colour, for all three tiers", () => {
    const { unmount: a } = renderCard(HIGH);
    expect(screen.getByText("High confidence")).toBeInTheDocument();
    a();

    const { unmount: b } = renderCard(MEDIUM);
    expect(screen.getByText("Medium confidence")).toBeInTheDocument();
    b();

    renderCard(LOW);
    expect(screen.getByText("Low confidence")).toBeInTheDocument();
  });

  it("spells out the detector's own signals as evidence", () => {
    renderCard(HIGH);
    expect(screen.getByText("Why these records match")).toBeInTheDocument();
    expect(screen.getByText("Same ISBN")).toBeInTheDocument();
    expect(screen.getByText("Same PDF file")).toBeInTheDocument();
    // Nothing the group does not carry may appear.
    expect(screen.queryByText("Same publication year")).not.toBeInTheDocument();
  });

  it("shows medium-confidence corroboration without inventing an identity match", () => {
    renderCard(MEDIUM);
    expect(screen.getByText("Same title")).toBeInTheDocument();
    expect(screen.getByText("Same author")).toBeInTheDocument();
    expect(screen.getByText("Same publication year")).toBeInTheDocument();
    expect(screen.queryByText("Same ISBN")).not.toBeInTheDocument();
  });

  it("flags a low-confidence group for manual review, and only a low one", () => {
    const { unmount } = renderCard(LOW);
    expect(screen.getByText("Manual review recommended")).toBeInTheDocument();
    expect(screen.getByText("One title extends the other")).toBeInTheDocument();
    unmount();

    renderCard(HIGH);
    expect(screen.queryByText("Manual review recommended")).not.toBeInTheDocument();
  });

  it("states the record count", () => {
    renderCard(MEDIUM);
    expect(screen.getByText("3 records")).toBeInTheDocument();
  });
});

describe("canonical selection", () => {
  it("defaults to the first (oldest) record and says the choice is a suggestion", () => {
    renderCard(HIGH);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);
    expect(screen.getByText("Suggested — oldest record in this group")).toBeInTheDocument();
  });

  it("groups the radios so only one record can be kept", () => {
    renderCard(MEDIUM);
    const names = new Set((screen.getAllByRole("radio") as HTMLInputElement[]).map((r) => r.name));
    expect(names.size).toBe(1);
  });

  it("gives every radio an accessible name carrying the record's title", () => {
    renderCard(LOW);
    expect(
      screen.getByRole("radio", { name: "Keep “Social Research Methods, 4th Edition” as the record to survive" }),
    ).toBeInTheDocument();
  });

  it("never offers to retire the record currently marked Keep", () => {
    renderCard(MEDIUM);
    // Three records, one canonical → two retire buttons.
    expect(screen.getAllByRole("button", { name: /Retire duplicate/ })).toHaveLength(2);

    const rows = recordRows();
    expect(within(rows[0]).queryByRole("button", { name: /Retire duplicate/ })).toBeNull();
    expect(within(rows[1]).getByRole("button", { name: /Retire duplicate/ })).toBeInTheDocument();
  });

  it("moves the Keep badge and the retire affordance when another record is selected", () => {
    renderCard(HIGH);
    expect(within(recordRows()[0]).getByText("Keep")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("radio")[1]);

    const after = recordRows();
    expect(within(after[1]).getByText("Keep")).toBeInTheDocument();
    expect(within(after[1]).queryByRole("button", { name: /Retire duplicate/ })).toBeNull();
    expect(within(after[0]).getByRole("button", { name: /Retire duplicate/ })).toBeInTheDocument();
  });
});

describe("retire confirmation", () => {
  it("explains the archive + redirect before anything is called", () => {
    renderCard(HIGH);
    fireEvent.click(screen.getByRole("button", { name: /Retire duplicate/ }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Retire this duplicate?")).toBeInTheDocument();
    expect(within(dialog).getByText("/books/educational-research-1")).toBeInTheDocument();
    expect(within(dialog).getByText("/books/educational-research")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Reviews, reading lists, downloads and analytics stay attached to it."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("The change is written to the admin audit log."),
    ).toBeInTheDocument();
    // Opening the dialog must not touch the server.
    expect(retireMock).not.toHaveBeenCalled();
  });

  it("uses non-destructive wording — nothing here says delete", () => {
    renderCard(HIGH);
    fireEvent.click(screen.getByRole("button", { name: /Retire duplicate/ }));
    expect(screen.getByRole("dialog").textContent ?? "").not.toMatch(/delete|permanently remove|destroy/i);
  });

  it("cancelling calls nothing", () => {
    renderCard(HIGH);
    fireEvent.click(screen.getByRole("button", { name: /Retire duplicate/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(retireMock).not.toHaveBeenCalled();
  });

  it("retires the chosen duplicate onto the selected canonical record", async () => {
    retireMock.mockResolvedValue({
      success: true,
      redirectFrom: "educational-research-1",
      redirectTo: "educational-research",
    });

    renderCard(HIGH);
    fireEvent.click(screen.getByRole("button", { name: /Retire duplicate/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Retire duplicate" }));

    await waitFor(() =>
      expect(retireMock).toHaveBeenCalledWith({
        retiredId: HIGH.books[1].id,
        canonicalId: HIGH.books[0].id,
      }),
    );
    await waitFor(() =>
      expect(screen.getByText("Retired — /books/educational-research-1 now redirects to /books/educational-research")).toBeInTheDocument(),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("sends the id the reviewer actually selected, not the default", async () => {
    retireMock.mockResolvedValue({ success: true, redirectFrom: "educational-research", redirectTo: "educational-research-1" });

    renderCard(HIGH);
    fireEvent.click(screen.getAllByRole("radio")[1]);
    fireEvent.click(screen.getByRole("button", { name: /Retire duplicate/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Retire duplicate" }));

    await waitFor(() =>
      expect(retireMock).toHaveBeenCalledWith({
        retiredId: HIGH.books[0].id,
        canonicalId: HIGH.books[1].id,
      }),
    );
  });

  it("surfaces the action's own message when it refuses", async () => {
    retireMock.mockResolvedValue({
      success: false,
      error: "Choose a published book as the canonical record — redirects must not point to an unpublished page.",
    });

    renderCard(HIGH);
    fireEvent.click(screen.getByRole("button", { name: /Retire duplicate/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Retire duplicate" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Choose a published book as the canonical record — redirects must not point to an unpublished page.",
        ),
      ).toBeInTheDocument(),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
