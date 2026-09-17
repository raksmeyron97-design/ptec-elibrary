import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { resolveServerTree } from "@/components/ui/publications/article/test-utils";
import TrustBar, { PHYSICAL_CATALOG_MIN_DISPLAY } from "./TrustBar";

// Server components read their strings through next-intl/server. Serve them
// from the real English catalogue, so these tests fail on a missing key —
// same shape as ArticleHeader.test.tsx.
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

const getCollectionStats = vi.hoisted(() => vi.fn());
vi.mock("@/lib/collection-stats", () => ({ getCollectionStats }));

// <AnimatedStat> counts up behind an IntersectionObserver jsdom does not have.
// Stub it as "already on screen": the component starts at the real value, so
// this settles it there rather than inventing a number.
class ImmediateIntersectionObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.cb(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = "";
  thresholds = [];
}
vi.stubGlobal("IntersectionObserver", ImmediateIntersectionObserver);

const DIGITAL_LABEL = "Digital resources";
const PHYSICAL_LABEL = "Books in the physical library";
const SINCE_LABEL = "Serving PTEC since";

/** Production's real shape on 2026-09-17, with the physical count varied. */
function stats(physicalCatalogs: number) {
  return {
    books: 1732,
    theses: 1,
    publications: 1,
    physicalCatalogs,
    learningPaths: 9,
    totalDigitalResources: 1734,
    searchableResources: 1600,
    calculatedAt: "2026-09-17T00:00:00.000Z",
  };
}

beforeEach(() => {
  // This suite asserts on the CALL COUNT, so the spy cannot carry the previous
  // test's renders (vitest.config.ts does not set `clearMocks`).
  getCollectionStats.mockClear();
});

async function renderBand(physicalCatalogs: number) {
  getCollectionStats.mockResolvedValue(stats(physicalCatalogs));
  render(await resolveServerTree(<TrustBar />));
}

describe("TrustBar — physical-catalogue display floor", () => {
  it("shows the tile when the catalogue is above the floor", async () => {
    await renderBand(PHYSICAL_CATALOG_MIN_DISPLAY + 15);
    expect(screen.getByText(PHYSICAL_LABEL)).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
  });

  it("shows the tile AT the floor — the boundary belongs visible", async () => {
    await renderBand(PHYSICAL_CATALOG_MIN_DISPLAY);
    expect(screen.getByText(PHYSICAL_LABEL)).toBeInTheDocument();
    expect(screen.getByText(String(PHYSICAL_CATALOG_MIN_DISPLAY))).toBeInTheDocument();
  });

  it("drops the tile below the floor, and only that tile", async () => {
    // 6 is what production held when this floor was introduced.
    await renderBand(6);

    expect(screen.queryByText(PHYSICAL_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByText("6")).not.toBeInTheDocument();
    // The control on every absence assertion above: the band itself rendered,
    // and the other two tiles are untouched. Without these, "absent" would
    // also pass if TrustBar had returned null or thrown.
    expect(screen.getByText(DIGITAL_LABEL)).toBeInTheDocument();
    expect(screen.getByText(SINCE_LABEL)).toBeInTheDocument();
  });

  it("reads the rendered figure and the floor from the same stats field", async () => {
    // One getCollectionStats() call decides both. A second read — or a count
    // taken from anywhere else — could disagree with the number on screen.
    await renderBand(6);
    expect(getCollectionStats).toHaveBeenCalledTimes(1);
  });
});

describe("TrustBar — the grid tracks the number of tiles, not the breakpoint", () => {
  const listClasses = () => screen.getByRole("list").className;

  it("gives a two-tile band two columns at every width", async () => {
    await renderBand(6);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    const cls = listClasses();
    expect(cls).toContain("grid-cols-2");
    expect(cls).toContain("sm:grid-cols-2");
    expect(cls).toContain("lg:grid-cols-2");
    // The defect this replaces: a fixed third track left an empty column at
    // lg, and `sm:grid-cols-2` orphaned a tile onto its own row.
    expect(cls).not.toContain("lg:grid-cols-3");
    expect(cls).not.toContain("grid-cols-1");
  });

  it("leaves a full three-tile band exactly as it was", async () => {
    await renderBand(300);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);

    const cls = listClasses();
    expect(cls).toContain("grid-cols-3");
    expect(cls).toContain("sm:grid-cols-2");
    expect(cls).toContain("lg:grid-cols-3");
  });
});
