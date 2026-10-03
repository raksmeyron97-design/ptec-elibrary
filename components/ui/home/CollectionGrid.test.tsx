import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { resolveServerTree } from "@/components/ui/publications/article/test-utils";
import CollectionGrid, { COLLECTION_COUNT_MIN_DISPLAY } from "./CollectionGrid";

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

// HomeSection's header reads the locale through the client hook.
vi.mock("next-intl", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-intl")>()),
  useLocale: () => "en",
}));

// The locale-aware <Link> needs app-router context this test does not set up.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

const getCollectionStats = vi.hoisted(() => vi.fn());
vi.mock("@/lib/collection-stats", () => ({ getCollectionStats }));

function stats(overrides: Partial<Record<"books" | "theses" | "publications" | "learningPaths", number>>) {
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

beforeEach(() => getCollectionStats.mockReset());

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
    expect(countOf("books")).toBe("1,732 items");
    expect(countOf("learningPaths")).toBe("9 items");
  });

  it("never prints '1 item' — production's theses and journals counts on 2026-09-17", async () => {
    await renderGrid(stats({}));
    expect(screen.queryByText("1 item")).not.toBeInTheDocument();
    expect(screen.getByText("1,732 items")).toBeInTheDocument();
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
});
