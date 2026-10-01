import type { Page } from "@playwright/test";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Every JSON-LD node on the page. Since SEO Phase 4 a page carries ONE
 * `<script type="application/ld+json">` holding an `@graph`; a spec looks a
 * node up by `@type` among these rather than among the blocks.
 */
export async function jsonLdNodes(page: Page): Promise<Record<string, any>[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((b) => {
    const doc = JSON.parse(b);
    return Array.isArray(doc["@graph"]) ? doc["@graph"] : [doc];
  });
}
