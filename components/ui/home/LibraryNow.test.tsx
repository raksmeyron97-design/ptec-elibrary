import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages/en.json";
import LibraryNow from "./LibraryNow";

// LibraryNow renders <Link> from the locale-aware navigation wrapper, which
// needs app-router/routing context this test doesn't set up — swap in a
// plain anchor, same pattern as components/ui/theses/record/AbstractBlock.test.tsx.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

// PTEC spec used across lib/library-hours.test.ts: weekdays 7–17, Sat 8–16.
const SPEC = ["Mo-Fr 07:00-17:00", "Sa 08:00-16:00"];

function renderLibraryNow() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <LibraryNow openingHoursSpec={SPEC} mapPlaceUrl="https://maps.example/ptec" />
    </NextIntlClientProvider>,
  );
}

describe("LibraryNow — today's hours SSR default (audit 2026-07-26, issue #7)", () => {
  it("renders today's hours range on first render, before any client effect runs", () => {
    // Regression test: this used to render only a loading skeleton
    // (`animate-pulse`, no text) until a useEffect fired on mount, which
    // meant server-rendered HTML, crawlers, and no-JS clients saw an empty
    // hours block. `render()` here reflects exactly that first-render output
    // — no `act(() => vi.advanceTimersByTime(...))`, no waiting for effects.
    renderLibraryNow();

    // One of the two ranges from SPEC must be present as real text — which
    // one depends on today's real weekday, so accept either rather than
    // freezing system time (this suite doesn't otherwise need fake timers).
    const hasWeekdayHours = screen.queryAllByText(/7:00\s*(AM|–)/i).length > 0;
    const hasSaturdayHours = screen.queryAllByText(/8:00\s*(AM|–)/i).length > 0;
    const hasClosedLabel = screen.queryAllByText(/closed/i).length > 0;
    expect(hasWeekdayHours || hasSaturdayHours || hasClosedLabel).toBe(true);

    // The old bug's exact symptom: a pulse-skeleton standing in for the
    // hours text with no accessible text at all.
    const skeletons = document.querySelectorAll(".animate-pulse");
    for (const skeleton of skeletons) {
      expect(skeleton.textContent?.trim()).toBe("");
    }
  });

  it("does not claim a live open/closed status before mount-time confirmation runs", () => {
    // The live dot is the one part that's genuinely time-sensitive under ISR
    // caching, so it's fine (expected) for it to still show its own
    // pre-mount placeholder rather than a possibly-stale claim. This test
    // pins that the fix didn't accidentally start asserting isOpen/closed
    // synchronously too.
    renderLibraryNow();
    expect(screen.queryByText(/open now|closed now/i)).not.toBeInTheDocument();
  });
});

describe("LibraryNow — the week's hours and the photo (homepage redesign 2026-10)", () => {
  it("lists all seven days, Monday first, with exactly one marked as today", () => {
    renderLibraryNow();
    const table = screen.getByRole("table", { name: enMessages.home.libraryNowWeekLabel });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(7);
    expect(within(rows[0]).getByRole("rowheader")).toHaveTextContent(/^Mon/);
    expect(within(rows[6]).getByRole("rowheader")).toHaveTextContent(/^Sun/);
    expect(rows.filter((r) => r.getAttribute("aria-current") === "date")).toHaveLength(1);
  });

  it("prints each day's regular hours, and Closed for a day with none", () => {
    renderLibraryNow();
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    // Sunday has no window in SPEC; unless today IS Sunday (then it shows
    // today's label, which is also "Closed"), the row says Closed.
    expect(rows[6]).toHaveTextContent(/Closed/);
  });

  it("falls back to the building photograph, lazily, when the gallery is empty", () => {
    const { container } = renderLibraryNow();
    const img = container.querySelector("figure img");
    expect(img).toHaveAttribute("src", "/hero/ptec-library-960.jpg");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(container.querySelectorAll("figure img")).toHaveLength(1);
  });

  it("offers directions as the primary action and the physical catalogue beside it", () => {
    renderLibraryNow();
    expect(screen.getByRole("link", { name: /Get directions/ })).toHaveAttribute("href", "https://maps.example/ptec");
    expect(screen.getByRole("link", { name: /Browse physical catalog/ })).toHaveAttribute("href", "/catalogs");
  });
});
