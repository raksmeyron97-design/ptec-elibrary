import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { resolveServerTree } from "@/components/ui/publications/article/test-utils";
import CollectionGrid, { BOOKS_TILE_DEPARTMENTS, COLLECTION_COUNT_MIN_DISPLAY } from "./CollectionGrid";
import { PHYSICAL_CATALOG_MIN_DISPLAY } from "./TrustBar";

// Strings from the real English catalogue, so a missing key fails here —
// same shape as TrustBar.test.tsx.
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const messages = (await import("@/messages/en.json")).default;
  return {
    getLocale: async () => "en",
    getTranslations: async (arg?: string | { namespace?: string }) =>
      createTranslator({
        locale: "en",
        messages,
        namespace: (typeof arg === "string" ? arg : arg?.namespace) as never,
      }),
  };
});

// The locale-aware <Link> needs app-router context this test does not set up.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

const getCollectionStats = vi.hoisted(() => vi.fn());
vi.mock("@/lib/collection-stats", () => ({
  getCollectionStats,
  formatCount: (n: number) => new Intl.NumberFormat("en").format(n),
}));

const getDepartmentCountsCached = vi.hoisted(() => vi.fn());
vi.mock("@/lib/home-data", () => ({ getDepartmentCountsCached }));

const DEPARTMENTS = [
  { name: "Science", count: 256 },
  { name: "Mathematics", count: 142 },
  { name: "Khmer", count: 90 },
  { name: "History", count: 12 },
  { name: "Art", count: 3 },
  { name: "Music", count: 2 },
];

function stats(
  overrides: Partial<Record<"books" | "theses" | "publications" | "learningPaths" | "physicalCatalogs", number>>,
) {
  return {
    books: 1732,
    theses: 1,
    publications: 1,
    physicalCatalogs: 6,
    learningPaths: 9,
    totalDigitalResources: 1734,
    searchableResources: 1600,
    calculatedAt: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  getCollectionStats.mockReset();
  getDepartmentCountsCached.mockReset();
  getDepartmentCountsCached.mockResolvedValue(DEPARTMENTS);
});

async function renderGrid(s: ReturnType<typeof stats> | null) {
  getCollectionStats.mockResolvedValue(s);
  const { container } = render(await resolveServerTree(<CollectionGrid />));
  const countOf = (field: string) =>
    container.querySelector(`[data-collection-count="${field}"]`)?.textContent ?? null;
  return { container, countOf };
}

describe("CollectionGrid — collection count floor", () => {
  it("prints a count AT the floor", async () => {
    const { countOf } = await renderGrid(stats({ theses: COLLECTION_COUNT_MIN_DISPLAY }));
    expect(countOf("theses")).toBe(`${COLLECTION_COUNT_MIN_DISPLAY} items`);
  });

  it("drops a count one under the floor, and only that one", async () => {
    const { countOf } = await renderGrid(stats({ theses: COLLECTION_COUNT_MIN_DISPLAY - 1 }));
    expect(countOf("theses")).toBeNull();
    // Control: the other tiles still print theirs, so "absent" above is the
    // floor and not a grid that rendered no counts at all.
    expect(countOf("books")).toBe("1,732");
    expect(countOf("learningPaths")).toBe("9 items");
  });

  it("never prints '1 item' — production's theses and journals counts on 2026-09-17", async () => {
    await renderGrid(stats({}));
    expect(screen.queryByText("1 item")).not.toBeInTheDocument();
    expect(screen.getByText("1,732")).toBeInTheDocument();
  });

  it("still links every collection when its count is hidden", async () => {
    await renderGrid(stats({ theses: 0, publications: 0 }));
    expect(screen.getByRole("link", { name: /Browse Theses/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Browse Journals/ })).toBeInTheDocument();
  });

  it("renders the links with no counts when stats are unavailable", async () => {
    const { container } = await renderGrid(null);
    expect(container.querySelectorAll("[data-collection-count]")).toHaveLength(0);
    expect(screen.getByRole("link", { name: /Browse Books/ })).toBeInTheDocument();
  });

  it("holds the Physical Library to the hero's floor, not the collection floor", async () => {
    const below = await renderGrid(stats({ physicalCatalogs: PHYSICAL_CATALOG_MIN_DISPLAY - 1 }));
    expect(below.countOf("physicalCatalogs")).toBeNull();
    expect(screen.getByRole("link", { name: /Browse Physical Library/ })).toHaveAttribute("href", "/catalogs");
  });

  it("prints the Physical Library's count at the floor", async () => {
    const { countOf } = await renderGrid(stats({ physicalCatalogs: PHYSICAL_CATALOG_MIN_DISPLAY }));
    expect(countOf("physicalCatalogs")).toBe(`${PHYSICAL_CATALOG_MIN_DISPLAY} items`);
  });
});

describe("CollectionGrid — the Books feature tile", () => {
  it("offers the largest departments as links to their filtered listing", async () => {
    await renderGrid(stats({}));
    const chips = screen.getByRole("list", { name: "Filter by department" });
    const links = within(chips).getAllByRole("link");
    expect(links).toHaveLength(BOOKS_TILE_DEPARTMENTS);
    expect(links[0]).toHaveAttribute("href", "/books?dept=Science");
    // A department count under the floor is not printed, but the chip stays.
    expect(within(chips).getByRole("link", { name: "Art" })).toBeInTheDocument();
    expect(within(chips).getByRole("link", { name: "Science 256" })).toBeInTheDocument();
  });

  it("never nests one link inside another", async () => {
    const { container } = await renderGrid(stats({}));
    expect(container.querySelectorAll("a a")).toHaveLength(0);
  });

  it("marks the external destinations as opening a new tab, in the link's own name", async () => {
    await renderGrid(stats({}));
    const external = screen.getAllByRole("link").filter((a) => a.getAttribute("target") === "_blank");
    expect(external.length).toBeGreaterThan(0);
    for (const a of external) expect(a).toHaveAccessibleName(/Opens in a new tab/);
  });
});
