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
// button whose reader the file route would answer with 403, and that a
// signed-in reader is never told to sign in while their state is loading.

vi.mock("@/components/ui/detail/BookmarkButton", () => ({ default: () => null }));
vi.mock("@/components/ui/books/ShareButton", () => ({ default: () => null }));
vi.mock("@/app/actions/reader-events", () => ({ recordReaderOpen: vi.fn(async () => undefined) }));
vi.mock("@/components/ui/reader/PDFViewerClient", () => ({
  default: () => createElement("div", { "data-testid": "pdf-viewer" }),
}));

const viewer = vi.hoisted(() => ({
  current: { access: null as unknown, pending: false, signedIn: false, canEdit: false },
}));
vi.mock("./useThesisAccess", () => ({ useThesisAccess: () => viewer.current }));

import AccessPanel from "./AccessPanel";
import FullTextPreview from "./FullTextPreview";

afterEach(cleanup);

const ACCESS: Record<Exclude<ThesisAccessState, "unavailable">, ThesisAccess> = {
  open: { state: "open", canRead: true, canDownload: true, blockedBy: null, rank: 40 },
  profile_incomplete: { state: "profile_incomplete", canRead: true, canDownload: false, blockedBy: null, rank: 40 },
  sign_in: { state: "sign_in", canRead: false, canDownload: false, blockedBy: null, rank: 40 },
  protected: { state: "protected", canRead: false, canDownload: false, blockedBy: "top_ten", rank: 3 },
  no_file: { state: "no_file", canRead: false, canDownload: false, blockedBy: null, rank: null },
};

function as(access: ThesisAccess, pending = false) {
  viewer.current = { access, pending, signedIn: access.state !== "sign_in", canEdit: false };
}

function withIntl(node: React.ReactNode, locale: "en" | "km" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "km" ? kmMessages : enMessages}>
      {node}
    </NextIntlClientProvider>,
  );
}

const panel = (locale: "en" | "km" = "en") =>
  withIntl(
    createElement(AccessPanel, {
      id: "r1",
      title: "A thesis",
      recordAccess: ACCESS.sign_in,
      path: "/theses/sample",
      permalink: "https://library.ptec.edu.kh/theses/sample",
      signInHref: "/auth/login?callbackUrl=%2Ftheses%2Fsample",
      contactHref: "/contact?category=other",
    }),
    locale,
  );

const fullText = () =>
  withIntl(
    createElement(FullTextPreview, {
      reportId: "r1",
      title: "A thesis",
      recordAccess: ACCESS.sign_in,
      signInHref: "/auth/login?callbackUrl=%2Ftheses%2Fsample",
    }),
  );

describe("AccessPanel — one sentence and one verb per state", () => {
  it("open: Read online first, then Download PDF", () => {
    as(ACCESS.open);
    panel();
    expect(screen.getByRole("status").textContent).toMatch(/Full text available/);
    const buttons = screen.getAllByRole("button").map((b) => b.textContent);
    expect(buttons.slice(0, 2)).toEqual(["Read online", "Download PDF"]);
  });

  it("profile_incomplete: Read online, and the profile link returns here", () => {
    as(ACCESS.profile_incomplete);
    panel();
    expect(screen.getByRole("button", { name: "Read online" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();
    const link = screen.getByRole("link", { name: "Complete profile to download" });
    expect(link.getAttribute("href")).toContain("returnTo=%2Ftheses%2Fsample");
  });

  it("sign_in: one Sign in to read link back to this record, and no read button", () => {
    as(ACCESS.sign_in);
    panel();
    expect(screen.getByRole("link", { name: "Sign in to read" }).getAttribute("href")).toBe(
      "/auth/login?callbackUrl=%2Ftheses%2Fsample",
    );
    expect(screen.queryByRole("button", { name: "Read online" })).toBeNull();
  });

  it("protected: no read or download control — the rank, the reason and a way to the library", () => {
    as(ACCESS.protected);
    panel();
    expect(screen.queryByRole("button", { name: "Read online" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/one of the 10 most-downloaded theses \(#3\)/);
    expect(screen.getByRole("link", { name: "Contact the library" }).getAttribute("href")).toBe("/contact?category=other");
  });

  it("protected by the library, not by rank: says so without inventing a rank", () => {
    as({ ...ACCESS.protected, blockedBy: "admin", rank: null });
    panel();
    expect(screen.getByText(/The library has restricted online access/)).toBeTruthy();
    expect(screen.queryByText(/most-downloaded/)).toBeNull();
  });

  it("no_file: says so, and offers to request a copy", () => {
    as(ACCESS.no_file);
    panel();
    expect(screen.getByRole("status").textContent).toMatch(/No PDF deposited yet/);
    expect(screen.getByRole("link", { name: "Request a copy" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Read online" })).toBeNull();
  });

  it("pending: a placeholder, never a Sign in shown to someone who may be signed in", () => {
    as(ACCESS.sign_in, true);
    panel();
    expect(screen.queryByRole("link", { name: "Sign in to read" })).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/Checking your access/);
  });

  it("reads in Khmer on /km", () => {
    as(ACCESS.protected);
    panel("km");
    expect(screen.getByText(kmMessages.thesisDetail.accessProtectedTitle)).toBeTruthy();
    expect(screen.getByRole("link", { name: kmMessages.thesisDetail.accessContact })).toBeTruthy();
  });
});

describe("FullTextPreview — the reader mounts only when the file route will serve it", () => {
  it("open: Open reader mounts the viewer, as does Read online elsewhere on the page", () => {
    as(ACCESS.open);
    fullText();
    fireEvent.click(screen.getByRole("button", { name: "Open reader" }));
    expect(screen.getByTestId("pdf-viewer")).toBeTruthy();
  });

  it("protected (a rank that moved since the page was cached): no viewer, even from the reader event", () => {
    as(ACCESS.protected);
    fullText();
    expect(screen.queryByRole("button", { name: "Open reader" })).toBeNull();
    window.dispatchEvent(new CustomEvent("thesis-reader-open"));
    expect(screen.queryByTestId("pdf-viewer")).toBeNull();
    expect(screen.getByText("Not available to read online")).toBeTruthy();
  });

  it("sign_in: a secondary sign-in link, never a viewer that would be answered 401", () => {
    as(ACCESS.sign_in);
    fullText();
    expect(screen.getByRole("link", { name: "Sign in to read" })).toBeTruthy();
    window.dispatchEvent(new CustomEvent("thesis-reader-open"));
    expect(screen.queryByTestId("pdf-viewer")).toBeNull();
  });
});
