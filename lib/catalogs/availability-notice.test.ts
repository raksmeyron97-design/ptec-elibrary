/**
 * The public catalogue says its availability is not live — until it is.
 *
 * The PMB export carries no loan state, so every imported copy starts as
 * `available` while loans are still recorded in PMB. "2 of 3 available" is then
 * a fact about this database, not about the shelf, and both public pages that
 * state it must say so. The switch is CATALOG_AVAILABILITY_LIVE in .env
 * (lib/catalogs/availability-live.ts), set once the loans are re-issued in Koha.
 *
 * Phase 9.1 extended the rule to /search, which had shown "On the shelf now"
 * for every print record while /catalogs said the opposite.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { catalogAvailabilityIsLive } from "@/lib/catalogs/availability-live";
import en from "@/messages/en.json";
import km from "@/messages/km.json";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("catalogue availability notice", () => {
  it("is off unless the administrator turns it on, and only by an explicit yes", () => {
    expect(catalogAvailabilityIsLive({})).toBe(false);
    for (const v of ["", "off", "false", "0", "no", "maybe"]) expect(catalogAvailabilityIsLive({ CATALOG_AVAILABILITY_LIVE: v })).toBe(false);
    for (const v of ["on", "true", "1", "yes", " ON "]) expect(catalogAvailabilityIsLive({ CATALOG_AVAILABILITY_LIVE: v })).toBe(true);
  });

  it("is documented where the administrator sets it", () => {
    expect(read(".env.example")).toMatch(/CATALOG_AVAILABILITY_LIVE/);
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

  it("is hidden by the switch, not by editing the pages", () => {
    const component = read("components/ui/books/CatalogAvailabilityNotice.tsx");
    expect(component).toMatch(/if \(catalogAvailabilityIsLive\(\)\) return null/);
  });
});

describe("/search states print availability only when it is live", () => {
  const route = () => read("app/api/search/native/route.ts");

  it("passes the switch into every physical availability decision", () => {
    const calls = route().match(/physicalAvailability\(\{[^}]*\}\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).toMatch(/live/);
  });

  it("sends no count of copies on the shelf while it is not live", () => {
    expect(route()).toMatch(/copiesAvailable: hasCopyCounters && live \?/);
  });

  it("the result card says 'ask at the desk' when the count was not sent", () => {
    const card = read("app/[locale]/(public)/search/SearchPageClient.tsx");
    expect(card).toMatch(/result\.copiesAvailable != null \?/);
    expect(card).toMatch(/t\("askAtDesk"\)/);
  });
});
