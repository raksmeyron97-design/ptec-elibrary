// Pins the behaviour of the /about/team directory that a production build
// compiles happily and a screenshot cannot see: what a filter chip announces,
// whether the profile link is a real href, whether focus comes back, and —
// the one that matters most — that a member whose contact details the library
// has NOT approved never has any rendered.
//
// The pure rules live in lib/team/directory.ts and are tested there. This file
// tests the wiring: that the component asks those rules the right questions
// and renders their answers accessibly.

import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import kmMessages from "@/messages/km.json";
import type { PublicTeamMember, PublicTeamSection } from "@/lib/team/public";
import TeamDirectory from "./TeamDirectory";

// next/image needs no jsdom loader here — a plain <img> keeps the alt text
// assertions honest without pulling in the optimizer.
vi.mock("next/image", () => ({
  default: ({ src, alt, ...rest }: { src: string; alt: string }) => {
    const props = { ...rest } as Record<string, unknown>;
    delete props.fill;
    delete props.priority;
    delete props.sizes;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} />;
  },
}));

// The locale-aware Link resolves through next-intl's router, which needs a
// request context this test has no reason to build. A plain <a> preserves the
// only thing under test: that the card's primary action is a real href.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function member(overrides: Partial<PublicTeamMember> = {}): PublicTeamMember {
  return {
    id: "m1",
    slug: "sokha",
    updated_at: null,
    name_km: "សុខា",
    name_en: "Sokha",
    position_km: null,
    position_en: "Librarian",
    education: null,
    years_experience: null,
    photo_url: null,
    photo_alt: null,
    short_bio_km: null,
    short_bio_en: null,
    bio_km: null,
    bio_en: null,
    responsibilities_km: [],
    responsibilities_en: [],
    languages: [],
    working_hours: null,
    is_featured: false,
    display_order: 0,
    section_id: null,
    section_name_km: null,
    section_name_en: null,
    phone: null,
    email: null,
    ...overrides,
  };
}

const READER: PublicTeamSection = {
  id: "reader",
  name_km: "សេវាអ្នកអាន",
  name_en: "Reader Services",
  description_km: null,
  description_en: null,
  display_order: 0,
};
const RESEARCH: PublicTeamSection = {
  id: "research",
  name_km: "គាំទ្រការស្រាវជ្រាវ",
  name_en: "Research Support",
  description_km: null,
  description_en: null,
  display_order: 1,
};

const DESK = { phone: "023 456 789", tel: "tel:023456789", hours: "Mon–Fri" };

/** Nine members: enough to cross SEARCH_THRESHOLD (8) so the search field is
 *  offered, which is the state production is in at twelve. */
function roster(): PublicTeamMember[] {
  return [
    member({ id: "a", slug: "chanraeksmey", name_en: "Chanraeksmey", name_km: "ចន្ទរស្មី", position_en: "Head of Department", section_id: "research", section_name_en: "Research Support", section_name_km: "គាំទ្រការស្រាវជ្រាវ", is_featured: true }),
    member({ id: "b", slug: "chumnor", name_en: "Chumnor", name_km: "ជំនោរ", position_en: "Deputy Head", section_id: "research", section_name_en: "Research Support", section_name_km: "គាំទ្រការស្រាវជ្រាវ", is_featured: true }),
    member({ id: "c", slug: "ampor", name_en: "Ampor", name_km: "អំពរ", section_id: "reader", section_name_en: "Reader Services", section_name_km: "សេវាអ្នកអាន" }),
    member({ id: "d", slug: "soklang", name_en: "LAM SOKLANG", name_km: "លាម សុខឡាង", section_id: "reader", section_name_en: "Reader Services", section_name_km: "សេវាអ្នកអាន" }),
    member({ id: "e", slug: "e", name_en: "Ee", name_km: "អ៊ី", section_id: "research", section_name_en: "Research Support", section_name_km: "គាំទ្រការស្រាវជ្រាវ" }),
    member({ id: "f", slug: "f", name_en: "Ef", name_km: "អេហ្វ", section_id: "research", section_name_en: "Research Support", section_name_km: "គាំទ្រការស្រាវជ្រាវ" }),
    member({ id: "g", slug: "g", name_en: "Gee", name_km: "ជី", section_id: "research", section_name_en: "Research Support", section_name_km: "គាំទ្រការស្រាវជ្រាវ" }),
    member({ id: "h", slug: "h", name_en: "Aitch", name_km: "អេច", section_id: "reader", section_name_en: "Reader Services", section_name_km: "សេវាអ្នកអាន" }),
    member({ id: "i", slug: "i", name_en: "Eye", name_km: "អាយ", section_id: "reader", section_name_en: "Reader Services", section_name_km: "សេវាអ្នកអាន" }),
  ];
}

function mount(
  members: PublicTeamMember[] = roster(),
  {
    locale = "en",
    sections = [READER, RESEARCH],
  }: { locale?: "en" | "km"; sections?: PublicTeamSection[] } = {},
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "km" ? kmMessages : enMessages}>
      <TeamDirectory
        members={members}
        featured={members.filter((m) => m.is_featured)}
        sections={sections}
        locale={locale}
        desk={DESK}
        lead={<p>Lead paragraph.</p>}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState({}, "", "/about/team");
});

/* Featured members are rendered TWICE on purpose — once in "Meet the Library
   Team" and once in the complete roster below, so search and filtering stay
   complete. Every query therefore says WHICH section it means. */
const directory = () =>
  within(
    screen.getByRole("region", {
      name: new RegExp(`${enMessages.about.team.directory.heading}|${kmMessages.about.team.directory.heading}`),
    }),
  );
const featuredSection = () =>
  within(
    screen.getByRole("region", {
      name: new RegExp(`${enMessages.about.team.featured.heading}|${kmMessages.about.team.featured.heading}`),
    }),
  );

/** The card's single control: a real profile href whose plain click opens the
 *  quick-look sheet. */
const cards = (scope = directory()) =>
  scope.getAllByRole("link", { name: /View full profile/i });

describe("the featured section", () => {
  it("introduces the is_featured members above the roster", () => {
    mount();
    const f = featuredSection();
    expect(f.getByRole("heading", { level: 2, name: /Meet the Library Team/i })).toBeInTheDocument();
    expect(cards(f)).toHaveLength(2);
  });

  it("offers a way past itself to the full roster", () => {
    mount();
    expect(featuredSection().getByRole("link", { name: /View all team/i })).toHaveAttribute(
      "href",
      "#directory",
    );
  });

  it("carries the page lead in its header, so it sits above the first face", () => {
    mount();
    expect(screen.getAllByText("Lead paragraph.")).toHaveLength(1);
    expect(featuredSection().getByText("Lead paragraph.")).toBeInTheDocument();
  });

  it("renders nothing at all when the library has featured nobody", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <TeamDirectory
          members={[member({ id: "a" })]}
          featured={[]}
          sections={[READER]}
          locale="en"
          desk={DESK}
          lead={<p>Lead paragraph.</p>}
        />
      </NextIntlClientProvider>,
    );
    expect(
      screen.queryByRole("region", { name: /Meet the Library Team/i }),
    ).not.toBeInTheDocument();
    // …and the lead moves to the roster rather than disappearing with it.
    expect(screen.getAllByText("Lead paragraph.")).toHaveLength(1);
    expect(directory().getByText("Lead paragraph.")).toBeInTheDocument();
  });

  it("keeps the featured people in the roster below as well", () => {
    mount();
    expect(cards()).toHaveLength(9);
  });
});

describe("toolbar", () => {
  it("offers the search field once the roster is worth searching", () => {
    mount();
    expect(screen.getByRole("searchbox", { name: /search the team/i })).toBeInTheDocument();
  });

  it("withholds the search field for a roster small enough to scan by eye", () => {
    mount([member({ id: "a" }), member({ id: "b", slug: "b" })]);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("offers one chip per populated area, with a count, and none for an empty one", () => {
    const empty: PublicTeamSection = { ...READER, id: "empty", name_en: "Empty Area" };
    mount(roster(), { sections: [READER, RESEARCH, empty] });
    const group = screen.getByRole("group", { name: /filter by service area/i });
    const labels = within(group)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(labels).toEqual(["All9", "Reader Services4", "Research Support5"]);
    expect(within(group).queryByRole("button", { name: /Empty Area/ })).not.toBeInTheDocument();
  });

  it("marks the selected chip aria-pressed, not merely coloured", () => {
    mount();
    const all = screen.getByRole("button", { name: /^All/ });
    const reader = screen.getByRole("button", { name: /^Reader Services/ });
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(reader).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(reader);
    expect(reader).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveAttribute("aria-pressed", "false");
  });

  it("announces the result count politely, and updates it as the view narrows", () => {
    mount();
    const status = screen.getAllByRole("status")[0];
    expect(status).toHaveTextContent("Showing all 9 members");

    fireEvent.click(screen.getByRole("button", { name: /^Reader Services/ }));
    expect(status).toHaveTextContent("Showing 4 of 9 members");
  });

  it("appears AFTER the featured section — this is an editorial page first", () => {
    const { container } = mount();
    const html = container.innerHTML;
    expect(html.indexOf("team-section-head")).toBeLessThan(html.indexOf("team-toolbar"));
  });
});

describe("filtering and search", () => {
  it("filters the roster by service area, leaving the featured section alone", () => {
    mount();
    expect(cards()).toHaveLength(9);
    fireEvent.click(screen.getByRole("button", { name: /^Reader Services/ }));
    expect(cards()).toHaveLength(4);
    expect(directory().queryByRole("heading", { name: /Chanraeksmey/ })).not.toBeInTheDocument();
    // The editorial opening is not a view of the filter.
    expect(cards(featuredSection())).toHaveLength(2);
  });

  it("searches without a request, matching mid-word", () => {
    mount();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "soklang" } });
    expect(cards()).toHaveLength(1);
    expect(directory().getByRole("heading", { name: /LAM SOKLANG/ })).toBeInTheDocument();
  });

  it("finds a Khmer name while the page is in English", () => {
    mount();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "សុខឡាង" } });
    expect(cards()).toHaveLength(1);
  });

  it("combines the area filter with the query", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /^Research Support/ }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "soklang" } });
    expect(screen.getByText(/No team member matches/)).toBeInTheDocument();
  });

  it("names the query in the empty state and clears back to the full roster", () => {
    mount();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "astrophysics" } });
    expect(screen.getByText(/No team member matches “astrophysics”/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));
    expect(cards()).toHaveLength(9);
  });
});

describe("the card", () => {
  it("makes the profile a real href so a crawler and a middle-click both work", () => {
    mount();
    expect(directory().getAllByRole("link", { name: /Chanraeksmey/ })[0]).toHaveAttribute(
      "href",
      "/about/team/chanraeksmey",
    );
  });

  it("says WHOSE profile in the accessible name while keeping the visible label in it", () => {
    mount();
    const name =
      directory()
        .getAllByRole("link", { name: /Chanraeksmey/ })[0]
        .textContent?.replace(/\s+/g, " ")
        .trim() ?? "";
    // WCAG 2.5.3: the accessible name CONTAINS the visible label…
    expect(name.startsWith("View full profile")).toBe(true);
    // …and WCAG 2.4.4: it says which link this is, out of twelve identical ones.
    expect(name).toContain("Profile of Chanraeksmey");
  });

  it("declares that activating it opens a dialog", () => {
    mount();
    expect(cards()[0]).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("renders no action for a member with no slug, rather than a dead link", () => {
    mount([member({ id: "x", slug: null, name_en: "Unslugged" })]);
    expect(screen.queryByRole("link", { name: /View full profile/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Unslugged/ })).toBeInTheDocument();
  });

  it("has exactly ONE control — no second square icon button beside it", () => {
    const { container } = mount();
    // One <a> per card in each section: 2 featured + 9 roster, plus the
    // section's own "View all team" link.
    expect(container.querySelectorAll("a").length).toBe(12);
    expect(container.querySelectorAll(".team-card button").length).toBe(0);
  });

  it("never nests an interactive element inside another", () => {
    const { container } = mount();
    expect(container.querySelector("a button")).toBeNull();
    expect(container.querySelector("button a")).toBeNull();
    expect(container.querySelector("a a")).toBeNull();
  });

  it("tags each script so the right font draws it", () => {
    const { container } = mount();
    expect(container.querySelector('[lang="km"]')).toBeTruthy();
    expect(container.querySelector('[lang="en"]')).toBeTruthy();
  });

  it("marks a featured member as a key contact", () => {
    mount();
    expect(directory().getAllByText("Key contact")).toHaveLength(2);
  });

  it("shows a circular monogram rather than an empty portrait block", () => {
    const { container } = mount([member({ id: "a", name_en: "Pheng Ampor", photo_url: null })]);
    const mark = container.querySelector(".team-avatar__mark");
    expect(mark).toBeTruthy();
    expect(mark?.textContent).toBe("PA");
    // No <img> at all — a missing portrait is not a broken one.
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("the profile sheet", () => {
  function openFirst() {
    const link = cards()[0];
    fireEvent.click(link, { button: 0 });
    return link;
  }

  it("opens on a plain click instead of navigating", () => {
    mount();
    openFirst();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("heading", { name: /Chanraeksmey/ })).toBeInTheDocument();
  });

  it("leaves a MODIFIED click alone, so open-in-new-tab still works", () => {
    mount();
    // A ⌘/Ctrl click must not be swallowed: the browser has to be allowed to
    // follow the href it can see.
    fireEvent.click(cards()[0], { button: 0, metaKey: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(cards()[0], { button: 0, ctrlKey: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the same panel from the featured section", () => {
    mount();
    fireEvent.click(cards(featuredSection())[0], { button: 0 });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("moves focus into the sheet on open", () => {
    mount();
    openFirst();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /close/i }));
  });

  it("closes on Escape and returns focus to the control that opened it", () => {
    mount();
    const trigger = openFirst();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on a backdrop click but not on a click inside the panel", () => {
    const { container } = mount();
    openFirst();
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(container.querySelector(".team-sheet__backdrop") as Element);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("locks background scroll while open and restores it on close", () => {
    mount();
    openFirst();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("always offers the route to the full profile page", () => {
    mount();
    openFirst();
    expect(
      within(screen.getByRole("dialog")).getByRole("link", { name: /Open full profile/ }),
    ).toHaveAttribute("href", "/about/team/chanraeksmey");
  });
});

describe("privacy", () => {
  function openOnly() {
    fireEvent.click(screen.getByRole("link", { name: /View full profile/i }), { button: 0 });
    return screen.getByRole("dialog");
  }

  it("renders no personal contact for a member the view nulled, and points at the desk", () => {
    // `phone`/`email` arrive null unless an admin approved public display —
    // the view (migration 0070) applies those toggles in SQL.
    mount([member({ id: "a", name_en: "Ampor", phone: null, email: null })]);
    const dialog = openOnly();

    expect(dialog.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(dialog.querySelector('a[href^="tel:"]')).toHaveAttribute("href", DESK.tel);
    expect(
      within(dialog).getByText(/Contact this member through the library desk/),
    ).toBeInTheDocument();
  });

  it("renders the approved channels when — and only when — the view supplied them", () => {
    mount([member({ id: "a", name_en: "Ampor", phone: "012 345 678", email: "ampor@ptec.edu.kh" })]);
    const dialog = openOnly();
    expect(dialog.querySelector('a[href="mailto:ampor@ptec.edu.kh"]')).toBeTruthy();
    expect(dialog.querySelector('a[href="tel:012345678"]')).toBeTruthy();
  });

  it("never makes a contact detail a search key", () => {
    mount(
      roster().map((m) =>
        m.id === "a" ? { ...m, phone: "012 345 678", email: "head@ptec.edu.kh" } : m,
      ),
    );
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "012 345" } });
    expect(screen.getByText(/No team member matches/)).toBeInTheDocument();
  });
});

describe("the ?member= deep link", () => {
  it("opens the named member's sheet on mount", () => {
    window.history.replaceState({}, "", "/about/team?member=soklang");
    mount();
    expect(
      within(screen.getByRole("dialog")).getByRole("heading", { name: /LAM SOKLANG/ }),
    ).toBeInTheDocument();
  });

  it("ignores and strips an unknown slug rather than erroring", () => {
    window.history.replaceState({}, "", "/about/team?member=nobody");
    mount();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("writes the slug when a sheet opens and removes it when it closes", () => {
    mount();
    fireEvent.click(cards()[0], { button: 0 });
    expect(new URLSearchParams(window.location.search).get("member")).toBe("chanraeksmey");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(window.location.search).toBe("");
  });

  it("replaces rather than pushes, so four quick looks leave no history trail", () => {
    const before = window.history.length;
    mount();
    fireEvent.click(cards()[0], { button: 0 });
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(cards()[1], { button: 0 });
    expect(window.history.length).toBe(before);
  });

  it("keeps other query parameters intact", () => {
    window.history.replaceState({}, "", "/about/team?utm_source=newsletter");
    mount();
    fireEvent.click(cards()[0], { button: 0 });
    const params = new URLSearchParams(window.location.search);
    expect(params.get("utm_source")).toBe("newsletter");
    expect(params.get("member")).toBe("chanraeksmey");
  });
});

describe("Khmer", () => {
  it("leads with the Khmer name and labels the chips in Khmer", () => {
    mount(roster(), { locale: "km" });
    const group = screen.getByRole("group", { name: kmMessages.about.team.directory.filterLabel });
    expect(within(group).getByRole("button", { name: /សេវាអ្នកអាន/ })).toBeInTheDocument();
    expect(directory().getAllByRole("heading", { name: /ចន្ទរស្មី/ })[0]).toBeInTheDocument();
  });

  it("does not uppercase or letter-space Khmer running text", () => {
    const { container } = mount(roster(), { locale: "km" });
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('[lang="km"]'))) {
      expect(el.className).not.toMatch(/\buppercase\b/);
      expect(el.className).not.toMatch(/\btracking-\[/);
    }
  });
});
