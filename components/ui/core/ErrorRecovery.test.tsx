import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import kmMessages from "@/messages/km.json";
import ErrorRecovery from "./ErrorRecovery";

// The locale-aware Link needs app-router context this test doesn't set up.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

function renderRecovery(locale: "en" | "km", retry = vi.fn(), subject?: "book") {
  const error = Object.assign(new Error("database said: relation \"books\" does not exist"), { digest: "123" });
  vi.spyOn(console, "error").mockImplementation(() => {});
  // Only the namespace the component reads: the whole catalogue is ~340 KB,
  // and parsing it into the provider is what timed this test out under load.
  const messages = { errors: (locale === "km" ? kmMessages : enMessages).errors };
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ErrorRecovery error={error} retry={retry} subject={subject} logLabel="/test" />
    </NextIntlClientProvider>,
  );
  return retry;
}

describe("ErrorRecovery", () => {
  it("Try again calls retry — the action eleven boundaries used to leave dead", () => {
    const retry = renderRecovery("en");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("offers search and home as the other two ways out", () => {
    renderRecovery("en");
    expect(screen.getByRole("link", { name: /Search the library/ })).toHaveAttribute("href", "/search");
    expect(screen.getByRole("link", { name: /Go to the homepage/ })).toHaveAttribute("href", "/");
  });

  it("never shows the raw error message", () => {
    renderRecovery("en");
    expect(screen.queryByText(/does not exist/)).toBeNull();
  });

  it("names what failed, and speaks Khmer on /km", () => {
    renderRecovery("km", vi.fn(), "book");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("យើងមិនអាចផ្ទុកសៀវភៅនេះបានទេ");
    expect(screen.getByRole("button", { name: "ព្យាយាមម្ដងទៀត" })).toBeInTheDocument();
  });
});
