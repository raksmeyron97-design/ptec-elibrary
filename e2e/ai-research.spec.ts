// e2e/ai-research.spec.ts
//
// The research loop, in a browser: ask a question about the book in front of
// you, get an answer whose sources name a page, open that page, copy the
// citation, keep the source.
//
// Every one of these was unreachable by any test before this spec. CI has no
// Gemini key, so the assistant's model path threw `unavailable` on every
// request; AI_MOCK_PROVIDER (lib/ai/mock-model.ts) supplies a deterministic
// model that answers only from the evidence it was handed, so what these
// assertions actually verify is the retrieval, the grounding and the wiring —
// not a model's prose.
//
// The seeded book has five pages of text (supabase/seed.sql §13) with
// distinctive phrases; the page numbers asserted here are those page numbers.

import { test, expect, type Locator, type Page } from "@playwright/test";
import { installSeededReaderSession } from "./utils/auth";

const BOOK = "/books/foundations-of-education";

/**
 * Ask one question and return the answer bubble.
 *
 * It waits for an ANSWER to appear rather than for particular words: answers
 * come in two languages and several shapes (a grounded reply, a citation, an
 * honest refusal), and a helper that waits for English prose fails on the
 * Khmer and citation paths for reasons that have nothing to do with them.
 * An error bubble also satisfies the wait, so a quota or cooldown message
 * fails the assertion that follows with its own text on screen instead of a
 * bare 30-second timeout.
 */
async function ask(page: Page, question: string): Promise<Locator> {
  const answers = page.getByTestId("ask-answer");
  const before = await answers.count();

  await page.getByRole("button", { name: /ask the library assistant/i }).click();
  const input = page.getByPlaceholder(/ask anything/i);
  await expect(input).toBeVisible();
  await input.fill(question);
  await page.getByRole("button", { name: /^send$/i }).click();

  await expect(answers).toHaveCount(before + 1, { timeout: 45_000 });
  return answers.last();
}

test.describe("research assistant", () => {
  test.beforeEach(async ({ page }) => {
    await installSeededReaderSession(page);
  });

  test("answers a question about the book in front of you, and shows the page", async ({ page }) => {
    await page.goto(BOOK);
    const answer = await ask(page, "What does it say about formative assessment?");
    await expect(answer).toContainText(/formative assessment/i);

    await expect(page.getByTestId("ask-sources")).toBeVisible();

    // The cited page must be one the seed actually contains. p. 12 carries the
    // formative-assessment passage; a citation to any other page would mean
    // retrieval and grounding stopped agreeing about what was retrieved.
    const citation = page.getByRole("link", { name: /Foundations of Education.*p\. 12/i });
    await expect(citation).toBeVisible();
    await expect(citation).toHaveAttribute("href", /\/books\/foundations-of-education\?page=12/);
  });

  test("a source can be copied as a citation and kept", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(BOOK);
    await ask(page, "What does it say about classroom management?");

    await expect(page.getByTestId("ask-sources")).toBeVisible();
    await page.getByRole("button", { name: /copy citation/i }).first().click();
    await expect(page.getByRole("button", { name: /citation copied/i }).first()).toBeVisible();

    await page.getByRole("button", { name: /save to research/i }).first().click();
    await expect(page.getByRole("button", { name: /^saved$/i }).first()).toBeVisible();

    // The saved source reaches the reader's collections, which is the point of
    // saving it. reading_list_items (0136) is what carries the page number.
    await page.goto("/dashboard?tab=lists#library");
    await expect(page.getByText(/my research/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("says it has no evidence rather than inventing some", async ({ page }) => {
    await page.goto(BOOK);
    const answer = await ask(page, "What does it say about zebrafish cardiac regeneration protocols?");

    await expect(answer).toContainText(/could not find|couldn’t find|no evidence|not find a passage/i);
    // No sources panel, because nothing was retrieved to put in one.
    await expect(page.getByTestId("ask-sources")).toHaveCount(0);
  });

  test("answers a Khmer question and still cites the English source", async ({ page }) => {
    await page.goto(BOOK);
    await ask(page, "តើសៀវភៅនេះនិយាយអ្វីអំពី assessment?");

    // The question is Khmer; the document is English. The citation must point
    // at the real English record, never at a translated or invented title.
    await expect(page.getByTestId("ask-sources")).toBeVisible();
    await expect(page.getByRole("link", { name: /Foundations of Education/i }).first()).toBeVisible();
  });

  test("a citation request is answered from catalogue metadata", async ({ page }) => {
    await page.goto(BOOK);
    const answer = await ask(page, "Cite this in APA");

    // Assembled by lib/citations from the record's own fields — no model, and
    // the reference carries the seeded publication year.
    await expect(answer).toContainText(/APA reference for/i);
    await expect(answer).toContainText(/Foundations of Education/);
    await expect(answer).toContainText(/2023/);
  });
});
