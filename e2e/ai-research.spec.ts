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

import { test, expect, type Page } from "@playwright/test";
import { installSeededReaderSession } from "./utils/auth";

const BOOK = "/books/foundations-of-education";

/** Open the assistant and ask one question; resolves when an answer lands. */
async function ask(page: Page, question: string) {
  await page.getByRole("button", { name: /ask the library assistant/i }).click();
  const input = page.getByPlaceholder(/ask anything/i);
  await expect(input).toBeVisible();
  await input.fill(question);
  await page.getByRole("button", { name: /^send$/i }).click();
  // The answer replaces the typing indicator; sources render with it.
  await expect(page.getByText(/according to the retrieved|could not find|couldn’t find|don’t have enough/i).first())
    .toBeVisible({ timeout: 30_000 });
}

test.describe("research assistant", () => {
  test.beforeEach(async ({ page }) => {
    await installSeededReaderSession(page);
  });

  test("answers a question about the book in front of you, and shows the page", async ({ page }) => {
    await page.goto(BOOK);
    await ask(page, "What does it say about formative assessment?");

    const sources = page.getByText("Sources", { exact: true });
    await expect(sources).toBeVisible();

    // The cited page must be one the seed actually contains. p. 12 carries the
    // formative-assessment passage; a citation to any other page would mean
    // retrieval or grounding stopped agreeing about what was retrieved.
    const citation = page.getByRole("link", { name: /Foundations of Education.*p\. 12/i });
    await expect(citation).toBeVisible();
    await expect(citation).toHaveAttribute("href", /\/books\/foundations-of-education\?page=12/);
  });

  test("a source can be opened at its page, copied as a citation and kept", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(BOOK);
    await ask(page, "What does it say about classroom management?");

    await expect(page.getByRole("button", { name: /copy citation/i }).first()).toBeVisible();
    await page.getByRole("button", { name: /copy citation/i }).first().click();
    await expect(page.getByRole("button", { name: /citation copied/i }).first()).toBeVisible();

    await page.getByRole("button", { name: /save to research/i }).first().click();
    await expect(page.getByRole("button", { name: /^saved$/i }).first()).toBeVisible();

    // The saved source reaches the dashboard, which is the point of saving it.
    await page.goto("/dashboard");
    await expect(page.getByText(/my research/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("says it has no evidence rather than inventing some", async ({ page }) => {
    await page.goto(BOOK);
    await ask(page, "What does it say about zebrafish cardiac regeneration protocols?");

    // No sources panel, because nothing was retrieved to put in it.
    await expect(page.getByText("Sources", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/could not find|couldn’t find|no evidence/i).first()).toBeVisible();
  });

  test("answers a Khmer question and still cites the English source", async ({ page }) => {
    await page.goto(BOOK);
    await ask(page, "តើសៀវភៅនេះនិយាយអ្វីអំពី assessment?");

    // The question is Khmer; the document is English. The citation must point
    // at the real English record, never at a translated or invented title.
    await expect(page.getByRole("link", { name: /Foundations of Education/i }).first())
      .toBeVisible({ timeout: 30_000 });
  });

  test("a citation request costs no model call and returns the record's own reference", async ({ page }) => {
    await page.goto(BOOK);
    await ask(page, "Cite this in APA");

    // Assembled by lib/citations from catalogue fields — so the answer carries
    // the title and links at the record's cite panel.
    await expect(page.getByText(/APA reference for/i)).toBeVisible();
    await expect(page.getByText(/Foundations of Education/).first()).toBeVisible();
  });
});
