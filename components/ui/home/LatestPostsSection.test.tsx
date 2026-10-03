import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages/en.json";
import { resolveServerTree } from "@/components/ui/publications/article/test-utils";
import LatestPostsSection from "./LatestPostsSection";
import type { LatestPost } from "./LatestPosts";

// Strings from the real English catalogue, so a missing key fails here.
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

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

// The dialog needs a session provider; only its trigger matters here.
vi.mock("./ContributeDialog", () => ({
  default: ({ triggerContent, triggerLabel }: { triggerContent?: React.ReactNode; triggerLabel: string }) =>
    createElement("button", { type: "button" }, triggerContent ?? triggerLabel),
}));

const getLatestPostsCached = vi.hoisted(() => vi.fn());
const getContributionCountCached = vi.hoisted(() => vi.fn());
vi.mock("@/lib/home-data", () => ({ getLatestPostsCached, getContributionCountCached }));

function post(n: number): LatestPost {
  return {
    id: `p${n}`,
    title: `Post ${n}`,
    slug: `post-${n}`,
    category: "Announcement",
    excerpt: `Excerpt ${n}`,
    coverUrl: null,
    author: "Library",
    createdAt: `2026-09-${String(10 + n).padStart(2, "0")}T03:00:00.000Z`,
    views: 0,
  };
}

beforeEach(() => {
  getLatestPostsCached.mockReset();
  getContributionCountCached.mockReset();
  getContributionCountCached.mockResolvedValue(0);
});

async function renderBand(count: number) {
  getLatestPostsCached.mockResolvedValue(Array.from({ length: count }, (_, i) => post(i + 1)));
  const tree = await resolveServerTree(<LatestPostsSection />);
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {tree}
    </NextIntlClientProvider>,
  );
}

describe("LatestPostsSection — news beside the contribution card", () => {
  it.each([1, 2, 4])("renders %i post(s): one feature card, the rest as rows", async (n) => {
    const { container } = await renderBand(n);
    expect(screen.getByRole("heading", { level: 2, name: enMessages.home.latestInsights })).toBeInTheDocument();
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Post 1" })).toHaveAttribute("href", "/posts/post-1");
    const rows = container.querySelectorAll("ul li");
    expect(rows).toHaveLength(n - 1);
    // The contribution card sits beside the news, in the 8/4 grid.
    expect(container.querySelector(".lg\\:grid-cols-\\[8fr_4fr\\]")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: enMessages.home.growTitle })).toBeInTheDocument();
  });

  it("caps the band at four posts", async () => {
    const { container } = await renderBand(7);
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.querySelectorAll("ul li")).toHaveLength(3);
  });

  it("with zero posts, gives the contribution card the whole band and its heading", async () => {
    const { container } = await renderBand(0);
    expect(screen.queryByRole("heading", { name: enMessages.home.latestInsights })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: enMessages.home.growTitle })).toBeInTheDocument();
    expect(container.querySelector(".lg\\:grid-cols-\\[8fr_4fr\\]")).toBeNull();
  });

  it("opens the two existing dialogs from rows that carry their short line", async () => {
    await renderBand(1);
    expect(screen.getByRole("button", { name: /Deposit your thesis.*Finished a thesis/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Request a book.*Looking for something/ })).toBeInTheDocument();
  });

  it("states the credit line until reader submissions clear the floor", async () => {
    await renderBand(1);
    expect(screen.getByText(enMessages.home.growStatCredit)).toBeInTheDocument();
  });

  it("states the submissions figure once it clears the floor", async () => {
    getContributionCountCached.mockResolvedValue(12);
    getLatestPostsCached.mockResolvedValue([post(1)]);
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        {await resolveServerTree(<LatestPostsSection />)}
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("12 reader submissions added to the library")).toBeInTheDocument();
    expect(screen.queryByText(enMessages.home.growStatCredit)).not.toBeInTheDocument();
  });

  it("prints the date plate's day for each post", async () => {
    const { container } = await renderBand(2);
    const card = container.querySelector("article")!;
    expect(within(card as HTMLElement).getByText("11")).toBeInTheDocument();
  });
});
