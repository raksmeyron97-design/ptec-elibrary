import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages/en.json";
import type { ContentsEntry } from "@/lib/theses/contents";

const { draftThesisContents } = vi.hoisted(() => ({ draftThesisContents: vi.fn() }));
vi.mock("@/app/actions/theses", () => ({ draftThesisContents }));

import ContentsEditor from "./ContentsEditor";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DRAFT: ContentsEntry[] = [
  { level: 1, number: "1", label: "INTRODUCTION", page: "1" },
  { level: 2, number: "1.1", label: "Background", page: "1" },
  { level: 1, label: "REFERENCES", page: "40" },
];

/** A controlled harness, the way ThesisForm holds the list. */
function Harness({ initial = [], canDraft = true }: { initial?: ContentsEntry[]; canDraft?: boolean }) {
  const [entries, setEntries] = useState<ContentsEntry[]>(initial);
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ContentsEditor entries={entries} onChange={setEntries} thesisId="8f1c2a90-0000-4000-8000-000000000001" canDraft={canDraft} />
      <pre data-testid="state">{JSON.stringify(entries)}</pre>
    </NextIntlClientProvider>
  );
}
const state = () => JSON.parse(screen.getByTestId("state").textContent ?? "[]") as ContentsEntry[];

describe("ContentsEditor — drafting", () => {
  it("fills an empty list from the draft and says which PDF pages it read", async () => {
    draftThesisContents.mockResolvedValue({ ok: true, entries: DRAFT, sourcePages: [5, 6] });
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Draft from the PDF" }));
    await waitFor(() => expect(state()).toEqual(DRAFT));
    expect(screen.getByRole("status").textContent).toMatch(/Drafted from PDF pages 5–6\. Check every line/);
  });

  it("asks before replacing rows the librarian already typed", async () => {
    draftThesisContents.mockResolvedValue({ ok: true, entries: DRAFT, sourcePages: [5] });
    render(<Harness initial={[{ level: 1, label: "My own chapter", page: "1" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Draft from the PDF" }));
    await screen.findByText("Replace the current contents?");
    expect(state()).toEqual([{ level: 1, label: "My own chapter", page: "1" }]);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(state()).toEqual([{ level: 1, label: "My own chapter", page: "1" }]);

    fireEvent.click(screen.getByRole("button", { name: "Draft from the PDF" }));
    fireEvent.click(await screen.findByRole("button", { name: "Replace with draft" }));
    expect(state()).toEqual(DRAFT);
  });

  it.each([
    ["no_pages", /no indexed text yet/],
    ["no_contents_page", /No contents page was found in the first 40 pages/],
    ["unparseable", /could not be read reliably/],
  ])("explains %s and changes nothing", async (reason, text) => {
    draftThesisContents.mockResolvedValue({ ok: false, reason });
    render(<Harness initial={[{ level: 1, label: "Kept" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Draft from the PDF" }));
    expect((await screen.findByRole("status")).textContent).toMatch(text);
    expect(state()).toEqual([{ level: 1, label: "Kept" }]);
  });

  it("offers no draft button without a saved, indexed PDF — and says when it will", () => {
    render(<Harness canDraft={false} />);
    expect(screen.queryByRole("button", { name: "Draft from the PDF" })).toBeNull();
    expect(screen.getByText(/becomes available once this thesis is saved with its PDF/)).toBeTruthy();
  });
});

describe("ContentsEditor — editing rows", () => {
  it("adds, edits, re-levels, reorders and removes entries", () => {
    render(<Harness initial={[{ level: 1, label: "One" }, { level: 1, label: "Two" }]} />);

    fireEvent.change(screen.getByLabelText("Entry 2 title"), { target: { value: "Two, renamed" } });
    fireEvent.change(screen.getByLabelText("Entry 2 level"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Entry 2 page, as printed"), { target: { value: "iv" } });
    expect(state()[1]).toEqual({ level: 2, label: "Two, renamed", page: "iv" });

    fireEvent.click(screen.getByRole("button", { name: "Move entry 2 up" }));
    expect(state().map((e) => e.label)).toEqual(["Two, renamed", "One"]);

    fireEvent.click(screen.getByRole("button", { name: "Add entry" }));
    expect(state()).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: "Remove entry 1" }));
    expect(state().map((e) => e.label)).toEqual(["One", ""]);
  });

  it("shows the empty state when there are no entries", () => {
    render(<Harness />);
    expect(screen.getByText("No contents yet")).toBeTruthy();
  });
});
