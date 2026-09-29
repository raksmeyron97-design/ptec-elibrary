import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages/en.json";
import kmMessages from "@/messages/km.json";
import type { ThesisAccess, ThesisAccessState } from "@/lib/theses/access";

// What each access state DRAWS on the record page. The routes' agreement with
// the projection is proven in lib/theses/access.test.ts; this proves the page
// puts that answer on screen — above all, that a protected record shows no
// button whose reader the file route would answer with 403.

vi.mock("@/components/ui/detail/BookmarkButton", () => ({ default: () => null }));
vi.mock("@/components/ui/books/ShareButton", () => ({ default: () => null }));
vi.mock("@/components/ui/detail/CopyLinkButton", () => ({ default: () => null }));
vi.mock("@/app/actions/reader-events", () => ({ recordReaderOpen: vi.fn(async () => undefined) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/theses/sample" }));
vi.mock("@/components/ui/reader/PDFViewerClient", () => ({
  default: () => createElement("div", { "data-testid": "pdf-viewer" }),
}));

import { ThesisPrimaryActions } from "./ThesisActions";
import FullTextSection from "./FullTextSection";

afterEach(cleanup);

const ACCESS: Record<Exclude<ThesisAccessState, "unavailable">, ThesisAccess> = {
  open: { state: "open", canRead: true, canDownload: true, blockedBy: null, rank: 40 },
  profile_incomplete: { state: "profile_incomplete", canRead: true, canDownload: false, blockedBy: null, rank: 40 },
  sign_in: { state: "sign_in", canRead: false, canDownload: false, blockedBy: null, rank: 40 },
  protected: { state: "protected", canRead: false, canDownload: false, blockedBy: "top_ten", rank: 3 },
  no_file: { state: "no_file", canRead: false, canDownload: false, blockedBy: null, rank: null },
};

function withIntl(node: React.ReactNode, locale: "en" | "km" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "km" ? kmMessages : enMessages}>
      {node}
    </NextIntlClientProvider>,
  );
}

function actions(access: ThesisAccess, locale: "en" | "km" = "en") {
  return withIntl(
    createElement(ThesisPrimaryActions, {
      access,
      signInHref: "/auth/login?callbackUrl=%2Ftheses%2Fsample",
      contactHref: "/contact?category=other",
      downloadSlot: createElement("span", { "data-testid": "download-slot" }),
    }),
    locale,
  );
}

function fullText(access: ThesisAccess) {
  return withIntl(
    createElement(FullTextSection, {
      reportId: "r1",
      title: "A thesis",
      fileHref: "/api/theses/r1/file",
      access,
      contactHref: "/contact?category=other",
    }),
  );
}

describe("ThesisPrimaryActions — one verb per state", () => {
  it.each(["open", "profile_incomplete"] as const)("%s: Preview PDF plus the download control", (state) => {
    actions(ACCESS[state]);
    expect(screen.getByRole("button", { name: "Preview PDF" })).toBeTruthy();
    expect(screen.getByTestId("download-slot")).toBeTruthy();
  });

  it("sign_in: one Sign in to read link back to this record, and no second sign-in button", () => {
    actions(ACCESS.sign_in);
    const link = screen.getByRole("link", { name: "Sign in to read" });
    expect(link.getAttribute("href")).toBe("/auth/login?callbackUrl=%2Ftheses%2Fsample");
    expect(screen.queryByRole("button", { name: "Preview PDF" })).toBeNull();
    expect(screen.queryByTestId("download-slot")).toBeNull();
  });

  it("protected: no read button at all — a sentence with the rank and a way to the library", () => {
    actions(ACCESS.protected);
    expect(screen.queryByRole("button", { name: "Preview PDF" })).toBeNull();
    expect(screen.queryByTestId("download-slot")).toBeNull();
    expect(screen.getByText("Not available to read online")).toBeTruthy();
    expect(screen.getByText(/one of the 10 most-downloaded theses \(#3\)/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Contact the library" }).getAttribute("href")).toBe(
      "/contact?category=other",
    );
  });

  it("protected by the library, not by rank: says so without inventing a rank", () => {
    actions({ ...ACCESS.protected, blockedBy: "admin", rank: null });
    expect(screen.getByText(/The library has restricted online access/)).toBeTruthy();
    expect(screen.queryByText(/most-downloaded/)).toBeNull();
  });

  it("no_file: no read button; the download control speaks for the missing PDF", () => {
    actions(ACCESS.no_file);
    expect(screen.queryByRole("button", { name: "Preview PDF" })).toBeNull();
    expect(screen.getByTestId("download-slot")).toBeTruthy();
  });

  it("protected reads in Khmer on /km", () => {
    actions(ACCESS.protected, "km");
    expect(screen.getByText(kmMessages.thesisDetail.accessProtectedTitle)).toBeTruthy();
    expect(screen.getByRole("link", { name: kmMessages.thesisDetail.accessContact })).toBeTruthy();
  });
});

describe("FullTextSection — the reader mounts only when the file route will serve it", () => {
  it("open: Open reader mounts the viewer", () => {
    fullText(ACCESS.open);
    fireEvent.click(screen.getByRole("button", { name: "Open reader" }));
    expect(screen.getByTestId("pdf-viewer")).toBeTruthy();
  });

  it("protected: no Open reader, no viewer, and the reason is stated", () => {
    fullText(ACCESS.protected);
    expect(screen.queryByRole("button", { name: "Open reader" })).toBeNull();
    expect(screen.queryByTestId("pdf-viewer")).toBeNull();
    expect(screen.getByText("Not available to read online")).toBeTruthy();
  });

  it("protected: the header's reader event cannot mount the viewer either", () => {
    fullText(ACCESS.protected);
    window.dispatchEvent(new CustomEvent("thesis-reader-open"));
    expect(screen.queryByTestId("pdf-viewer")).toBeNull();
  });

  it("sign_in: a sign-in link, never a viewer that would be answered 401", () => {
    fullText(ACCESS.sign_in);
    expect(screen.getByRole("link", { name: "Sign in to read" })).toBeTruthy();
    window.dispatchEvent(new CustomEvent("thesis-reader-open"));
    expect(screen.queryByTestId("pdf-viewer")).toBeNull();
  });

  it("says 'thesis', not 'book', in the reader hint", () => {
    fullText(ACCESS.open);
    expect(screen.getByText(enMessages.thesisDetail.readerLoadHint)).toBeTruthy();
    expect(screen.queryByText(/book page/)).toBeNull();
  });
});
