import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enMessages from "@/messages/en.json";
import kmMessages from "@/messages/km.json";
import ShareButton from "./ShareButton";

// MUX-08: on a touch device Share is the phone's own share sheet; the brand
// grid is the fallback for desktops, old browsers and a refused share.

const URL_ = "https://library.ptec.edu.kh/books/foundations-of-education";
const TITLE = "Foundations of Education";

function pointer(coarse: boolean) {
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) =>
      ({
        matches: query === "(pointer: coarse)" ? coarse : false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

function stubShare(impl: () => Promise<void>, canShare?: (d: ShareData) => boolean) {
  const share = vi.fn(impl);
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
  if (canShare) Object.defineProperty(navigator, "canShare", { configurable: true, value: vi.fn(canShare) });
  return share;
}

function renderButton(locale: "en" | "km" = "en") {
  render(
    <NextIntlClientProvider locale={locale} messages={locale === "km" ? kmMessages : enMessages}>
      <ShareButton url={URL_} title={TITLE} />
    </NextIntlClientProvider>,
  );
}

const press = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
const grid = () => screen.queryByRole("dialog");

beforeEach(() => pointer(true));
afterEach(() => {
  // @ts-expect-error — test cleanup of the stubs
  delete navigator.share;
  // @ts-expect-error — test cleanup of the stubs
  delete navigator.canShare;
});

describe("ShareButton — the phone's own share sheet", () => {
  it("on a touch device, opens the native sheet with the title and URL, and no grid", async () => {
    const share = stubShare(async () => {}, () => true);
    renderButton();
    await press("Share");
    expect(share).toHaveBeenCalledWith({ title: TITLE, url: URL_ });
    expect(grid()).toBeNull();
  });

  it("a reader dismissing the native sheet is an answer: no grid follows", async () => {
    stubShare(async () => {
      throw Object.assign(new Error("dismissed"), { name: "AbortError" });
    });
    renderButton();
    await press("Share");
    expect(grid()).toBeNull();
  });

  it("any other failure (a refusal, a lost activation) falls back to the grid", async () => {
    stubShare(async () => {
      throw Object.assign(new Error("no"), { name: "NotAllowedError" });
    });
    renderButton();
    await press("Share");
    expect(grid()).not.toBeNull();
  });

  it("a desktop (fine pointer) keeps the grid and never calls the native share", async () => {
    pointer(false);
    const share = stubShare(async () => {});
    renderButton();
    await press("Share");
    expect(share).not.toHaveBeenCalled();
    expect(grid()).not.toBeNull();
  });

  it("a browser without navigator.share gets the grid", async () => {
    renderButton();
    await press("Share");
    expect(grid()).not.toBeNull();
  });

  it("canShare refusing the data means no native call", async () => {
    const share = stubShare(async () => {}, () => false);
    renderButton();
    await press("Share");
    expect(share).not.toHaveBeenCalled();
    expect(grid()).not.toBeNull();
  });

  it("every accessible name comes from the catalogue — Khmer on /km", async () => {
    pointer(false);
    renderButton("km");
    const shareKm = kmMessages.share.title;
    await press(shareKm);
    expect(screen.getByRole("dialog", { name: shareKm })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: kmMessages.nav.close })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });
});
