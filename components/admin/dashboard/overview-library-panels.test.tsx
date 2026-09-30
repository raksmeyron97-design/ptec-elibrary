import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages/en.json";
import kmMessages from "@/messages/km.json";
import type { RecentRecord, TopContentRow } from "@/lib/admin/intelligence";
import { weekdayRhythm } from "@/lib/admin/overview-library";
import CollectionTiles from "./CollectionTiles";
import ReaderRequestsPanel from "./ReaderRequestsPanel";
import RecentlyAddedPanel, { recentStatus } from "./RecentlyAddedPanel";
import MostReadShelf from "./MostReadShelf";
import PublishingCalendar from "./PublishingCalendar";
import ReadingRhythmPanel from "./ReadingRhythmPanel";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

function Wrapper({ children, locale = "en" }: { children: React.ReactNode; locale?: "en" | "km" }) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "km" ? kmMessages : enMessages}
      timeZone="Asia/Phnom_Penh"
    >
      {children}
    </NextIntlClientProvider>
  );
}

const GENERATED_AT = "2026-09-30T02:29:00Z";

describe("CollectionTiles", () => {
  const counts = {
    books: 1956,
    theses: 1,
    publications: 1,
    printTitles: 2638,
    printCopies: 13429,
    learningPaths: 9,
  };

  it("shows every shelf, and links only the ones the viewer may open", () => {
    render(
      <Wrapper>
        <CollectionTiles counts={counts} hrefs={{ books: "/admin/books", printTitles: "/admin/catalogs" }} />
      </Wrapper>,
    );
    expect(screen.getByText("1,956")).toBeInTheDocument();
    expect(screen.getByText("13,429")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /E-books/ })).toHaveAttribute("href", "/admin/books");
    // Learning paths was not granted — a tile, not a link to a 403.
    expect(screen.queryByRole("link", { name: /Learning paths/ })).not.toBeInTheDocument();
    expect(screen.getByText("Learning paths")).toBeInTheDocument();
  });

  it("says a count is unavailable rather than printing zero", () => {
    render(
      <Wrapper>
        <CollectionTiles counts={{ ...counts, printCopies: null }} hrefs={{}} />
      </Wrapper>,
    );
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("says the whole collection is unavailable when the counts failed", () => {
    render(
      <Wrapper>
        <CollectionTiles counts={null} hrefs={{}} />
      </Wrapper>,
    );
    expect(screen.getByText(/could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});

describe("ReaderRequestsPanel", () => {
  it("lists what was asked, never who asked", () => {
    render(
      <Wrapper>
        <ReaderRequestsPanel
          href="/admin/book-requests"
          generatedAt={GENERATED_AT}
          data={{
            pending: 2,
            latest: [
              {
                id: "r1",
                title: "Classroom Assessment Techniques",
                author: "Angelo",
                kind: "acquisition",
                status: "pending",
                createdAt: "2026-09-30T01:00:00Z",
              },
            ],
          }}
        />
      </Wrapper>,
    );
    expect(screen.getByText("2 requests waiting")).toBeInTheDocument();
    expect(screen.getByText("Classroom Assessment Techniques")).toBeInTheDocument();
    expect(screen.getByText("by Angelo")).toBeInTheDocument();
    expect(screen.getByText("Waiting")).toBeInTheDocument();
  });

  it("tells a failed read apart from an empty queue", () => {
    const { unmount } = render(
      <Wrapper>
        <ReaderRequestsPanel href="/admin/book-requests" generatedAt={GENERATED_AT} data={null} />
      </Wrapper>,
    );
    expect(screen.getByText(/could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText(/No reader has asked/)).not.toBeInTheDocument();
    unmount();

    render(
      <Wrapper>
        <ReaderRequestsPanel href="/admin/book-requests" generatedAt={GENERATED_AT} data={{ pending: 0, latest: [] }} />
      </Wrapper>,
    );
    expect(screen.getByText(/No reader has asked/)).toBeInTheDocument();
  });
});

describe("RecentlyAddedPanel", () => {
  const row = (over: Partial<RecentRecord>): RecentRecord => ({
    id: "b1",
    type: "book",
    title: "Action Research Series Volume 3",
    coverUrl: null,
    status: "published",
    published: true,
    department: null,
    createdAt: "2026-09-28T03:00:00Z",
    editHref: "/admin/edit/b1",
    ...over,
  });

  it("names the workflow state from the record's own fields", () => {
    expect(recentStatus({ published: true, status: "draft" })).toBe("published");
    expect(recentStatus({ published: false, status: "in_review" })).toBe("review");
    expect(recentStatus({ published: false, status: "scheduled" })).toBe("scheduled");
    expect(recentStatus({ published: false, status: null })).toBe("unpublished");
  });

  it("links a row to its edit page only when the viewer may edit that type", () => {
    render(
      <Wrapper>
        <RecentlyAddedPanel
          rows={[row({}), row({ id: "t1", type: "research_report", title: "A thesis", editHref: "/admin/theses/edit/t1" })]}
          editable={{ book: true }}
          addHref="/admin/books/upload"
          allHref="/admin/books"
          generatedAt={GENERATED_AT}
        />
      </Wrapper>,
    );
    expect(screen.getByRole("link", { name: /Action Research Series Volume 3/ })).toHaveAttribute(
      "href",
      "/admin/edit/b1",
    );
    expect(screen.queryByRole("link", { name: /A thesis/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Add book/ })).toHaveAttribute("href", "/admin/books/upload");
  });
});

describe("MostReadShelf", () => {
  const top = (over: Partial<TopContentRow> & { id: string; title: string }): TopContentRow => ({
    type: "book",
    coverUrl: null,
    published: true,
    language: "en",
    department: null,
    views: 10,
    prevViews: 0,
    readerOpens: 0,
    downloads: 0,
    visitors: 5,
    engagementPct: null,
    fileBroken: false,
    missing: [],
    editHref: `/admin/edit/${over.id}`,
    publicHref: `/books/${over.id}`,
    ...over,
  });

  it("ranks the collection by views and leaves news posts off the shelf", () => {
    render(
      <Wrapper>
        <MostReadShelf
          rows={[
            top({ id: "a", title: "Chemistry 12", views: 241 }),
            top({ id: "p", title: "Holiday hours", type: "post", views: 500 }),
            top({ id: "z", title: "Never opened", views: 0 }),
          ]}
          periodTitle="Last 30 days"
          reportHref="/admin?view=content"
          editable={{ book: true }}
        />
      </Wrapper>,
    );
    const shelf = screen.getByRole("list");
    expect(within(shelf).getAllByRole("listitem")).toHaveLength(1);
    // The generated cover prints the title too, inside aria-hidden artwork —
    // so ask for what assistive tech sees: one link, named by its title.
    expect(within(shelf).getByRole("link", { name: /Chemistry 12/ })).toHaveAttribute("href", "/admin/edit/a");
    expect(within(shelf).getByText("241 views")).toBeInTheDocument();
    expect(screen.queryByText("Holiday hours")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Most read · Last 30 days" })).toBeInTheDocument();
  });
});

describe("PublishingCalendar", () => {
  it("marks today, publishing days and scheduled days in words, not only colour", () => {
    render(
      <Wrapper>
        <PublishingCalendar
          publishing={{
            month: "2026-09",
            today: "2026-09-30",
            days: [
              { date: "2026-09-14", count: 3 },
              { date: "2026-09-02", count: 1 },
            ],
          }}
          scheduled={[
            {
              id: "s1",
              type: "post",
              title: "Holiday opening hours",
              at: "2026-10-02T01:00:00Z",
              editHref: "/admin/posts?edit=s1",
            },
          ]}
          scheduledAllowed
          editable={{ post: true }}
        />
      </Wrapper>,
    );
    expect(screen.getByText("2 publishing days in September 2026")).toBeInTheDocument();
    expect(screen.getByText(/Monday, September 14: 3 items published/)).toBeInTheDocument();
    expect(screen.getByText(/Wednesday, September 30: nothing published · Today/)).toBeInTheDocument();
    // 2 Oct sits in the grid's trailing week, outside the month: not
    // announced, but still listed under Coming up.
    expect(screen.getByRole("link", { name: /Holiday opening hours/ })).toHaveAttribute(
      "href",
      "/admin/posts?edit=s1",
    );
    // A month is a table: 5 weeks + the weekday header.
    expect(screen.getAllByRole("row")).toHaveLength(6);
  });

  it("says a failed scheduled read failed, and omits the list for a viewer who may see none", () => {
    const base = { month: "2026-09", today: "2026-09-30", days: [] };
    const { unmount } = render(
      <Wrapper>
        <PublishingCalendar publishing={base} scheduled={null} scheduledAllowed editable={{}} />
      </Wrapper>,
    );
    expect(screen.getByText("Scheduled items could not be loaded.")).toBeInTheDocument();
    unmount();

    render(
      <Wrapper>
        <PublishingCalendar publishing={base} scheduled={null} scheduledAllowed={false} editable={{}} />
      </Wrapper>,
    );
    expect(screen.queryByText("Coming up")).not.toBeInTheDocument();
  });
});

describe("ReadingRhythmPanel", () => {
  const week = (values: number[]) =>
    values.map((value, i) => ({ date: `2026-09-${String(7 + i).padStart(2, "0")}`, value }));

  it("names the busiest day and the weekend share", () => {
    render(
      <Wrapper>
        <ReadingRhythmPanel rhythm={weekdayRhythm(week([1, 2, 3, 4, 5, 10, 6]))} />
      </Wrapper>,
    );
    expect(screen.getByText("Saturday is the busiest day.")).toBeInTheDocument();
    expect(screen.getByText(/Weekends carry 52% of detail views/)).toBeInTheDocument();
    expect(screen.getByText("Saturday: 10")).toBeInTheDocument();
  });

  it("explains itself instead of drawing seven empty bars", () => {
    render(
      <Wrapper>
        <ReadingRhythmPanel rhythm={null} />
      </Wrapper>,
    );
    expect(screen.getByText(/at least 7 days/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("renders in Khmer without raw keys", () => {
    render(
      <Wrapper locale="km">
        <ReadingRhythmPanel rhythm={weekdayRhythm(week([1, 2, 3, 4, 5, 10, 6]))} />
      </Wrapper>,
    );
    expect(screen.getByText("ថ្ងៃដែលមានការអានច្រើនជាងគេ")).toBeInTheDocument();
    expect(screen.queryByText(/adminDashboard\./)).not.toBeInTheDocument();
  });
});
