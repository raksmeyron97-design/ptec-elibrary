import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages/en.json";

// UserToolbar debounces search into the URL via next/navigation's router.
// Capture the pushes so we can assert the search callback still fires.
const push = vi.fn();
let searchQuery = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(searchQuery),
}));

import UserToolbar from "./UserToolbar";

function Toolbar({ totalItems }: { totalItems: number }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <UserToolbar
        totalItems={totalItems}
        onAddUser={() => {}}
        onImport={() => {}}
        exportMenu={<button type="button">Export</button>}
      />
    </NextIntlClientProvider>
  );
}

function renderToolbar(totalItems: number) {
  return render(<Toolbar totalItems={totalItems} />);
}

describe("UserToolbar — accessible search shell", () => {
  beforeEach(() => {
    push.mockClear();
    searchQuery = "";
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes the search field by its accessible label, not the placeholder", () => {
    renderToolbar(2);
    // The visible label is sr-only; the field must still be reachable by name.
    const input = screen.getByRole("searchbox", { name: "Search users" });
    expect(input).toBeInTheDocument();
  });

  it("renders singular/plural/zero result counts correctly", () => {
    const { rerender } = renderToolbar(1);
    expect(screen.getByText("1 user")).toBeInTheDocument();

    rerender(<Toolbar totalItems={2} />);
    expect(screen.getByText("2 users")).toBeInTheDocument();
    rerender(<Toolbar totalItems={0} />);
    expect(screen.getByText("0 users")).toBeInTheDocument();
  });

  it("shows the clear button only when the field has text", () => {
    renderToolbar(2);
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ada" } });
    expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
  });

  it("clears the value and returns focus to the input", () => {
    renderToolbar(2);
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ada" } });

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
  });

  it("debounces the query into the router (search still works)", () => {
    vi.useFakeTimers();
    renderToolbar(2);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ada" } });

    expect(push).not.toHaveBeenCalled(); // not before the debounce elapses
    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(expect.stringContaining("q=ada"));
  });
});
