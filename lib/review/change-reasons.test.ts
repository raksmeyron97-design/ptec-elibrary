/**
 * Structured reasons, without a second rejection model.
 *
 * The vocabulary makes "what do we send records back for?" answerable across a
 * term. The constraint is that it must do so while the stored note stays the
 * one `books.review_note` column every existing surface already renders.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CHANGE_REASONS,
  CHANGE_REASON_LABELS,
  composeChangeNote,
  hasChangeRationale,
  isChangeReason,
  normalizeReasons,
} from "./change-reasons";

describe("the vocabulary", () => {
  it("every reason has a label", () => {
    for (const reason of CHANGE_REASONS) {
      expect(CHANGE_REASON_LABELS[reason], reason).toBeTruthy();
    }
  });

  it("is short enough to read to the end of", () => {
    expect(CHANGE_REASONS.length).toBeLessThanOrEqual(10);
  });

  it("recognises its own members and nothing else", () => {
    expect(isChangeReason("isbn")).toBe(true);
    expect(isChangeReason("vibes")).toBe(false);
  });
});

describe("normalizeReasons", () => {
  it("drops anything outside the vocabulary", () => {
    expect(normalizeReasons(["isbn", "not-a-reason", "cover"])).toEqual(["isbn", "cover"]);
  });

  it("de-duplicates", () => {
    expect(normalizeReasons(["isbn", "isbn"])).toEqual(["isbn"]);
  });

  it("orders by the vocabulary, not by click order — two reviewers picking the same two reasons store the same note", () => {
    expect(normalizeReasons(["cover", "title"])).toEqual(normalizeReasons(["title", "cover"]));
  });

  it("answers [] for nothing rather than throwing", () => {
    expect(normalizeReasons(undefined)).toEqual([]);
    expect(normalizeReasons([])).toEqual([]);
  });
});

describe("composeChangeNote", () => {
  it("puts the categories before the detail", () => {
    expect(composeChangeNote(["author"], "The title page says Sok Dara.")).toBe(
      "Incorrect author or contributor — The title page says Sok Dara.",
    );
  });

  it("joins several reasons", () => {
    expect(composeChangeNote(["title", "isbn"], "")).toBe(
      "Incorrect title; Missing or incorrect ISBN",
    );
  });

  it("with no reasons picked, the note is exactly the free text — old notes render identically", () => {
    expect(composeChangeNote([], "  Year is missing.  ")).toBe("Year is missing.");
    expect(composeChangeNote(undefined, "Year is missing.")).toBe("Year is missing.");
  });

  it("stores the canonical English labels, never the reviewer's UI locale", () => {
    // The note outlives the session that wrote it and is read by whoever opens
    // the record; freezing one reader's language into the data is the bug.
    const note = composeChangeNote(["rights"], "");
    expect(note).toBe(CHANGE_REASON_LABELS.rights);
    expect(note).not.toMatch(/[ក-៿]/);
  });
});

describe("hasChangeRationale", () => {
  it("a reason alone is enough", () => {
    expect(hasChangeRationale(["file"], "")).toBe(true);
  });

  it("a sentence alone is enough — otherwise 'Other' is unusable", () => {
    expect(hasChangeRationale([], "The scan is upside down.")).toBe(true);
  });

  it("neither is not enough — an empty rejection is what review_note exists to prevent", () => {
    expect(hasChangeRationale([], "   ")).toBe(false);
    expect(hasChangeRationale(undefined, "")).toBe(false);
  });

  it("an unrecognised reason does not count as one", () => {
    expect(hasChangeRationale(["made-up"], "")).toBe(false);
  });
});

describe("no second rejection model", () => {
  const actions = readFileSync(join(process.cwd(), "app/actions/review.ts"), "utf8");

  it("the composed note is stored in review_note, the existing column", () => {
    expect(actions).toContain("composeChangeNote");
    expect(actions).toContain("updates.review_note = note");
  });

  it("the reason ids ride on the existing audit row, not a new table", () => {
    expect(actions).toMatch(/logAdminAction\([\s\S]{0,400}reasons/);
    expect(actions).not.toMatch(/\.from\("review_reasons"\)/);
  });

  it("requesting changes still refuses to proceed with no rationale at all", () => {
    expect(actions).toContain("hasChangeRationale");
    expect(actions).toContain("A reason is required when requesting changes");
  });

  it("the UI offers exactly the vocabulary, translated, in both languages", () => {
    const client = readFileSync(
      join(process.cwd(), "app/(admin)/admin/(protected)/review/_components/ReviewQueueClient.tsx"),
      "utf8",
    );
    expect(client).toContain("CHANGE_REASONS.map");
    for (const file of ["messages/en.json", "messages/km.json"]) {
      const messages = JSON.parse(readFileSync(join(process.cwd(), file), "utf8"));
      for (const reason of CHANGE_REASONS) {
        expect(messages.adminReview.reasons[reason], `${file} → ${reason}`).toBeTruthy();
      }
    }
  });
});
