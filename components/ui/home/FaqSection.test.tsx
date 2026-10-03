import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import enMessages from "@/messages/en.json";
import { resolveServerTree } from "@/components/ui/publications/article/test-utils";
import FaqSection, { homeFaqNode } from "./FaqSection";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const messages = (await import("@/messages/en.json")).default;
  const tr = (namespace?: string) => createTranslator({ locale: "en", messages, namespace: namespace as never });
  return {
    getLocale: async () => "en",
    getTranslations: async (arg?: string | { namespace?: string }) => tr(typeof arg === "string" ? arg : arg?.namespace),
  };
});

vi.mock("next-intl", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-intl")>()),
  useLocale: () => "en",
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

// Signed out: the sign-up card renders.
vi.mock("@/components/providers/SessionProvider", () => ({
  useSession: () => ({ user: null, loading: false }),
}));

async function renderFaq() {
  return render(await resolveServerTree(<FaqSection />));
}

describe("FaqSection — native details accordion", () => {
  it("shows exactly the questions and answers the FAQPage node publishes", async () => {
    const { container } = await renderFaq();
    const node = await homeFaqNode("en");
    const details = [...container.querySelectorAll("details")];
    expect(details).toHaveLength(node.mainEntity.length);
    details.forEach((d, i) => {
      expect(d.querySelector("summary")).toHaveTextContent(node.mainEntity[i].name);
      // Every answer is in the HTML, open or not.
      expect(d).toHaveTextContent(node.mainEntity[i].acceptedAnswer.text);
    });
  });

  it("groups the answers under one name, with only the first open", async () => {
    const { container } = await renderFaq();
    const details = [...container.querySelectorAll("details")];
    expect(details.every((d) => d.getAttribute("name") === "home-faq")).toBe(true);
    expect(details.map((d) => d.open)).toEqual([true, false, false, false, false, false]);
  });

  it("offers the sign-up card to signed-out visitors, outside the locale scheme", async () => {
    await renderFaq();
    expect(screen.getByRole("heading", { name: enMessages.home.howStep3Title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: enMessages.home.howStep3Link })).toHaveAttribute("href", "/auth/signup");
    expect(screen.getByRole("link", { name: enMessages.home.popularSignIn })).toHaveAttribute("href", "/auth/login");
  });

  it("links the librarian contact page from the header column", async () => {
    await renderFaq();
    expect(screen.getByRole("link", { name: enMessages.home.libraryNowContact })).toHaveAttribute("href", "/contact");
  });

  it("keeps the #faq anchor the footer links to", async () => {
    const { container } = await renderFaq();
    const section = container.querySelector("section#faq");
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByRole("heading", { level: 2 })).toHaveTextContent(enMessages.home.faqTitle);
  });
});
