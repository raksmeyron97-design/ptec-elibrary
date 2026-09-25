/**
 * The public catalogue says its availability is not live — until it is.
 *
 * The PMB export carries no loan state, so every imported copy starts as
 * `available` while loans are still recorded in PMB. "2 of 3 available" is then
 * a fact about this database, not about the shelf, and both public pages that
 * state it must say so. Only the Koha integration, which makes item state come
 * from the system that records the loan, may turn the flag on.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOG_AVAILABILITY_IS_LIVE } from "@/lib/catalog";
import en from "@/messages/en.json";
import km from "@/messages/km.json";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("catalogue availability notice", () => {
  it("is on: circulation is not yet read from the system that records it", () => {
    expect(CATALOG_AVAILABILITY_IS_LIVE).toBe(false);
  });

  it.each([
    "app/[locale]/(public)/catalogs/page.tsx",
    "app/[locale]/(public)/catalogs/[slug]/page.tsx",
  ])("%s renders it wherever copy availability is stated", (file) => {
    expect(read(file)).toMatch(/<CatalogAvailabilityNotice text=\{t\("availabilityNotice"\)\}/);
  });

  it("has words in both languages and sends the reader to the desk", () => {
    expect(en.catalogs.availabilityNotice).toMatch(/librarian/i);
    expect(km.catalogs.availabilityNotice).toMatch(/បណ្ណារក្ស/);
  });

  it("is hidden by the flag, not by editing the pages", () => {
    const component = read("components/ui/books/CatalogAvailabilityNotice.tsx");
    expect(component).toMatch(/if \(CATALOG_AVAILABILITY_IS_LIVE\) return null/);
  });
});
