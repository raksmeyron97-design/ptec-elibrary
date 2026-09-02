// What the librarian is actually shown before a book is saved.
//
// These are rendering guarantees the type system cannot express and a
// production build cannot catch. The three that matter most:
//
//   * a failed check must never look like a clean one;
//   * a byte-identical PDF must offer NO override, because the server refuses
//     it regardless and a checkbox that changes nothing is a lie;
//   * a blocking state must be announced assertively, and a "possible match"
//     must not be — otherwise a screen-reader user is interrupted on every
//     debounced keystroke.

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import DuplicateAlert from "./DuplicateAlert";
import type { DuplicateMatch } from "@/lib/books/duplicate-detection/signals";
import type { DuplicateCheckSnapshot } from "./use-duplicate-check";

const match = (partial: Partial<DuplicateMatch> = {}): DuplicateMatch => ({
  bookId: "11111111-1111-4111-8111-111111111111",
  slug: "educational-research",
  title: "Educational Research",
  author: "John W. Creswell",
  year: 2012,
  isbn: "9780132689637",
  status: "published",
  isPublished: true,
  coverUrl: null,
  score: 97,
  confidence: "exact",
  signals: ["isbn"],
  reasons: ["sameIsbn"],
  ...partial,
});

function ready(matches: DuplicateMatch[], blocked: boolean): DuplicateCheckSnapshot {
  return {
    state: "ready",
    error: null,
    result: {
      ok: true,
      matches,
      top: matches[0] ?? null,
      blocked,
      truncated: false,
      isbn: { status: "valid", canonical: "9780132689637" },
      skipped: false,
    },
  };
}

function renderAlert(snapshot: DuplicateCheckSnapshot, override: Parameters<typeof DuplicateAlert>[0]["override"] = null) {
  const onOverrideChange = vi.fn();
  const view = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <DuplicateAlert snapshot={snapshot} override={override} onOverrideChange={onOverrideChange} />
    </NextIntlClientProvider>,
  );
  return { ...view, onOverrideChange };
}

describe("DuplicateAlert", () => {
  it("renders nothing before a check has been asked for", () => {
    const { container } = renderAlert({ state: "idle", result: null, error: null });
    expect(container).toBeEmptyDOMElement();
  });

  it("says it is checking rather than showing a stale verdict", () => {
    renderAlert({ state: "checking", result: null, error: null });
    expect(screen.getByRole("status")).toHaveTextContent(/checking the collection/i);
  });

  it("never renders a failed check as a clean result", () => {
    renderAlert({ state: "error", result: null, error: "Duplicate check failed: boom" });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/duplicate check unavailable/i);
    expect(alert).not.toHaveTextContent(/no matching record/i);
  });

  it("reports a clean result plainly", () => {
    renderAlert(ready([], false));
    expect(screen.getByRole("status")).toHaveTextContent(/no matching record found/i);
  });

  it("announces a block assertively and names the existing record", () => {
    renderAlert(ready([match()], true));
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveTextContent(/duplicate book/i);
    expect(alert).toHaveTextContent(/this isbn is already registered/i);
    expect(screen.getByText("Educational Research")).toBeInTheDocument();
  });

  it("does not interrupt for a non-blocking match", () => {
    renderAlert(ready([match({ score: 72, confidence: "medium", signals: ["exact_title"], reasons: ["sameTitle"] })], false));
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent(/possible duplicate/i);
    expect(region).toHaveTextContent(/72% similarity/);
  });

  it("distinguishes a strong match from a possible one", () => {
    renderAlert(ready([match({ score: 88, confidence: "high", signals: ["exact_title", "title_author"], reasons: ["sameTitle", "sameAuthor"] })], false));
    expect(screen.getByRole("status")).toHaveTextContent(/strong duplicate match/i);
  });

  it("explains WHY, in words, not just a percentage", () => {
    renderAlert(ready([match({ reasons: ["sameIsbn", "sameTitle", "sameAuthor"] })], true));
    expect(screen.getByText("Same ISBN")).toBeInTheDocument();
    expect(screen.getByText("Same title")).toBeInTheDocument();
    expect(screen.getByText("Same author")).toBeInTheDocument();
  });

  it("expands to the full list of matches on request", () => {
    const second = match({
      bookId: "22222222-2222-4222-8222-222222222222",
      title: "Educational Research (Second Copy)",
      score: 76,
      confidence: "medium",
      signals: ["exact_title"],
      reasons: ["sameTitle"],
    });
    renderAlert(ready([match({ blocked: false } as Partial<DuplicateMatch>), second], false));
    expect(screen.queryByText("Educational Research (Second Copy)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show all 2 matches/i }));
    expect(screen.getByText("Educational Research (Second Copy)")).toBeInTheDocument();
  });

  it("offers an override for an ISBN collision", () => {
    const { onOverrideChange } = renderAlert(ready([match()], true));
    const checkbox = screen.getByRole("checkbox", { name: /different edition/i });
    fireEvent.click(checkbox);
    expect(onOverrideChange).toHaveBeenCalledWith({
      acknowledgedBookId: "11111111-1111-4111-8111-111111111111",
      reason: "different_edition",
    });
  });

  it("offers NO override for a byte-identical PDF", () => {
    renderAlert(ready([match({ signals: ["content_hash"], reasons: ["sameFile"], score: 100 })], true));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/already registered in the library/i);
  });

  it("says where an acknowledged duplicate will go", () => {
    renderAlert(ready([match()], true), {
      acknowledgedBookId: "11111111-1111-4111-8111-111111111111",
      reason: "different_edition",
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/review queue/i);
  });

  it("links to the existing record and to the duplicate queue", () => {
    renderAlert(ready([match()], true));
    expect(screen.getByRole("link", { name: /open the record/i })).toHaveAttribute(
      "href",
      "/admin/edit/11111111-1111-4111-8111-111111111111",
    );
    expect(screen.getByRole("link", { name: /open the duplicate queue/i })).toHaveAttribute(
      "href",
      "/admin/books/duplicates",
    );
  });

  it("marks evidence AGAINST identity differently from evidence for it", () => {
    renderAlert(
      ready(
        [
          match({
            score: 76,
            confidence: "medium",
            signals: ["exact_title"],
            reasons: ["sameTitle", "differentEdition"],
          }),
        ],
        false,
      ),
    );
    // A possible match stays a one-line summary until asked to explain
    // itself — the evidence chips are behind the disclosure.
    expect(screen.queryByText("Different edition")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show the match/i }));
    expect(screen.getByText("Different edition")).toBeInTheDocument();
    expect(screen.getByText("Same title")).toBeInTheDocument();
    // The "same title is not always the same book" line appears whenever there
    // is contrary evidence, disclosed or not.
    expect(screen.getByRole("status")).toHaveTextContent(/not always the same book/i);
  });
});
